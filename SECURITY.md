# Security policy

## Reporting a vulnerability

Please report security issues privately. Do NOT open a public issue for a vulnerability.

Email the maintainer with:

- a description of the issue and its impact,
- steps to reproduce (a minimal script is ideal),
- the version or commit you tested,
- any suggested fix.

You can expect an acknowledgement within a few days and a fix or mitigation plan for
confirmed issues. Coordinated disclosure is appreciated: please give a reasonable window
before publishing details.

> Maintainer contact is a placeholder for the project owner to fill in (a dedicated
> security address or the owner's email).

## Scope

This library is a verifiable ledger substrate. Relevant reports include:

- a way to alter a signed entry without producing a `broken_chain` or
  `invalid_signature` conflict,
- a way to forge a signature that verifies against a device's public key,
- a device id that does not self-certify to its key yet passes `deviceIdMatches`,
- a merge that is not deterministic (different result for the same set of entries),
- a canonicalization difference that lets two distinct payloads share a hash.

Please read the [threat model](./docs/threat-model.md) first: several properties (no
confidentiality, timestamps are claims, false-but-signed writes, key compromise) are
explicit NON-guarantees and are not vulnerabilities.

## Supported versions

Pre-1.0: only the latest `0.x` release receives fixes.
