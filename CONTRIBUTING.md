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

The package lives in a pnpm workspace.

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
