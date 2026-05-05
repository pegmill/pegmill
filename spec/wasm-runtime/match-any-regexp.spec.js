"use strict";

var runtime = require("../../lib/wasm-runtime");

describe("wasm backend — MATCH_ANY (.)", function() {
  var handle;
  beforeAll(async function() {
    handle = await runtime.compileGrammar("Char = .");
  });

  it("accepts any single ASCII byte", function() {
    expect(handle.parse("x")).toBe("x");
    expect(handle.parse("0")).toBe("0");
  });

  it("rejects empty input", function() {
    expect(function() { handle.parse(""); }).toThrow();
  });

  it("rejects two characters (only one consumed)", function() {
    expect(function() { handle.parse("xy"); }).toThrow();
  });
});

describe("wasm backend — MATCH_REGEXP", function() {
  describe("[a-z]", function() {
    var handle;
    beforeAll(async function() {
      handle = await runtime.compileGrammar("Letter = [a-z]");
    });

    it("matches lowercase letters", function() {
      expect(handle.parse("a")).toBe("a");
      expect(handle.parse("z")).toBe("z");
    });

    it("rejects digits and uppercase", function() {
      expect(function() { handle.parse("5"); }).toThrow();
      expect(function() { handle.parse("A"); }).toThrow();
    });

    it("rejects empty input", function() {
      expect(function() { handle.parse(""); }).toThrow();
    });
  });

  describe("[^0-9]", function() {
    var handle;
    beforeAll(async function() {
      handle = await runtime.compileGrammar("NonDigit = [^0-9]");
    });

    it("matches any non-digit", function() {
      expect(handle.parse("x")).toBe("x");
      expect(handle.parse(" ")).toBe(" ");
    });

    it("rejects digits", function() {
      expect(function() { handle.parse("3"); }).toThrow();
    });

    it("still rejects empty input even though digits are excluded", function() {
      expect(function() { handle.parse(""); }).toThrow();
    });
  });

  describe("escape sequences in char class", function() {
    var handle;
    beforeAll(async function() {
      handle = await runtime.compileGrammar("WS = [ \\t\\n\\r]");
    });

    it("matches space, tab, newline, carriage return", function() {
      expect(handle.parse(" ")).toBe(" ");
      expect(handle.parse("\t")).toBe("\t");
      expect(handle.parse("\n")).toBe("\n");
      expect(handle.parse("\r")).toBe("\r");
    });

    it("rejects letters", function() {
      expect(function() { handle.parse("a"); }).toThrow();
    });
  });
});
