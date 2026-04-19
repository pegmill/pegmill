# Changelog

All notable changes to Pegmill are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Pegmill uses [semantic versioning](https://semver.org/).

Forked from [PEG.js 0.10.0](https://github.com/pegjs/pegjs/blob/master/CHANGELOG.md)
(© 2010–2016 David Majda, MIT License). PEG.js history is not reproduced here.

---

## [Unreleased]

### Added
- TypeScript declarations at `lib/peg.d.ts` covering the public API:
  `generate`, `GenerateOptions`, `Parser`, `ParseOptions`, `SyntaxError`,
  `GrammarError`, `Location`, and `Tracer`. AST internals remain untyped
  (scheduled for a later release).
- `package.json` advertises `types: "lib/peg.d.ts"` so TypeScript consumers
  pick up declarations automatically via `import pegmill from "pegmill"`.

### Changed
- Browser build switched from `browserify` + `uglify-js` to `esbuild`.
  Single bundler, faster builds, smaller minified output
  (`peg-VERSION.min.js` ≈ 118 KB vs. ~140 KB previously).
- Dropped devDependencies `browserify` and `uglify-js`; added `esbuild`.
- `prepublishOnly` script rebuilds `lib/parser.js` and runs the test suite
  before every `npm publish`, so a stale generated parser cannot ship.

---

## [0.1.2] — 2026-03-12

### Fixed
- `package.json` `files` array was missing four compiler passes introduced in 0.1.1:
  `clone-expression.js`, `expr-arg-name.js`, `instantiate-templates.js`,
  `remove-non-instantiated-templates.js` — parametric rules threw `MODULE_NOT_FOUND`
  on any installed package; this patch corrects the published file list

### Changed
- `package.json` `files` simplified from 26 explicit paths to directory globs
  (`bin/pegmill`, `examples/`, `lib/**/*.js`) — new files in `lib/` are included
  automatically without touching the manifest
- `peg.VERSION` now reads from `package.json` via `require('../package.json').version`
  instead of a hardcoded string — version has a single source of truth
- `VERSION` file removed; `package.json` is now the sole version source for all tooling
- Makefile replaced by npm scripts and two portable Node.js helper scripts
  (`scripts/build-browser.js`, `scripts/build-parser.js`) — no Make dependency required
- GitHub Actions workflows updated to use `npm run` instead of `make` targets
- Added `npm run benchmark`, `npm run serve:spec` scripts
- Removed dead config files: `.travis.yml`, `jest.config.js`, `eslint.config.js`
- `engines.node` bumped from `>=14` to `>=18` to match CI test matrix (Node 14/16 are EOL)
- `jasmine-node` (abandoned, v1.x API) replaced by `jasmine@5.x`; all custom matchers
  rewritten to Jasmine 2.x+ API (`compare(actual, ...)` returning `{pass, message}`);
  `jasmine.pp` polyfill added for Jasmine 4.x+ compatibility
- `eslint` upgraded from `2.13.1` to `8.57.1`; `no-prototype-builtins` disabled globally
  (pervasive in legacy codebase); stale inline `/* global */` directives cleaned up
- `http-server` updated from `0.9.0` to `14.1.1` — resolves 21 npm audit vulnerabilities
- Documentation updated: README Node.js requirement corrected to `>=18`; `make` commands
  replaced by `npm run` equivalents in `CONTRIBUTING.md`, `spec/README.md`,
  `benchmark/README.md`
- Added `examples/parametric.pegjs` demonstrating parametric rule templates
  (`SepList<Item, Sep>`, `Tag<T>`) with rule references and string-literal arguments

### Known Issues
- `browserify@13.1.0` has 4 low-severity transitive vulnerabilities via `elliptic`
  (chain: `browserify-sign` → `crypto-browserify` → `elliptic`); affects only the
  browser bundle build step, not generated parsers or published library code;
  fix requires a major browserify upgrade, planned for v0.2.0

---

## [0.1.1] — 2026-03-12

### Added
- Inline expressions as template arguments (R3): character classes (`[a-z]+`), quantified
  expressions, and any `SuffixedExpression` can now be passed directly as args —
  `List<[a-z]+, ",">` — without a named wrapper rule; addresses
  [peggyjs/peggy#337](https://github.com/peggyjs/peggy/pull/337) reviewer request
- String literal template arguments (R4): string literals can be passed as args —
  `Tag<"b">`, `Delimited<"{", "}">` — covering the use case from
  [pegjs/pegjs#36](https://github.com/pegjs/pegjs/issues/36)
- Multi-parameter template rules: `Rule<A, B>` syntax fully supported —
  `SepList<Item, Sep>` with both rule refs and inline expressions
- Compiler pass `remove-non-instantiated-templates`: strips template rule definitions
  from the AST after instantiation so the code generator does not emit them
- `allowedStartRules` cleanup in `remove-non-instantiated-templates`: resets start rule
  to first concrete rule when the grammar begins with a template definition
- Guard in `report-undefined-rules`: skips template rule bodies and parametric `rule_ref`
  calls resolved later by `instantiate-templates`
- Guard in `report-infinite-recursion`: skips template rule bodies and parametric calls
  to prevent false positives before instantiation
- Safe fallback in `asts.alwaysConsumesOnSuccess`: template calls and unresolved param
  refs are conservatively treated as input-consuming (avoids crashes in check passes)
- GitHub Actions CI workflow: matrix test on Node.js 18, 20, 22 (replaces `.travis.yml`)
- GitHub Actions release workflow: publishes to npm and creates GitHub Release on tag push
- `lib/compiler/passes/expr-arg-name.js`: shared utility for canonical arg name computation

### Changed
- `compiler/index.js`: `instantiateTemplates` and `removeNonInstantiatedTemplates` wired
  into the transform stage between parsing and code generation
- `clone-expression.js`: substitution now handles expression nodes (not just rule name
  strings); backward compatible with existing string-valued `paramMap`
- `instantiate-templates.js`: `paramMap` values are now expression AST nodes, enabling
  direct substitution of inline expressions and string literals

---

## [0.1.0] — 2026-02-26

### Added
- Parametric grammar rules: `Rule<Param>` syntax for reusable rule templates
- Compiler pass `clone-expression`: deep-copies AST expressions for template instantiation
- Compiler pass `instantiate-templates`: expands parametric rule references at compile time
- `rule_ref.args` structure: array of `{name, value}` objects supporting named parameters
- Parser lookahead fix: `RuleReferenceExpression` updated to prevent template definitions
  from being parsed as expression elements in preceding rules
- Renamed project from PEG.js fork to **Pegmill**; binary renamed `pegjs` → `pegmill`
- Package renamed to `pegmill` on npm; homepage: `https://github.com/zag/pegmill`
- License changed from MIT to Apache 2.0 (NOTICE.md attributes upstream MIT code)

### Changed
- `lib/peg.js` VERSION: `0.10.0` → `0.1.0`
- `package.json` `engines.node`: `>=0.10` → `>=14`

### References
- Parametric rules approach inspired by [peggyjs/peggy#337](https://github.com/peggyjs/peggy/pull/337)
  (quadristan, MIT) — reference implementation of template instantiation
- Related upstream discussion: [peggyjs/peggy#634](https://github.com/peggyjs/peggy/issues/634)

[Unreleased]: https://github.com/zag/pegmill/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/zag/pegmill/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/zag/pegmill/releases/tag/v0.1.0
