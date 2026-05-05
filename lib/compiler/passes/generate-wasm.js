"use strict";

/* Generates a WebAssembly parser module from the AST. Stub for now. */
function generateWASM(ast, options) {
  /* eslint no-unused-vars: 0 */
  throw new Error(
    "wasm backend is not implemented yet -- "
    + "use the default JavaScript backend or pass --backend js."
  );
}

module.exports = generateWASM;
