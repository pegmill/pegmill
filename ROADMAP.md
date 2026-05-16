# Roadmap

> Last updated: 2026-05-08

Pegmill is a PEG parser generator for TypeScript and JavaScript. The roadmap reflects one strategic bet: PEG grammars as LLM output constraints. The TypeScript-native stack for a space where Python has Outlines and C++ has XGrammar.

## Where we are

| Phase | Status | Timeline |
|---|:-:|---|
| Phase 1. Parametric rules | shipped through v0.1.3 | 2026-04 |
| Phase 2. WASM backend | in progress, foundation + matcher codegen merged | preview Q3 2026 |
| Phase 3a. `@dispatch` directive | designed, build in queue | after Phase 2 preview |
| Phase 3b. `@pratt` directive | deferred | on demand, likely 2027 |
| Phase 4. LLM constrained decoding | flagship research | 4.1 PoC in late 2026 |

## Phase 1. Parametric rules (shipped)

Released on npm as `pegmill@0.1.2` (parametric rules) and `pegmill@0.1.3` (release engineering). What landed:

- Parametric rules: `Rule<X> = "(" X ")"`. One template, many parsers.
- Inline expression arguments: `List<[a-z]+, ",">`
- String literal arguments: `Tag<"b">`
- Drop-in compatibility with PEG.js 0.10.0
- TypeScript declarations at `lib/peg.d.ts` for the public API
- esbuild browser bundle (replaces browserify + uglify)
- `prepublishOnly` hook rebuilds the generated parser and runs the test suite before publish
- `c8` line/branch/function coverage at ~94%
- CI matrix on Node 18, 20, 22
- 1150 spec tests passing

First PEG parser generator for JavaScript to ship parametric rules as a first-class feature.

## Phase 2. WASM backend

Goal: compile PEG grammars to WebAssembly so one source deploys to Node, Deno, Bun, and the browser.

Constrained decoding (Phase 4) applies grammar checks per token during LLM generation. A native JS runtime pays interpreter cost on every step; WASM closes that gap. WASM is also the shortest path to sharing grammars with Deno or browser clients without platform-specific packaging.

Status (2026-05-08): foundation runtime and matcher codegen are merged on `main` as opt-in `--backend wasm` / `peg.generate(grammar, { backend: "wasm", output: "source" })`. See `[Unreleased]` in [CHANGELOG.md](./CHANGELOG.md). Control-flow opcodes (`IF_*`, `WHILE_NOT_ERROR`, `RULE`, `CALL`) currently throw `GrammarError` and remain on the JS backend.

Architectural decisions, locked during the spike:

- Raw WASM core, no Component Model. Browsers do not run components natively today; one `.wasm` file plus a thin TS shim runs identically on browser, Node, Electron, Bun, Deno.
- ABI surface kept narrow: 6 + ~7 exports, 0 imports for the default configuration.
- Toolchain: hand-written WAT prelude (~150–200 lines) plus IR codegen via [binaryen](https://www.npmjs.com/package/binaryen) (build-time only, lazily loaded). One added dependency, no Rust/wasm-pack runtime, no AssemblyScript GC indirection.
- Tree-builder VM in WASM (14 ops) replaces about 97% of action and predicate sites for representative grammars; the remaining few use host-import callbacks.
- Size projection on a representative grammar (the Podlite parser, 108 rules): 55–130 KB compiled module, against a 200 KB target. Headroom retained for Phase 3 directive expansion.

Remaining subtasks: control-flow codegen → AST emission → test parity (1600+ Podlite tests via WASM) → size optimisation → benchmarks and the runtime-threshold decision for the JS/WASM hybrid path. Phase 2 ships in preview when test parity holds.

Watch items:

- [Ohm v18](https://ohmjs.org/) (March 2026) — closest analogue. Adopted an AssemblyScript runtime + TypeScript codegen for 22–50× speedup on the recognizer side. Recognizer-only: semantic actions stay in JS post-parse. Pegmill compiling actions in WASM is the load-bearing difference for per-token use.
- WASM boundary overhead. Measured in three independent studies, real but tolerable for batch and per-token use cases.

## Phase 3a. `@dispatch` directive

Goal: table-driven choice routing for grammars with many variants. Reduces rule attempts by roughly 4.7x on high-branching grammars.

This matters for Phase 4 specifically. Constrained decoding checks every token against the grammar; without dispatch, rule-attempt growth dominates per-token cost. With dispatch, per-token overhead stays acceptable.

Specification draft is internal. Public API finalises before build.

## Phase 3b. `@pratt` directive

Goal: operator-precedence parsing for expression-heavy languages.

Deferred. PEG handles most grammars without it; `@pratt` matters specifically for arithmetic, SQL, and similar expression languages. It ships when a concrete use case surfaces, either from the maintainer's own work or from community request. Not blocking Phase 4.

## Phase 4. LLM constrained decoding (flagship)

Goal: turn a PEG grammar into a per-token constraint for an open-weight language model, so generated output is syntactically valid by construction.

Market context:

- OpenAI's Structured Outputs (August 2024) validated the demand. 100% schema adherence vs. ~76% via post-hoc validation.
- Anthropic does not expose a logit API, so Claude is out of scope for now.
- Open-weight models (Gemma, Qwen, GLM) expose logits, making grammar constraints possible.

Comparable solutions today:

| Project | Language | Grammar family |
|---|---|---|
| Outlines | Python | regex + Lark CFG |
| LMQL | Python, TS | declarative DSL |
| llama.cpp GBNF | C++ | BNF extension |
| XGrammar | C++ with Python bindings; JS via emscripten build (not on npm) | pushdown CFG |
| Pegmill Phase 4 | TypeScript, WASM, `npm install pegmill` | PEG + directive extensions |

Pegmill is the only install-from-npm PEG option in this space. XGrammar ships TypeScript bindings in-tree, but requires an emsdk build — no published npm package as of this writing.

Planned milestones:

- 4.0. Research and PoC: demo parser with Gemma locally, measure per-token overhead.
- 4.1. Base constraint engine, `node-llama-cpp` integration.
- 4.2. Grammar optimisations for constraint use, leveraging `@dispatch` from 3a.
- 4.3. Public API and documentation.

Window of opportunity: 12 to 18 months before the TypeScript niche fills in.

## A note on directive extensions

Pegmill is PEG-based at its core. `@dispatch`, `@pratt`, and the future `@recover` are local escape hatches for sub-problems where pure PEG is a poor fit: expression precedence, high-branching dispatch, error recovery. They plug into PEG rules rather than replacing the algorithm. Grammars remain PEG-compatible; directives add capability without changing the foundation.

## What is not on the roadmap

- Browser-first playground library. Covered by chevrotain, nearley.
- Compiler backends for JVM or .NET. Off-focus.
- Generic PEG marketing. Tree-sitter dominates that category.
- Hosted parser-as-a-service. Compute is cheap.

## Funding and development model

Development happens in the maintainer's available time alongside a consulting engagement. The roadmap is not a fixed quarterly commitment. Phase 2 lands when it lands, conditional on real use. Milestones shift with external signals, not calendar pressure.

For grants, security audits, or enterprise support: see [SECURITY.md](SECURITY.md) and open an issue on the main repo.

## How this document evolves

The roadmap updates when a phase ships or enters preview, when a watch item materialises (for example, a competitor shipping a comparable stack), or when a community use case unlocks a deferred directive. Date of last update sits at the top of this file. Major strategy shifts also go into `CHANGELOG.md`.
