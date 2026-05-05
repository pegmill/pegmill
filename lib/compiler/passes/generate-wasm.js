"use strict";

/* Generates WAT source for a WebAssembly parser. The text is assembled
 * to wasm bytes by lib/wasm-runtime (binaryen, loaded lazily).
 *
 * Supported opcodes: MATCH_STRING, ACCEPT_STRING, FAIL.
 * Anything else throws GrammarError.
 */

var fs   = require("fs");
var path = require("path");
var op   = require("../opcodes");
var GrammarError = require("../../grammar-error");

var PRELUDE_PATH = path.join(__dirname, "../../wasm-runtime/prelude.wat");

function generateWASM(ast, options) {
  /* eslint no-unused-vars: 0 */
  var pool = layoutConsts(ast.consts);
  var heapBase = roundUp(0x40 + pool.totalBytes, 16);

  var prelude = fs.readFileSync(PRELUDE_PATH, "utf8");
  prelude = prelude.replace(
    /(\(global \$HEAP_BASE\s+i32\s+\(i32\.const\s+)0x40(\s*\)\s*\))/,
    "$1" + heapBase + "$2"
  );
  prelude = prelude.replace(/\)\s*$/, "");

  var startName = ast.rules[0].name;
  var ruleFns   = ast.rules.map(function(r) { return emitRule(r, pool); }).join("\n");
  var dataDecls = emitData(pool);
  var parseFn   = emitParse(startName);

  ast.code = prelude + "\n"
    + dataDecls + "\n"
    + ruleFns + "\n"
    + parseFn + "\n)\n";
}

/* ----- const pool layout -------------------------------------------- */

function layoutConsts(consts) {
  /* pegmill stores const entries as raw JS source strings.
   * For now we recognise the simple `"..."` shape (no escapes other
   * than the standard JSON ones) and lay each one out as raw UTF-8 bytes
   * in linear memory starting at 0x40. Each entry gets a fresh address;
   * we don't dedupe.
   */
  var entries = [];
  var offset = 0x40;
  for (var i = 0; i < consts.length; i++) {
    var c = consts[i];
    var s = parseStringLiteral(c);
    if (s !== null) {
      var bytes = utf8Bytes(s);
      entries.push({ kind: "string", index: i, ptr: offset, len: bytes.length, bytes: bytes });
      offset += bytes.length;
    } else {
      entries.push({ kind: "other", index: i, raw: c });
    }
  }
  return { entries: entries, totalBytes: offset - 0x40 };
}

function parseStringLiteral(src) {
  if (typeof src !== "string") return null;
  if (src.length < 2) return null;
  if (src.charAt(0) !== '"' || src.charAt(src.length - 1) !== '"') return null;
  /* Reuse JSON.parse for canonical escapes. Pegmill's string consts come
   * straight from grammar literals, which use the same escape set. */
  try {
    return JSON.parse(src);
  } catch (_e) {
    return null;
  }
}

function utf8Bytes(s) {
  return new Uint8Array(Buffer.from(s, "utf-8"));
}

function roundUp(n, align) {
  return (n + align - 1) & ~(align - 1);
}

function getStringEntry(pool, idx) {
  var e = pool.entries[idx];
  if (!e || e.kind !== "string") {
    throw new GrammarError(
      "wasm backend: const #" + idx + " is not a string literal "
      + "(got: " + (e ? e.kind : "missing") + "). "
      + "Drop --backend wasm or simplify the grammar."
    );
  }
  return e;
}

/* ----- data section -------------------------------------------------- */

function emitData(pool) {
  var lines = [];
  for (var i = 0; i < pool.entries.length; i++) {
    var e = pool.entries[i];
    if (e.kind !== "string") continue;
    lines.push("  (data (i32.const " + e.ptr + ") \"" + watEscape(e.bytes) + "\")");
  }
  return lines.join("\n");
}

function watEscape(bytes) {
  /* WAT data strings accept printable ASCII as-is and \xx for everything
   * else. Escape the safe subset to keep the source readable. */
  var out = "";
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i];
    if (b === 0x22) out += "\\\"";       // "
    else if (b === 0x5C) out += "\\\\";  // \
    else if (b >= 0x20 && b < 0x7F) out += String.fromCharCode(b);
    else out += "\\" + ("00" + b.toString(16)).slice(-2);
  }
  return out;
}

/* ----- rule + opcode emission --------------------------------------- */

function emitRule(rule, pool) {
  var body = emitBytecode(rule.bytecode, pool, "    ");
  return "  (func $rule_" + rule.name + "\n"
    + body + "\n"
    + "  )";
}

/* Walks a bytecode array, recursing into IF / WHILE / MATCH branches.
 * Emits indented WAT lines for each opcode it recognises. */
function emitBytecode(bc, pool, indent) {
  var out = [];
  var ip = 0;
  while (ip < bc.length) {
    var step = emitOpcode(bc, ip, pool, indent);
    out.push(step.code);
    ip += step.consumed;
  }
  return out.join("\n");
}

function emitOpcode(bc, ip, pool, indent) {
  var code = bc[ip];

  switch (code) {
    case op.MATCH_STRING: {
      var sIdx = bc[ip + 1];
      var aLen = bc[ip + 2];
      var fLen = bc[ip + 3];
      var aBlock = bc.slice(ip + 4, ip + 4 + aLen);
      var fBlock = bc.slice(ip + 4 + aLen, ip + 4 + aLen + fLen);
      var entry  = getStringEntry(pool, sIdx);

      var src = indent + "(if\n"
        + indent + "  (call $_bytes_match (i32.const " + entry.ptr + ") (i32.const " + entry.len + "))\n"
        + indent + "  (then\n"
        + emitBytecode(aBlock, pool, indent + "    ") + "\n"
        + indent + "  )\n"
        + indent + "  (else\n"
        + emitBytecode(fBlock, pool, indent + "    ") + "\n"
        + indent + "  )\n"
        + indent + ")";

      return { code: src, consumed: 4 + aLen + fLen };
    }

    case op.ACCEPT_STRING: {
      var sIdx2 = bc[ip + 1];
      var entry2 = getStringEntry(pool, sIdx2);
      var src2 = indent + "(call $_stack_push (i32.const " + entry2.ptr + "))\n"
        + indent + "(global.set $curr_pos\n"
        + indent + "  (i32.add (global.get $curr_pos) (i32.const " + entry2.len + ")))";
      return { code: src2, consumed: 2 };
    }

    case op.FAIL: {
      /* For now we only push the FAILED sentinel. Expectation tracking
       * (peg$silentFails / peg$maxFailExpected) is deferred. */
      var src3 = indent + "(call $_stack_push (global.get $FAILED))";
      return { code: src3, consumed: 2 };
    }

    default:
      throw new GrammarError(
        "wasm backend: opcode #" + code + " not yet supported. "
        + "Drop --backend wasm or wait for a later phase."
      );
  }
}

/* ----- parse entry -------------------------------------------------- */

function emitParse(startRuleName) {
  /* Parse stack pre-allocated to 64 KB. Enough for shallow grammars;
   * deeper ones will need a grow path -- revisit when we hit the limit. */
  var STACK_SIZE = 0x10000;
  return "  (func $parse (export \"parse\")\n"
    + "    (local $top i32)\n"
    + "    (global.set $curr_pos (i32.const 0))\n"
    + "    (global.set $stack_bottom (call $alloc (i32.const " + STACK_SIZE + ")))\n"
    + "    (global.set $stack_top    (global.get $stack_bottom))\n"
    + "    (call $rule_" + startRuleName + ")\n"
    + "    (local.set $top (call $_stack_pop))\n"
    + "    (if (i32.eq (local.get $top) (global.get $FAILED))\n"
    + "      (then\n"
    + "        (i32.store (global.get $OFF_ERROR_CODE) (i32.const 1))\n"
    + "        (i32.store (global.get $OFF_ERROR_POS)  (global.get $curr_pos)))\n"
    + "      (else\n"
    + "        (if (i32.lt_u (global.get $curr_pos)\n"
    + "                      (i32.load (global.get $OFF_INPUT_LEN)))\n"
    + "          (then\n"
    + "            (i32.store (global.get $OFF_ERROR_CODE) (i32.const 1))\n"
    + "            (i32.store (global.get $OFF_ERROR_POS)  (global.get $curr_pos)))\n"
    + "          (else\n"
    + "            (i32.store (global.get $OFF_ERROR_CODE) (i32.const 0))\n"
    + "            (i32.store (global.get $OFF_RESULT_PTR) (local.get $top))\n"
    + "            (i32.store (global.get $OFF_RESULT_LEN) (global.get $curr_pos))))))\n"
    + "  )";
}

module.exports = generateWASM;
