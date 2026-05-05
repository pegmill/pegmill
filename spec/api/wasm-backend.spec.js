/* global peg */

"use strict";

describe("Pegmill API — backend option", function() {
  describe("when |backend| is not set", function() {
    it("defaults to the JavaScript backend and generates a parser", function() {
      var parser = peg.generate('start = "a"');

      expect(typeof parser).toBe("object");
      expect(parser.parse("a")).toBe("a");
    });
  });

  describe("when |backend| is \"js\"", function() {
    it("generates a JavaScript parser", function() {
      var parser = peg.generate('start = "a"', { backend: "js" });

      expect(typeof parser).toBe("object");
      expect(parser.parse("a")).toBe("a");
    });
  });

  describe("when |backend| is \"wasm\"", function() {
    it("refuses to return a sync parser", function() {
      expect(function() { peg.generate('start = "a"', { backend: "wasm" }); })
        .toThrowError(/wasm backend cannot return a sync parser/);
    });

    it("emits WAT source when |output| is \"source\"", function() {
      var src = peg.generate('start = "a"', { backend: "wasm", output: "source" });
      expect(typeof src).toBe("string");
      expect(src).toContain("(module");
      expect(src).toContain("(func $rule_start");
      expect(src).toContain("(func $parse");
    });
  });

  describe("when |backend| is unknown", function() {
    it("throws a clear error listing the supported values", function() {
      expect(function() { peg.generate('start = "a"', { backend: "rust" }); })
        .toThrowError(/Unknown backend "rust": expected "js" or "wasm"/);
    });
  });
});
