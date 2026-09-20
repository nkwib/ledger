# Contributing

Thanks for considering a contribution. This is a small, zero-dependency library and it
intends to stay that way.

## Principles

- **Zero runtime dependencies.** A PR that adds one to `package.json` `dependencies`
  will be declined. Use `globalThis.crypto.subtle` and standard globals only.
- **Isomorphic.** Everything must run in a browser and in Node >= 20. No Node-only or
  browser-only APIs in the library source.
- **Generic.** The library must not know about any specific domain. Domain data lives in
  the caller's `payload` and `content` projection.
- **Byte stability.** Do not change what gets hashed or signed. The `golden.test.ts`
  vector pins the exact SHA-256 an existing signed chain depends on; if it fails, you
  changed the wire format and existing chains would stop verifying.

## Dev setup

Clone the repo, then:

```sh
pnpm install
```

## Test commands

Run from the repo root:

```sh
pnpm test:unit        # runs this package's suites plus the parent app's unit tests
```

Or from `packages/ledger`:

```sh
pnpm test             # vitest run, this package only
pnpm typecheck        # tsc --noEmit against the strict config
pnpm build            # tsc -> dist (only needed to publish or run examples with node)
```

Tests run in Node with real WebCrypto. Keep them deterministic (seed any randomness) and
free of domain assumptions: use a generic payload, as the existing suites do.

## What a good first issue looks like

Small, self-contained, and test-backed. Good examples:

- A documentation fix or a clearer `@example` on an export.
- A new `Content` recipe in `docs/howto-verify.md` (for example, excluding a nested
  mutable field) with a test.
- A property test that strengthens an existing guarantee (for example, more merge
  permutations, or a fuzz over payload shapes) without changing behavior.
- Improving an error message thrown when Web Crypto is unavailable.

Avoid, as a first PR: new public API surface, new algorithms (curves, hash functions),
or anything that changes the hashed/signed bytes. Open an issue to discuss those first.

## Pull request checklist

- `pnpm test:unit` is green (including `golden.test.ts` and `example.test.ts`).
- `pnpm typecheck` passes.
- New public exports have TSDoc with an `@example`.
- No new runtime dependencies.
- Docs updated if behavior or API changed.

## Releasing

1. Bump the version in package.json and add a CHANGELOG.md entry (where the repo keeps one).
2. Tag and push: git tag vX.Y.Z && git push origin vX.Y.Z.
3. .github/workflows/release.yml builds, tests, and runs npm publish --provenance for that tag. The tag must equal "v" plus the package.json version, otherwise the job stops before publishing.

One-time setup on npmjs.com (package Settings, Trusted Publisher): provider GitHub Actions, organization or user nkwib, repository ledger, workflow filename release.yml, environment left blank. Under Allowed actions tick "Allow npm publish": a new trusted publisher only allows "npm stage publish" by default, and the workflow's direct npm publish then fails with "403 OIDC permission denied for this action". Set this when you create the connection: npm does not allow editing a trusted publisher afterwards, so a stage-only connection has to be deleted and added again.
