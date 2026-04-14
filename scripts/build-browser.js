"use strict";

/**
 * Builds browser bundles: browser/peg-VERSION.js (dev) and .min.js (minified).
 * Prepends copyright header. Uses browserify + uglify-js.
 */

var fs         = require("fs");
var path       = require("path");
var cp         = require("child_process");
var pkg        = require("../package.json");

var ROOT       = path.join(__dirname, "..");
var BROWSERIFY = path.join(ROOT, "node_modules", ".bin", "browserify");
var UGLIFYJS   = path.join(ROOT, "node_modules", ".bin", "uglifyjs");
var MAIN       = path.join(ROOT, "lib", "peg.js");
var BROWSER    = path.join(ROOT, "browser");

var VERSION    = pkg.version;
var DEV        = path.join(BROWSER, "peg-" + VERSION + ".js");
var MIN        = path.join(BROWSER, "peg-" + VERSION + ".min.js");

var HEADER = [
  "/*",
  " * Pegmill " + VERSION,
  " *",
  " * https://github.com/pegmill/pegmill",
  " *",
  " * Copyright (c) 2026 Aliaksandr Zahatski",
  " * Licensed under the Apache License 2.0.",
  " */"
].join("\n") + "\n";

// Ensure browser/ exists
fs.mkdirSync(BROWSER, { recursive: true });

// Remove old files for this version if present
[DEV, MIN].forEach(function(f) {
  if (fs.existsSync(f)) { fs.unlinkSync(f); }
});

// Step 1: browserify → dev bundle
var bundleResult = cp.spawnSync(
  BROWSERIFY,
  ["--standalone", "peg", MAIN],
  { encoding: "utf8" }
);

if (bundleResult.status !== 0) {
  process.stderr.write(bundleResult.stderr);
  process.exit(bundleResult.status);
}

fs.writeFileSync(DEV, HEADER + bundleResult.stdout);

// Step 2: uglify → min bundle
var uglifyResult = cp.spawnSync(
  UGLIFYJS,
  ["--mangle", "--compress", "warnings=false", "--comments", "/Copyright/", "-o", MIN, DEV],
  { stdio: "inherit" }
);

if (uglifyResult.status !== 0) {
  process.exit(uglifyResult.status);
}

console.log("Built " + path.relative(ROOT, DEV));
console.log("Built " + path.relative(ROOT, MIN));
