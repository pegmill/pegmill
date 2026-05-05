"use strict";

var runtime = require("../../lib/wasm-runtime");

describe("wasm backend — string literal matchers", function() {
  describe("Hello = \"hello\"", function() {
    var handle;

    beforeAll(async function() {
      handle = await runtime.compileGrammar("Hello = \"hello\"");
    });

    it("accepts the exact input", function() {
      expect(handle.parse("hello")).toBe("hello");
    });

    it("rejects a different word and reports position 0", function() {
      var caught = null;
      try { handle.parse("world"); } catch (e) { caught = e; }
      expect(caught).not.toBeNull();
      expect(caught.position).toBe(0);
    });

    it("rejects trailing input after a match", function() {
      var caught = null;
      try { handle.parse("hello!"); } catch (e) { caught = e; }
      expect(caught).not.toBeNull();
      expect(caught.position).toBe(5);
    });

    it("rejects empty input", function() {
      var caught = null;
      try { handle.parse(""); } catch (e) { caught = e; }
      expect(caught).not.toBeNull();
    });
  });

  describe("non-ASCII literal", function() {
    var handle;

    beforeAll(async function() {
      handle = await runtime.compileGrammar("Greet = \"привет\"");
    });

    it("matches multi-byte UTF-8 input byte-for-byte", function() {
      expect(handle.parse("привет")).toBe("привет");
    });

    it("rejects a similar but different multi-byte string", function() {
      var caught = null;
      try { handle.parse("пока"); } catch (e) { caught = e; }
      expect(caught).not.toBeNull();
    });
  });
});
