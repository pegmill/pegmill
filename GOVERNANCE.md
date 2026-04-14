# Governance

Pegmill is a single-maintainer open-source project. This file is the honest version of what that means for users, contributors, and anyone reviewing the project for grants or enterprise adoption.

## Current state

- Maintainer: [Aliaksandr Zahatski](https://github.com/zag), contact `zag@cpan.org`
- Bus factor: 1
- Legal entity: none
- Funding: no VC, no corporate sponsor, no existing grants
- Decision authority: single maintainer for merges, releases, and roadmap

Solo maintenance is the norm in OSS, not the exception. What matters for adoption and for grant programs is whether bus factor, succession, and security disclosure have real mitigations.

## Contribution path

Open an issue before writing code for anything larger than a typo fix. Pull requests need green CI on the Node 18, 20, 22 matrix and at least one test per new behaviour. Breaking changes are allowed in minor bumps pre-1.0 and must be noted in `CHANGELOG.md`. Merges go fast-forward when history allows, merge commits otherwise.

## Release authority

Releases are semver, cut by the maintainer, signed by the maintainer's npm account. Pre-1.0 caveats:

- `0.X.0` can carry breaking changes, always documented
- `0.1.X` stays backward-compatible

## Security incidents

See [SECURITY.md](SECURITY.md) for reporting and response.

## Bus factor mitigation

Everything that matters for the project runs out of the public repo: source, grammar, CI workflows, release scripts, changelog. Forking and continuing is straightforward, no private infrastructure to reconstruct.

Apache 2.0 makes a fork permissible without permission. The `pegmill` npm package is transferable; if the maintainer becomes unresponsive for more than 90 days, [npm's dispute resolution policy](https://docs.npmjs.com/policies/disputes) allows contested takeover of an abandoned name. The `pegmill` GitHub organisation is owned by the maintainer, so if org control is ever lost, the npm package plus a fork on a new org can continue distribution.

Co-maintainer onboarding becomes realistic when a contributor has landed 10+ merged PRs with demonstrated grasp of the codegen. None exist yet.

## Succession

If the maintainer can no longer continue the project, this file will be updated to declare the project archived where possible. npm and GitHub account ownership will transfer according to platform policy or the maintainer's estate. Any user can fork under Apache 2.0 without further permission.

## What Pegmill does not do

No CLA. [DCO-style sign-off](https://developercertificate.org/) is enough for larger changes. No benevolent-dictator-for-life title: maintainer is a job, not a title. No steering committee: not needed at this scale.

## Contact

Governance questions go in an issue. Anything private (security, legal, sponsorship) goes to `zag@cpan.org`.
