"use strict";

var runtime = require("../../lib/wasm-runtime");

describe("wasm-runtime — foundation prelude", function() {
  /* Build the prelude once for the whole suite. */
  var bytes;

  beforeAll(async function() {
    bytes = await runtime.buildPrelude();
  });

  it("assembles to under 1 KB", function() {
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBeGreaterThan(0);
    expect(bytes.byteLength).toBeLessThan(1024);
  });

  describe("instantiated handle", function() {
    var handle;

    beforeEach(async function() {
      handle = await runtime.instantiate(bytes);
    });

    it("starts with the heap pointer at the heap base", function() {
      var info = handle.inspect();
      expect(info.heapBase).toBe(0x40);
      expect(info.heapTop).toBe(0x40);
      expect(info.errorCode).toBe(0);
    });

    it("echoes ASCII back", function() {
      expect(handle.echo("hello")).toBe("hello");
    });

    it("echoes the empty string", function() {
      expect(handle.echo("")).toBe("");
    });

    it("echoes UTF-8 with multi-byte chars", function() {
      var input = "Привет, 你好, 🚀";
      expect(handle.echo(input)).toBe(input);
    });

    it("grows memory on inputs larger than the initial page", function() {
      var input = "X".repeat(100 * 1024);
      var before = handle.inspect();
      var out = handle.echo(input);
      var after = handle.inspect();
      expect(out).toBe(input);
      expect(after.memoryBytes).toBeGreaterThan(before.memoryBytes);
      expect(after.pagesGrown).toBeGreaterThan(0);
    });

    it("reuses memory across reset", function() {
      handle.echo("a".repeat(50 * 1024));
      var afterFirst = handle.inspect();
      handle.echo("b".repeat(50 * 1024));
      var afterSecond = handle.inspect();
      expect(afterSecond.memoryBytes).toBe(afterFirst.memoryBytes);
    });
  });
});
