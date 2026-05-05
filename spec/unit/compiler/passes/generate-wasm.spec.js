"use strict";

var generateWASM = require("../../../../lib/compiler/passes/generate-wasm");
var op           = require("../../../../lib/compiler/opcodes");

/* The pass mutates ast.code in place. Build a tiny synthetic AST that
 * skips the full pegmill pipeline and just exercises the bytecode walker. */
function emit(bytecode, consts) {
  var ast = {
    rules:  [{ name: "X", bytecode: bytecode }],
    consts: consts || []
  };
  generateWASM(ast, {});
  return ast.code;
}

describe("generate-wasm — stack and position opcodes", function() {
  it("emits PUSH_CURR_POS as a stack push from $curr_pos", function() {
    var code = emit([op.PUSH_CURR_POS]);
    expect(code).toContain("(call $_stack_push (global.get $curr_pos))");
  });

  it("emits POP_CURR_POS as $curr_pos := stack_pop", function() {
    var code = emit([op.POP_CURR_POS]);
    expect(code).toContain("(global.set $curr_pos (call $_stack_pop))");
  });

  it("emits POP as a discarded stack pop", function() {
    var code = emit([op.POP]);
    expect(code).toContain("(drop (call $_stack_pop))");
  });

  it("emits POP_N n as a single stack-top decrement of n*4 bytes", function() {
    var code = emit([op.POP_N, 3]);
    expect(code).toContain("(i32.sub (global.get $stack_top) (i32.const 12))");
  });

  it("emits NIP that overwrites the slot below top and shrinks by 4", function() {
    var code = emit([op.NIP]);
    expect(code).toContain("(i32.sub (global.get $stack_top) (i32.const 8))");
    expect(code).toContain("(i32.sub (global.get $stack_top) (i32.const 4))");
  });

  it("composes multiple opcodes in sequence", function() {
    var code = emit([op.PUSH_CURR_POS, op.POP, op.POP_CURR_POS]);
    var pushIdx = code.indexOf("(call $_stack_push (global.get $curr_pos))");
    var popIdx  = code.indexOf("(drop (call $_stack_pop))");
    var popPos  = code.indexOf("(global.set $curr_pos (call $_stack_pop))");
    expect(pushIdx).toBeGreaterThan(-1);
    expect(popIdx).toBeGreaterThan(pushIdx);
    expect(popPos).toBeGreaterThan(popIdx);
  });
});
