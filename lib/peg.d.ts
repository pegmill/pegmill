// Type declarations for Pegmill public API.
// Minimal scope (v0.1.3): generate, Parser/ParseOptions, SyntaxError, GrammarError.
// AST internals and compiler passes remain untyped in this release.

export = pegmill;

declare namespace pegmill {
  /** Pegmill version, read from package.json. */
  const VERSION: string;

  /**
   * Compile a grammar string into a parser instance (default) or a parser
   * source string (when `output: "source"`).
   *
   * Throws {@link pegmill.parser.SyntaxError} if the grammar itself has a
   * syntax error, and {@link pegmill.GrammarError} for semantic errors.
   */
  function generate(
    grammar: string,
    options?: GenerateOptions & { output?: "parser" }
  ): Parser;
  function generate(
    grammar: string,
    options: GenerateOptions & { output: "source" }
  ): string;

  /** Options accepted by {@link pegmill.generate}. */
  interface GenerateOptions {
    /** Whether to return a parser instance (default) or its source code. */
    output?: "parser" | "source";

    /** Module format of the generated source (only meaningful with `output: "source"`). */
    format?: "bare" | "commonjs" | "amd" | "globals" | "umd";

    /** Rule names allowed as the starting rule. Defaults to `[first rule]`. */
    allowedStartRules?: string[];

    /** Generate memoizing parser. Default `false`. */
    cache?: boolean;

    /** Emit tracing hooks. Default `false`. */
    trace?: boolean;

    /** Optimise generated code for runtime speed or output size. Default `"speed"`. */
    optimize?: "speed" | "size";

    /** Required modules for non-`bare` formats: `{ name: requirePath }`. */
    dependencies?: Record<string, string>;

    /** Global variable name for the `globals` / `umd` formats. */
    exportVar?: string | null;

    /** Compiler plugins. Each plugin mutates `config` and `options` via `use(config, options)`. */
    plugins?: Plugin[];
  }

  /** Generator plugin contract. See the Pegmill docs for details. */
  interface Plugin {
    use(
      config: { parser: unknown; passes: Record<string, unknown[]> },
      options: GenerateOptions
    ): void;
  }

  /** A parser produced by {@link pegmill.generate}. */
  interface Parser {
    /**
     * Parse `input` with the default start rule (or `options.startRule`).
     * Throws {@link Parser.SyntaxError} on mismatch.
     *
     * The return type is grammar-specific; the declaration stays `unknown` at
     * the library boundary so callers can narrow or cast as their grammar
     * requires.
     */
    parse(input: string, options?: ParseOptions): unknown;

    /** Parser-level `SyntaxError` class, thrown by {@link Parser.parse}. */
    SyntaxError: SyntaxErrorConstructor;
  }

  /** Options for {@link Parser.parse}. */
  interface ParseOptions {
    /** Name of the rule to start from. Must be listed in `allowedStartRules`. */
    startRule?: string;

    /** Custom tracer. Only honoured when the parser was generated with `trace: true`. */
    tracer?: Tracer;
  }

  /** Tracer contract for `trace: true` parsers. */
  interface Tracer {
    trace(event: TraceEvent): void;
  }

  /** Events emitted by traced parsers. */
  interface TraceEvent {
    type: "rule.enter" | "rule.match" | "rule.fail";
    rule: string;
    location: Location;
    result?: unknown;
  }

  /** A source-code range reported by parser errors and `location()`. */
  interface Location {
    start: Position;
    end: Position;
  }

  /** A single position within the parsed input. */
  interface Position {
    offset: number;
    line: number;
    column: number;
  }

  /** Expected item reported in a {@link Parser.SyntaxError}. */
  interface Expectation {
    type: "literal" | "class" | "any" | "end" | "other";
    text?: string;
    description?: string;
  }

  /** Constructor for parser-level syntax errors. */
  interface SyntaxErrorConstructor {
    new (
      message: string,
      expected: Expectation[] | null,
      found: string | null,
      location: Location
    ): SyntaxError;

    /** Build a human-readable message from `expected` / `found`. */
    buildMessage(expected: Expectation[], found: string | null): string;
  }

  /** Parser-level syntax error. */
  interface SyntaxError extends Error {
    name: "SyntaxError";
    message: string;
    expected: Expectation[] | null;
    found: string | null;
    location: Location;
  }

  /** Grammar-level semantic error. Thrown by {@link pegmill.generate}. */
  class GrammarError extends Error {
    constructor(message: string, location?: Location);
    name: "GrammarError";
    message: string;
    location?: Location;
  }

  /** Internal parser used to build the grammar AST. Not part of the stable API. */
  const parser: {
    parse(input: string): unknown;
    SyntaxError: SyntaxErrorConstructor;
  };

  /** Compiler entry point. Public surface is intentionally minimal in v0.1.3. */
  const compiler: {
    compile(ast: unknown, passes: Record<string, unknown[]>, options?: GenerateOptions): Parser | string;
    passes: Record<string, Record<string, unknown>>;
  };
}
