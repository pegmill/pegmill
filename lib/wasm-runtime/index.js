"use strict";

/* Foundation runtime for the wasm parser backend.
 *
 * Exposes:
 *   buildPrelude()       -> Promise<Uint8Array>
 *     Loads prelude.wat, runs it through binaryen, returns the assembled bytes.
 *
 *   instantiate(bytes)   -> Promise<ParserHandle>
 *     Creates a WebAssembly instance and a small JS shim around it.
 *
 * binaryen is loaded lazily via dynamic import so it is only required when
 * the wasm backend is actually used.
 */

var fs   = require("fs");
var path = require("path");

var PRELUDE_WAT = path.join(__dirname, "prelude.wat");

var HEADER = Object.freeze({
  ERROR_CODE:    0x00,
  ERROR_POS:     0x04,
  ERROR_MSG_PTR: 0x08,
  ERROR_MSG_LEN: 0x0C,
  HEAP_TOP:      0x10,
  HEAP_BASE:     0x14,
  INPUT_PTR:     0x18,
  INPUT_LEN:     0x1C,
  RESULT_PTR:    0x20,
  RESULT_LEN:    0x24,
  PAGES_GROWN:   0x28
});

var ERROR_NAMES = ["ok", "parse-fail", "oom", "internal"];

async function buildPrelude() {
  return assembleWAT(fs.readFileSync(PRELUDE_WAT, "utf8"));
}

/* Assemble arbitrary WAT (prelude or codegen output) to wasm bytes. */
async function assembleWAT(wat) {
  var binaryen = (await import("binaryen")).default;
  var m = binaryen.parseText(wat);
  var F = binaryen.Features;
  m.setFeatures(
    F.BulkMemory | F.BulkMemoryOpt | F.Multivalue
    | F.SignExt | F.NontrappingFPToInt | F.MutableGlobals
  );
  if (!m.validate()) {
    throw new Error("wasm module failed validation");
  }
  binaryen.setShrinkLevel(2);
  binaryen.setOptimizeLevel(2);
  m.optimize();
  return m.emitBinary();
}

async function instantiate(bytes) {
  var result = await WebAssembly.instantiate(bytes, {});
  return new ParserHandle(result.instance);
}

/* Convenience wrapper: peg.generate to WAT, assemble, instantiate. */
async function compileGrammar(grammarSource, options) {
  var peg = require("../peg");
  var opts = Object.assign({}, options || {}, {
    backend: "wasm",
    output:  "source"
  });
  var wat = peg.generate(grammarSource, opts);
  var bytes = await assembleWAT(wat);
  return instantiate(bytes);
}

function ParserHandle(instance) {
  this.instance = instance;
  this.exports  = instance.exports;
  this.memory   = instance.exports.memory;
  this.encoder  = new TextEncoder();
  this.decoder  = new TextDecoder("utf-8", { fatal: true });
  this.exports.init();
}

ParserHandle.prototype._view = function() {
  return new DataView(this.memory.buffer);
};

ParserHandle.prototype._bytes = function() {
  return new Uint8Array(this.memory.buffer);
};

ParserHandle.prototype._readU32 = function(offset) {
  return this._view().getUint32(offset, true);
};

ParserHandle.prototype._writeString = function(text) {
  var bytes = this.encoder.encode(text);
  var len = bytes.length;
  var ptr = this.exports.alloc(len);
  if (ptr === 0) throw new Error("alloc failed (OOM)");
  /* Re-fetch byte view AFTER alloc -- memory.grow detaches prior buffers. */
  this._bytes().set(bytes, ptr);
  return { ptr: ptr, len: len };
};

ParserHandle.prototype._readString = function(ptr, len) {
  var bytes = new Uint8Array(this.memory.buffer, ptr, len);
  return this.decoder.decode(bytes.slice());
};

ParserHandle.prototype.reset = function() {
  this.exports.reset();
};

ParserHandle.prototype.setInput = function(text) {
  var range = this._writeString(text);
  this.exports.set_input(range.ptr, range.len);
  return range;
};

ParserHandle.prototype.parse = function(text) {
  this.reset();
  this.setInput(text);
  this.exports.parse();
  var code = this._readU32(HEADER.ERROR_CODE);
  if (code !== 0) {
    var pos = this._readU32(HEADER.ERROR_POS);
    var err = new Error("parse failed at position " + pos);
    err.position = pos;
    err.code = code;
    throw err;
  }
  return this._readString(
    this._readU32(HEADER.RESULT_PTR),
    this._readU32(HEADER.RESULT_LEN)
  );
};

ParserHandle.prototype.echo = function(text) {
  this.reset();
  this.setInput(text);
  this.exports.echo();
  var code = this._readU32(HEADER.ERROR_CODE);
  if (code !== 0) {
    throw new Error("echo failed: " + (ERROR_NAMES[code] || "unknown"));
  }
  return this._readString(
    this._readU32(HEADER.RESULT_PTR),
    this._readU32(HEADER.RESULT_LEN)
  );
};

ParserHandle.prototype.inspect = function() {
  return {
    heapTop:    this._readU32(HEADER.HEAP_TOP),
    heapBase:   this._readU32(HEADER.HEAP_BASE),
    inputPtr:   this._readU32(HEADER.INPUT_PTR),
    inputLen:   this._readU32(HEADER.INPUT_LEN),
    resultPtr:  this._readU32(HEADER.RESULT_PTR),
    resultLen:  this._readU32(HEADER.RESULT_LEN),
    errorCode:  this._readU32(HEADER.ERROR_CODE),
    pagesGrown: this._readU32(HEADER.PAGES_GROWN),
    memoryBytes: this.memory.buffer.byteLength
  };
};

module.exports = {
  HEADER:          HEADER,
  ERROR_NAMES:     ERROR_NAMES,
  ParserHandle:    ParserHandle,
  buildPrelude:    buildPrelude,
  assembleWAT:     assembleWAT,
  instantiate:     instantiate,
  compileGrammar:  compileGrammar
};
