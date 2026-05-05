"use strict";

/* Generates WAT source for a WebAssembly parser. The text is assembled
 * to wasm bytes by lib/wasm-runtime (binaryen, loaded lazily).
 *
 * Supported opcodes: MATCH_STRING, MATCH_ANY, MATCH_REGEXP,
 *                    ACCEPT_STRING, ACCEPT_N, FAIL,
 *                    PUSH_CURR_POS, POP_CURR_POS, POP, POP_N, NIP.
 * Anything else throws GrammarError.
 *
 * Stack values are pointers to length-prefixed string structs:
 *   [i32 len, len bytes of UTF-8].
 * Const strings live in the (data) section; ACCEPT_N allocates fresh
 * structs in the heap. The FAILED sentinel (-1) signals a failed rule.
 */

var fs   = require("fs");
var path = require("path");
var op   = require("../opcodes");
var GrammarError = require("../../grammar-error");

var PRELUDE_PATH = path.join(__dirname, "../../wasm-runtime/prelude.wat");

var DATA_BASE  = 0x40;
var STRUCT_HDR = 4;          // 4-byte length prefix
var ALIGN      = 4;

function generateWASM(ast, options) {
  /* eslint no-unused-vars: 0 */
  var pool = layoutConsts(ast.consts);
  var heapBase = roundUp(DATA_BASE + pool.totalBytes, 16);

  var prelude = fs.readFileSync(PRELUDE_PATH, "utf8");
  prelude = prelude.replace(
    /(\(global \$HEAP_BASE\s+i32\s+\(i32\.const\s+)0x40(\s*\)\s*\))/,
    "$1" + heapBase + "$2"
  );
  prelude = prelude.replace(/\)\s*$/, "");

  var startName = ast.rules[0].name;
  var classFns  = pool.classFns.join("\n");
  var ruleFns   = ast.rules.map(function(r) { return emitRule(r, pool); }).join("\n");
  var dataDecls = emitData(pool);
  var parseFn   = emitParse(startName);

  ast.code = prelude + "\n"
    + dataDecls + "\n"
    + classFns + "\n"
    + ruleFns + "\n"
    + parseFn + "\n)\n";
}

/* ----- const pool layout -------------------------------------------- */

function layoutConsts(consts) {
  /* Each recognised const claims 4 bytes for the length prefix plus its
   * UTF-8 byte length. Layout is sequential, 4-byte aligned, starting at
   * DATA_BASE. Regex consts also claim a class-test helper function;
   * everything else is recorded as "other" and only triggers an error
   * if the bytecode actually references it. */
  var entries = [];
  var classFns = [];
  var offset = DATA_BASE;

  for (var i = 0; i < consts.length; i++) {
    var c = consts[i];
    var s = parseStringLiteral(c);
    if (s !== null) {
      var bytes = utf8Bytes(s);
      entries.push({
        kind: "string", index: i,
        ptr:  offset,
        bytesPtr: offset + STRUCT_HDR,
        len:  bytes.length,
        bytes: bytes
      });
      offset = roundUp(offset + STRUCT_HDR + bytes.length, ALIGN);
      continue;
    }
    var klass = parseRegexLiteral(c);
    if (klass !== null) {
      var fnName = "$class_" + i;
      classFns.push(emitClassFn(fnName, klass, c));
      entries.push({ kind: "regex", index: i, fnName: fnName, source: c });
      continue;
    }
    entries.push({ kind: "other", index: i, raw: c });
  }
  return { entries: entries, classFns: classFns, totalBytes: offset - DATA_BASE };
}

function parseStringLiteral(src) {
  if (typeof src !== "string") return null;
  if (src.length < 2) return null;
  if (src.charAt(0) !== '"' || src.charAt(src.length - 1) !== '"') return null;
  try { return JSON.parse(src); } catch (_e) { return null; }
}

function parseRegexLiteral(src) {
  /* Pegmill stores class regexes as `/^[...]/[flags]?` source strings.
   * We decode them into { negated, ranges: [[lo, hi], ...] }. */
  if (typeof src !== "string") return null;
  var m = /^\/\^?\[(\^)?((?:\\.|[^\]\\])*)\]\/[a-z]*$/.exec(src);
  if (!m) return null;
  var negated = !!m[1];
  var inside = m[2];
  var ranges = [];
  var i = 0;
  while (i < inside.length) {
    var first = readClassChar(inside, i, src);
    var nextIp = first.next;
    if (nextIp + 1 < inside.length && inside.charAt(nextIp) === "-") {
      var second = readClassChar(inside, nextIp + 1, src);
      ranges.push([first.byte, second.byte]);
      i = second.next;
    } else {
      ranges.push([first.byte, first.byte]);
      i = nextIp;
    }
  }
  return { negated: negated, ranges: ranges };
}

function readClassChar(s, i, full) {
  if (s.charAt(i) === "\\") {
    var c = s.charAt(i + 1);
    switch (c) {
      case "0": return { byte: 0x00, next: i + 2 };
      case "b": return { byte: 0x08, next: i + 2 };
      case "t": return { byte: 0x09, next: i + 2 };
      case "n": return { byte: 0x0A, next: i + 2 };
      case "r": return { byte: 0x0D, next: i + 2 };
      case "f": return { byte: 0x0C, next: i + 2 };
      case "v": return { byte: 0x0B, next: i + 2 };
      case "\\": return { byte: 0x5C, next: i + 2 };
      case "]": return { byte: 0x5D, next: i + 2 };
      case "[": return { byte: 0x5B, next: i + 2 };
      case "-": return { byte: 0x2D, next: i + 2 };
      case "/": return { byte: 0x2F, next: i + 2 };
      case "x": {
        var hex2 = s.substring(i + 2, i + 4);
        var b = parseInt(hex2, 16);
        if (isNaN(b)) throw new GrammarError(unsupported("\\x" + hex2, full));
        if (b > 0x7F) throw new GrammarError(unsupported("\\x" + hex2 + " (multi-byte not yet)", full));
        return { byte: b, next: i + 4 };
      }
      case "u": {
        var hex4 = s.substring(i + 2, i + 6);
        var cp = parseInt(hex4, 16);
        if (isNaN(cp)) throw new GrammarError(unsupported("\\u" + hex4, full));
        if (cp > 0x7F) throw new GrammarError(unsupported("\\u" + hex4 + " (non-ASCII not yet)", full));
        return { byte: cp, next: i + 6 };
      }
      default:
        throw new GrammarError(unsupported("\\" + c, full));
    }
  }
  var code = s.charCodeAt(i);
  if (code > 0x7F) throw new GrammarError(unsupported(s.charAt(i) + " (non-ASCII)", full));
  return { byte: code, next: i + 1 };
}

function unsupported(piece, full) {
  return "wasm backend: char-class element " + piece
    + " in " + full + " not yet supported. Drop --backend wasm.";
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
      + "(got: " + (e ? e.kind : "missing") + ")."
    );
  }
  return e;
}

function getRegexEntry(pool, idx) {
  var e = pool.entries[idx];
  if (!e || e.kind !== "regex") {
    throw new GrammarError(
      "wasm backend: const #" + idx + " is not a recognised regex "
      + "(got: " + (e ? e.kind : "missing") + ")."
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
    /* Length prefix: 4-byte little-endian i32, then bytes. */
    var lenLE = new Uint8Array(4);
    lenLE[0] =  e.len        & 0xFF;
    lenLE[1] = (e.len >>> 8)  & 0xFF;
    lenLE[2] = (e.len >>> 16) & 0xFF;
    lenLE[3] = (e.len >>> 24) & 0xFF;
    lines.push(
      "  (data (i32.const " + e.ptr + ") \""
      + watEscape(lenLE) + watEscape(e.bytes) + "\")"
    );
  }
  return lines.join("\n");
}

function watEscape(bytes) {
  var out = "";
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i];
    if (b === 0x22) out += "\\\"";
    else if (b === 0x5C) out += "\\\\";
    else if (b >= 0x20 && b < 0x7F) out += String.fromCharCode(b);
    else out += "\\" + ("00" + b.toString(16)).slice(-2);
  }
  return out;
}

/* ----- class helper ------------------------------------------------- */

function emitClassFn(fnName, klass, src) {
  var test = emitClassRangeTest(klass);
  return "  (func " + fnName + " (result i32)\n"
    + "    ;; " + src + "\n"
    + "    (local $byte i32)\n"
    + "    (if (i32.ge_u (global.get $curr_pos) (i32.load (global.get $OFF_INPUT_LEN)))\n"
    + "      (then (return (i32.const 0))))\n"
    + "    (local.set $byte (i32.load8_u\n"
    + "      (i32.add (i32.load (global.get $OFF_INPUT_PTR)) (global.get $curr_pos))))\n"
    + "    " + test + "\n"
    + "  )";
}

function emitClassRangeTest(klass) {
  if (klass.ranges.length === 0) {
    return "(i32.const " + (klass.negated ? 1 : 0) + ")";
  }
  var tests = klass.ranges.map(function(r) {
    var lo = r[0], hi = r[1];
    if (lo === hi) {
      return "(i32.eq (local.get $byte) (i32.const " + lo + "))";
    }
    return "(i32.and"
      + " (i32.ge_u (local.get $byte) (i32.const " + lo + "))"
      + " (i32.le_u (local.get $byte) (i32.const " + hi + ")))";
  });
  var combined = tests.reduce(function(a, b) {
    return "(i32.or " + a + " " + b + ")";
  });
  return klass.negated ? "(i32.eqz " + combined + ")" : combined;
}

/* ----- rule + opcode emission --------------------------------------- */

function emitRule(rule, pool) {
  var body = emitBytecode(rule.bytecode, pool, "    ");
  return "  (func $rule_" + rule.name + "\n"
    + body + "\n"
    + "  )";
}

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
        + indent + "  (call $_bytes_match (i32.const " + entry.bytesPtr + ") (i32.const " + entry.len + "))\n"
        + indent + "  (then\n"
        + emitBytecode(aBlock, pool, indent + "    ") + "\n"
        + indent + "  )\n"
        + indent + "  (else\n"
        + emitBytecode(fBlock, pool, indent + "    ") + "\n"
        + indent + "  )\n"
        + indent + ")";
      return { code: src, consumed: 4 + aLen + fLen };
    }

    case op.MATCH_ANY: {
      var aLen2 = bc[ip + 1];
      var fLen2 = bc[ip + 2];
      var aBlock2 = bc.slice(ip + 3, ip + 3 + aLen2);
      var fBlock2 = bc.slice(ip + 3 + aLen2, ip + 3 + aLen2 + fLen2);

      var src2 = indent + "(if (i32.lt_u (global.get $curr_pos) (i32.load (global.get $OFF_INPUT_LEN)))\n"
        + indent + "  (then\n"
        + emitBytecode(aBlock2, pool, indent + "    ") + "\n"
        + indent + "  )\n"
        + indent + "  (else\n"
        + emitBytecode(fBlock2, pool, indent + "    ") + "\n"
        + indent + "  )\n"
        + indent + ")";
      return { code: src2, consumed: 3 + aLen2 + fLen2 };
    }

    case op.MATCH_REGEXP: {
      var rIdx = bc[ip + 1];
      var aLen3 = bc[ip + 2];
      var fLen3 = bc[ip + 3];
      var aBlock3 = bc.slice(ip + 4, ip + 4 + aLen3);
      var fBlock3 = bc.slice(ip + 4 + aLen3, ip + 4 + aLen3 + fLen3);
      var rentry = getRegexEntry(pool, rIdx);

      var src3 = indent + "(if (call " + rentry.fnName + ")\n"
        + indent + "  (then\n"
        + emitBytecode(aBlock3, pool, indent + "    ") + "\n"
        + indent + "  )\n"
        + indent + "  (else\n"
        + emitBytecode(fBlock3, pool, indent + "    ") + "\n"
        + indent + "  )\n"
        + indent + ")";
      return { code: src3, consumed: 4 + aLen3 + fLen3 };
    }

    case op.ACCEPT_STRING: {
      var asIdx = bc[ip + 1];
      var asEntry = getStringEntry(pool, asIdx);
      var srcAS = indent + "(call $_stack_push (i32.const " + asEntry.ptr + "))\n"
        + indent + "(global.set $curr_pos\n"
        + indent + "  (i32.add (global.get $curr_pos) (i32.const " + asEntry.len + ")))";
      return { code: srcAS, consumed: 2 };
    }

    case op.ACCEPT_N: {
      var n = bc[ip + 1];
      var srcAN = indent + "(call $_stack_push (call $_accept_n (i32.const " + n + ")))";
      return { code: srcAN, consumed: 2 };
    }

    case op.FAIL: {
      var srcF = indent + "(call $_stack_push (global.get $FAILED))";
      return { code: srcF, consumed: 2 };
    }

    case op.PUSH_CURR_POS: {
      return {
        code: indent + "(call $_stack_push (global.get $curr_pos))",
        consumed: 1
      };
    }

    case op.POP_CURR_POS: {
      return {
        code: indent + "(global.set $curr_pos (call $_stack_pop))",
        consumed: 1
      };
    }

    case op.POP: {
      return {
        code: indent + "(drop (call $_stack_pop))",
        consumed: 1
      };
    }

    case op.POP_N: {
      var nPop = bc[ip + 1];
      return {
        code: indent + "(global.set $stack_top\n"
            + indent + "  (i32.sub (global.get $stack_top) (i32.const " + (nPop * 4) + ")))",
        consumed: 2
      };
    }

    case op.NIP: {
      /* stack: [..., A, B] -> [..., B]. Overwrite slot below top with top, drop top. */
      return {
        code: indent + "(i32.store\n"
            + indent + "  (i32.sub (global.get $stack_top) (i32.const 8))\n"
            + indent + "  (i32.load (i32.sub (global.get $stack_top) (i32.const 4))))\n"
            + indent + "(global.set $stack_top\n"
            + indent + "  (i32.sub (global.get $stack_top) (i32.const 4)))",
        consumed: 1
      };
    }

    default:
      throw new GrammarError(
        "wasm backend: opcode #" + code + " not yet supported."
      );
  }
}

/* ----- parse entry -------------------------------------------------- */

function emitParse(startRuleName) {
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
    + "            (i32.store (global.get $OFF_RESULT_PTR)\n"
    + "              (i32.add (local.get $top) (i32.const " + STRUCT_HDR + ")))\n"
    + "            (i32.store (global.get $OFF_RESULT_LEN)\n"
    + "              (i32.load (local.get $top)))))))\n"
    + "  )";
}

module.exports = generateWASM;
