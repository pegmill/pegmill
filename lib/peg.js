"use strict";

var arrays  = require("./utils/arrays"),
    objects = require("./utils/objects");

var peg = {
  /* Pegmill version (uses semantic versioning). */
  VERSION: require("../package.json").version,

  GrammarError: require("./grammar-error"),
  parser:       require("./parser"),
  compiler:     require("./compiler"),

  /*
   * Generates a parser from a specified grammar and returns it.
   *
   * The grammar must be a string in the format described by the metagramar in
   * the parser.pegjs file.
   *
   * Throws |peg.parser.SyntaxError| if the grammar contains a syntax error or
   * |peg.GrammarError| if it contains a semantic error. Note that not all
   * errors are detected during the generation and some may protrude to the
   * generated parser and cause its malfunction.
   */
  generate: function(grammar, options) {
    options = options !== void 0 ? options : {};

    function convertPasses(passes) {
      var converted = {}, stage;

      for (stage in passes) {
        if (passes.hasOwnProperty(stage)) {
          converted[stage] = objects.values(passes[stage]);
        }
      }

      return converted;
    }

    options = objects.clone(options);

    var plugins = "plugins" in options ? options.plugins : [],
        config  = {
          parser: peg.parser,
          passes: convertPasses(peg.compiler.passes)
        };

    arrays.each(plugins, function(p) { p.use(config, options); });

    /* Pick code-generation backend. */
    var backend = options.backend !== void 0 ? options.backend : "js";
    if (backend !== "js" && backend !== "wasm") {
      throw new Error(
        "Unknown backend \"" + backend + "\": expected \"js\" or \"wasm\"."
      );
    }
    config.passes.generate = arrays.filter(config.passes.generate, function(p) {
      if (backend === "js")   return p !== peg.compiler.passes.generate.generateWASM;
      if (backend === "wasm") return p !== peg.compiler.passes.generate.generateJS;
      return true;
    });

    return peg.compiler.compile(
      config.parser.parse(grammar),
      config.passes,
      options
    );
  }
};

module.exports = peg;
