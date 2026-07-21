# How to verify entries and chains

This page covers the verification building blocks and how to control exactly which
bytes are protected.

## Choose what gets hashed and signed: the `content` projection

Hashing and signing operate on a canonical projection of your entry, produced by a
`Content` function you supply. This is the single most important decision in adopting
the library, because it defines the bytes that are protected.

Rules for a `content` function:

- It MUST exclude the entry's own `hash` (that is the output).
- It MUST exclude any field you expect to change after signing (a local `sync` flag, a
  cache, a UI hint). A protected field that mutates will break verification.
- It MUST be deterministic. `canonicalJSON` sorts object keys for you, so key order
  does not matter, but values must be stable (normalize `undefined` to `null`).

The recommended shape `LedgerEntry<P>` has a ready-made projection, `defaultContent`,
that protects `{ id, deviceId, seq, ts, prev, payload }`:

```js
import { defaultContent } from '@nkwib/ledger';
```

If your entries are flat (domain fields as siblings of the envelope) or you need to
exclude a mutable field, write your own:

```js
// Flat entry with a mutable `sync` field that must NOT be protected.
const content = (e) => ({
	id: e.id,
	deviceId: e.deviceId,
	seq: e.seq,
	ts: e.ts,
	prev: e.prev ?? null,
	kind: e.kind,
	value: e.value
	// note: `sync` and `hash` are deliberately absent
});
```

> Keep this function stable forever. If you change which fields it includes, every
> previously signed entry stops verifying. Treat it as a wire format.

## Verify a single device chain

`verifyChainLink` is a fast, synchronous check that the `prev` pointers line up per
device. It does not recompute hashes, so it cannot catch a field edit that was followed
by a recomputed hash; use it as a cheap pre-check.

```js
import { verifyChainLink } from '@nkwib/ledger';
verifyChainLink(entries); // boolean
```

`verifyChain` is the full check: linkage AND every stored `hash` recomputed from
content. Any edited field makes the recomputed hash diverge and returns `false`.

```js
import { verifyChain } from '@nkwib/ledger';
await verifyChain(entries, content); // boolean
```

Both functions group by `deviceId` and ignore array order. Entries whose `hash` is
absent (legacy or not-yet-chained rows) are skipped, so a pre-hashing seed row does not
fail verification.

## Verify a single signature

```js
import { verifyEntrySignature } from '@nkwib/ledger';
const ok = await verifyEntrySignature(publicKey, entry, signatureB64, content);
```

`verifyEntrySignature` returns `false` (never throws) for a tampered entry, a wrong
key, or a malformed signature, so it is safe on untrusted input. It DOES throw if Web
Crypto is unavailable, so a broken environment fails loudly instead of silently
passing. `publicKey` is a `CryptoKey`; import it from a JWK with `importPublicKey`.

## Verify everything at once

Most callers do not call the primitives directly. `verifyAndMergeLedgers` merges the
logs and then, per device, runs `verifyChain` and checks every signature against a
registry. See [how to handle conflicts](./howto-conflicts.md) for the result shape.

```js
import { verifyAndMergeLedgers } from '@nkwib/ledger';

const registry = { [id.deviceId]: { publicKeyJwk: id.publicKeyJwk } };
const { entries, conflicts } = await verifyAndMergeLedgers(
	[log], { content }, registry, signatures
);
if (conflicts.length === 0) {
	// every chain links, every hash matches, every signature verifies
}
```

Omit the `signatures` argument to verify chains only (useful before signatures exist).

## Confirm a device id really owns its key

Because a device id is the hash of its public key, a peer can recompute it and refuse a
registry that lies:

```js
import { getDeviceId, deviceIdMatches } from '@nkwib/ledger';

await getDeviceId(jwk);                    // the id this key certifies to
await deviceIdMatches(claimedId, jwk);     // false if the registry is dishonest
```

`verifyAndMergeLedgers` does this automatically for ids that look self-certifying (64
lowercase hex chars): such an id must hash to its registered key or the device is
treated as unknown.
