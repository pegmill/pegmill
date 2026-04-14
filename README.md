<p align="center">
  <img src="brand/logo.svg" alt="peg ::= mill" width="640">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/pegmill"><img src="https://img.shields.io/npm/v/pegmill.svg?color=06B6D4" alt="npm"></a>
  <a href="https://github.com/zag/pegmill/actions/workflows/ci.yml"><img src="https://github.com/zag/pegmill/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://opensource.org/licenses/Apache-2.0"><img src="https://img.shields.io/badge/license-Apache--2.0-06B6D4.svg" alt="License"></a>
</p>

<p align="center">
  The only JavaScript PEG parser generator with parametric (generic) grammar rules<br>
  Compile grammars to WebAssembly · Constrain LLM output to valid structure
</p>

Pegmill is a drop-in replacement for PEG.js 0.10.0 — existing grammars work unchanged.

## Features

- Simple and expressive PEG grammar syntax
- Integrates lexical and syntactical analysis in one grammar
- Excellent error reporting out of the box
- **Parametric grammar rules** — define reusable rule templates with `Rule<Param>` syntax
- CLI and JavaScript API
- **WASM backend** — compile grammars to WebAssembly (coming in v0.2.0)
- **LLM constrained decoding** — restrict language model output to valid grammar (v0.3.0)

> **Why PEG for LLM output?** Language models produce text token by token. Constrained decoding
> steers that process so only tokens that continue a valid parse are sampled — making hallucinated
> structure impossible. A PEG grammar doubles as both parser and output constraint, with no
> separate schema language required.

## Installation

```console
$ npm install -g pegmill
```

To use only the JavaScript API:

```console
$ npm install pegmill
```

## Quick Start

**1. Write a grammar with parametric rules** (`parens.pegjs`):

```pegjs
// One template — two parsers for the price of one
Parens<Content>
  = "(" val:Content ")" { return val; }

NumberInParens = Parens<Integer>
WordInParens   = Parens<Word>

Integer = digits:$[0-9]+ { return parseInt(digits, 10); }
Word    = $[a-zA-Z]+
```

**2. Generate a parser:**

```console
$ pegmill parens.pegjs
```

**3. Use it:**

```javascript
const parser = require("./parens");
parser.parse("(42)",    { startRule: "NumberInParens" }); // → 42
parser.parse("(hello)", { startRule: "WordInParens" });   // → "hello"
```

## Parametric Rules

Parametric rules eliminate copy-paste in grammars. Define a rule template once,
instantiate it with different arguments.

### 1. Rule references as arguments

```pegjs
// Without parametric rules you write this three times:
// IntList  = head:Integer tail:("," Integer)* { ... }
// WordList = head:Word    tail:("," Word)*    { ... }
// IdList   = head:Ident   tail:("," Ident)*   { ... }

// With Pegmill — one template:
SepList<Item, Sep>
  = head:Item tail:(Sep Item)* { return [head].concat(tail.map(t => t[1])); }

IntList  = SepList<Integer, Comma>
WordList = SepList<Word,    Comma>
CsvLine  = SepList<Field,   Comma>
TsvLine  = SepList<Field,   Tab>

Integer = digits:$[0-9]+ { return parseInt(digits, 10); }
Word    = $[a-zA-Z]+
Field   = $[^,\t\n]+
Comma   = ","
Tab     = "\t"
```

### 2. Inline expressions as arguments (character classes, quantifiers)

Pass character classes and quantifiers directly — no wrapper rule needed:

```pegjs
start
  = words:SepList<$[a-z]+,  ","> { return { words };  }
  / hex:  SepList<$[0-9a-f]+, ":"> { return { hex };    }
  / csv:  SepList<$[^,\n]+,  ","> { return { csv };    }

SepList<Item, Sep>
  = head:Item tail:(Sep Item)* { return [head].concat(tail.map(t => t[1])); }
```

```
"abc,def,ghi"    → { words: ["abc", "def", "ghi"] }
"ff:a0:1b:00"   → { hex:   ["ff", "a0", "1b", "00"] }
"foo,bar,baz"   → { csv:   ["foo", "bar", "baz"] }
```

### 3. String literals as arguments

Pass string literals to match different delimiters or keywords:

```pegjs
start  = bold / italic / code

bold   = Tag<"b">
italic = Tag<"i">
code   = Tag<"code">

// One template replaces three identical rules
Tag<T> = "<" open:T ">" content:$[^<]+ "</" T ">"
         { return { tag: open, content }; }
```

```
"<b>hello</b>"       → { tag: "b",    content: "hello" }
"<i>world</i>"       → { tag: "i",    content: "world" }
"<code>x = 1</code>" → { tag: "code", content: "x = 1" }
```

> Arguments can be rule references, character classes (`[a-z]+`), quantified expressions,
> or string literals (`"keyword"`). Sequences as arguments require a named wrapper rule.

## CLI Reference

```console
$ pegmill --version
pegmill 0.1.2

$ pegmill [options] [--] [<input_file>]
```

| Option | Description |
|--------|-------------|
| `--allowed-start-rules <rules>` | Comma-separated list of rules the parser may start from (default: first rule) |
| `--cache` | Cache intermediate results (avoids exponential time in pathological grammars) |
| `--format <fmt>` | Output format: `amd`, `commonjs`, `globals`, `umd` (default: `commonjs`) |
| `-o, --output <file>` | Output file (default: input filename with `.js` extension) |
| `--trace` | Enable parser tracing |
| `-v, --version` | Print version and exit |
| `-h, --help` | Print help and exit |

When no input file is given, standard input is used. Run `pegmill --help` for the full option list.

## JavaScript API

```javascript
const peg = require("pegmill");

// Generate a parser object directly
const parser = peg.generate('start = ("a" / "b")+');
parser.parse("aabb");  // → ["a", "a", "b", "b"]

// Generate parser source code as a string
const source = peg.generate('start = [0-9]+', { output: "source" });
```

### `peg.generate(grammar, options)`

| Option | Default | Description |
|--------|---------|-------------|
| `allowedStartRules` | `[first rule]` | Rules the parser may start from |
| `cache` | `false` | Cache intermediate results |
| `dependencies` | `{}` | Module dependencies (for `amd`/`commonjs`/`umd` formats) |
| `exportVar` | `null` | Global variable name (for `globals`/`umd` formats) |
| `format` | `"bare"` | Output format |
| `optimize` | `"speed"` | Optimize for `"speed"` or `"size"` |
| `output` | `"parser"` | `"parser"` returns an object; `"source"` returns a string |
| `plugins` | `[]` | Plugins to apply |
| `trace` | `false` | Enable tracing |

## Grammar Syntax

Pegmill uses PEG (Parsing Expression Grammar) syntax. Comments follow JavaScript
conventions (`//` and `/* */`). Whitespace between tokens is ignored.

```pegjs
ruleName "human-readable name"
  = parsingExpression
```

Common expressions: `"literal"`, `.` (any char), `[a-z]` (char class), `rule` (reference),
`e*` (zero or more), `e+` (one or more), `e?` (optional), `e1 / e2` (ordered choice),
`e1 e2` (sequence), `label:e` (label), `&e` / `!e` (lookahead), `$e` (return text),
`{ action }` (JavaScript action code).

Inside action blocks: labeled results as variables, `text()`, `location()`, `options`,
`expected(description)`, `error(message)`.

Full syntax reference: [`src/parser.pegjs`](src/parser.pegjs)

## Compatibility

- **Node.js**: 18 or later
- Generated parsers work in any environment where ES5 is available
- Generated parsers are plain JavaScript (no TypeScript declarations in v0.1.0)

## Vision

**v0.1.0** ✅ Parametric grammar rules — write reusable rule templates with `Rule<Param>` syntax

**v0.1.3** 🔧 TypeScript declarations, esbuild browser bundle, test coverage (c8)

**v0.2.0** 🔜 WASM backend — compile grammars directly to WebAssembly

**v0.3.0** 🔬 LLM constrained decoding — define valid output structure for language models

## Prior Art & Motivation

Parametric grammar rules have been a long-requested feature in the PEG.js ecosystem:

- [peg.js #45](https://github.com/pegjs/pegjs/issues/45) — *"Implement parametrizable rules"* — open since 2011 (14 years)
- [peg.js #36](https://github.com/pegjs/pegjs/issues/36) — *"Parametrize the grammar by externally-supplied variables"* — string literal args
- [peggy #634](https://github.com/peggyjs/peggy/issues/634) — *"Rule Templates"* — open feature request with community interest
- [peggy PR #337](https://github.com/peggyjs/peggy/pull/337) — template implementation attempt, closed without merge; reviewers specifically requested support for passing arbitrary expressions as arguments (not just rule references)

Pegmill implements all of the above: rule references, inline character classes, quantified expressions, and string literals as template arguments — as a shipping feature in v0.1.0.

## Independence and sponsorship

Pegmill is Apache 2.0. No VC, no corporate sponsor, no equity on anything. Development happens in the maintainer's available time alongside a consulting engagement.

Ways to help:

- Star the [repo](https://github.com/pegmill/pegmill)
- Link to Pegmill from your own project's docs
- [GitHub Sponsors](https://github.com/sponsors/zag) for one-off or recurring support

For commercial support, security audits, or grant enquiries, email `zag@cpan.org` or open an issue.

Governance and bus-factor notes live in [GOVERNANCE.md](GOVERNANCE.md).

## License and attribution

Pegmill is licensed under the **Apache License 2.0**.

This project is a fork of [PEG.js 0.10.0](https://github.com/pegjs/pegjs) by
David Majda and contributors (MIT License). The original MIT-licensed code is
preserved in `NOTICE.md` as required by Apache 2.0 section 4(d).

### Why Apache 2.0?

Apache 2.0 includes an **explicit patent grant**: contributors grant users a
royalty-free license to any patents covering their contributions. This protects
corporate users deploying Pegmill in production — they receive a patent license
automatically, without needing a separate CLA or legal agreement.

The **patent termination clause** means that if you initiate patent litigation
against Pegmill or its users based on the project's code, your patent license
terminates. This is standard open-source protection and is consistent with
licenses used by the Apache Software Foundation, Google, and many others.

See [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md) for full details.
