"use strict";

/**
 * Builds browser bundles via esbuild:
 *   browser/peg-VERSION.js     — dev bundle
 *   browser/peg-VERSION.min.js — minified bundle
 *
 * Both files carry the Apache 2.0 copyright header.
 */

var fs      = require("fs");
var path    = require("path");
var esbuild = require("esbuild");
var pkg     = require("../package.json");

var ROOT    = path.join(__dirname, "..");
var MAIN    = path.join(ROOT, "lib", "peg.js");
var BROWSER = path.join(ROOT, "browser");
var DEV     = path.join(BROWSER, "peg-" + pkg.version + ".js");
var MIN     = path.join(BROWSER, "peg-" + pkg.version + ".min.js");

var banner = [
  "/*",
  " * Pegmill " + pkg.version,
  " *",
  " * https://github.com/pegmill/pegmill",
  " *",
  " * Copyright (c) 2026 Aliaksandr Zahatski",
  " * Licensed under the Apache License 2.0.",
  " */"
].join("\n");

fs.mkdirSync(BROWSER, { recursive: true });

var common = {
  entryPoints: [MAIN],
  bundle:      true,
  platform:    "browser",
  globalName:  "peg",
  target:      "es2015",
  banner:      { js: banner },
  legalComments: "inline"
};

esbuild.buildSync(Object.assign({}, common, { outfile: DEV }));
esbuild.buildSync(Object.assign({}, common, { outfile: MIN, minify: true }));

console.log("Built " + path.relative(ROOT, DEV));
console.log("Built " + path.relative(ROOT, MIN));
