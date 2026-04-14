# Security Policy

Pegmill is a parser generator. Its security surface is narrower than a runtime, but real. Generated parsers process user-supplied input, and any bug in the generator propagates to every grammar that uses it.

## Supported versions

| Version | Supported |
|---------|:---:|
| 0.1.x   | yes |
| < 0.1   | no  |

Pegmill is pre-1.0. Breaking changes can land in minor releases. Security fixes are backported to the latest `0.1.x` only.

## Reporting a vulnerability

Please do not open a public issue for security reports.

Email the maintainer at `zag@cpan.org` with subject `[pegmill security]`. Include:

- Affected version or versions
- Reproduction steps or a proof-of-concept grammar
- Impact assessment: crash, incorrect parse, resource exhaustion, codegen injection
- Your preferred disclosure timeline

### Response timeline

| Stage | Target |
|---|---|
| Acknowledgement | 72 hours |
| Initial triage | 7 days |
| Fix or mitigation | 30 days for high or critical, 90 days otherwise |
| Public disclosure | after fix release, or 90 days, whichever comes first |

This is a one-maintainer project. Timelines are best-effort. For contractual guarantees, see the enterprise support note below.

## Threat model

In scope:

- Codegen bugs that produce parsers with memory-safety issues in the target runtime
- Grammar features that enable denial-of-service (exponential backtracking, unbounded memoization)
- Directive extensions (`@dispatch`, future `@pratt`, `@recover`), correctness under adversarial input
- Supply-chain integrity of the `pegmill` npm package

Out of scope:

- Vulnerabilities in user-written grammars. That is the user's responsibility.
- Upstream Node.js, npm, or runtime target bugs.
- Theoretical parse-time complexity of arbitrary PEG grammars. PEG is O(n) when memoized; disabling memoization is the user's choice.

## Enterprise support

Apache 2.0 and independently maintained. Commercial support, security audits, and stability guarantees can be arranged. Open an issue describing the scope.

## Hall of fame

Researchers who report valid vulnerabilities will be credited here (with their permission) once a fix is released.

_None yet._
