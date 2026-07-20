# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Nothing yet.

## [0.1.0]

Initial extraction from the street-bouldering app into a standalone, generic library.

### Added

- Deterministic JSON and SHA-256: `canonicalJSON`, `sha256Hex`, `cryptoAvailable`.
- Per-device hash chain: `entryContent`, `hashEntry`, `appendEntry`, `verifyChainLink`,
  `verifyChain`.
- ECDSA P-256 device identity and signatures: `generateDeviceKey`, `exportPublicKey`,
  `importPublicKey`, `getDeviceId`, `deviceIdMatches`, `deviceIdentity`, `signEntry`,
  `verifyEntrySignature`.
- Deterministic total order: `orderLedger`, `defaultCompare`.
- Deterministic merge with typed conflicts: `mergeLedgers`, `verifyAndMergeLedgers`,
  conflict kinds `divergent_id`, `broken_chain`, `invalid_signature`.
- Generic envelope types (`BaseEntry`, `LedgerEntry<P>`), codec/projection types
  (`Content`, `Compare`, `LedgerCodec`), and defaults (`defaultContent`, `defaultCodec`).
- Documentation: tutorial, how-to guides (verify, conflicts, keys, transport), API
  reference, threat model, and design notes.
- Runnable Node and browser examples, with a test that executes the Node example.

### Notes

- Zero runtime dependencies. Isomorphic (browser and Node >= 20), WebCrypto only.
- Byte-for-byte compatible with the parent app's existing signed chains, pinned by a
  golden-value test.
