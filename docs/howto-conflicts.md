# How to handle conflicts

Merging never resolves anything silently. When something is wrong, it is reported as a
structured conflict for you to surface or resolve. This page explains each flag and how
to react.

## The conflict shape

```ts
interface LedgerConflict<E> {
	kind: 'divergent_id' | 'broken_chain' | 'invalid_signature';
	entryId: string;   // the entry at issue (chain conflicts report the first offender)
	deviceId: string;  // the device the conflict is attributed to
	detail: string;    // human-readable English explanation
	entries: E[];      // the entries involved (all variants for divergent_id, else one)
}
```

`mergeLedgers` returns `divergent_id` conflicts only (it does no crypto).
`verifyAndMergeLedgers` returns all three. The conflict list is sorted deterministically
by `(kind, entryId, deviceId)`, so the same inputs always produce the same list.

## The three kinds

### `divergent_id`

Two or more entries share an `id` but differ in content. This is a fork (the same id was
reused on two devices) or tampering (someone changed a copy). The merge still produces a
deterministic winner (the variant with the lexicographically smallest canonical content)
so downstream reducers do not stall, but the divergence is flagged. `entries` holds every
variant.

```js
const { entries, conflicts } = mergeLedgers([logA, logB], codec);
for (const c of conflicts.filter((c) => c.kind === 'divergent_id')) {
	console.warn(`id ${c.entryId} has ${c.entries.length} versions`);
	// Decide: keep the winner, prompt a human, or reject the whole batch.
}
```

Prevention: use globally unique ids (a UUID per entry). Reuse is what makes this happen.

### `broken_chain`

A device's append-only hash chain does not verify: a `prev` pointer does not line up, or
a stored `hash` does not match the recomputed content. Either an entry was edited after
it was hashed, or entries are missing. `entryId` is the first offending entry on that
device; `entries` is that device's slice of the merged log.

```js
for (const c of conflicts.filter((c) => c.kind === 'broken_chain')) {
	// Do NOT trust this device's entries. Ask it to re-send its full chain,
	// or quarantine the batch.
}
```

### `invalid_signature`

An entry is not signed, comes from a device with no (or a dishonest) registered key, or
its signature does not verify. The `detail` string distinguishes the case:

- "not signed": the entry has no signature in the map you passed.
- "device ... is unknown or untrusted": no registry entry, or the registered key does not
  self-certify to the device id.
- "invalid signature (forged or altered entry)": a signature exists but does not match.

```js
for (const c of conflicts.filter((c) => c.kind === 'invalid_signature')) {
	// Attribution failed. Treat the entry as unauthenticated.
}
```

## A clean merge

A fully signed, untampered, non-forked set produces an empty conflict list. That is your
"everything checks out" signal:

```js
const { entries, conflicts } = await verifyAndMergeLedgers([...logs], codec, registry, sigs);
if (conflicts.length === 0) {
	commit(entries); // safe to reduce and display
} else {
	review(conflicts); // your policy decides
}
```

## Resolution is your policy

The library gives you facts, not decisions. Common policies:

- **Reject the batch.** On any conflict, refuse to import and tell the sender.
- **Quarantine.** Import clean entries, hold flagged ones for a human.
- **Prompt.** Show the divergent variants and let an operator pick.

Pick per your trust model. Nothing here is resolved for you, on purpose: silent
resolution is how tamper-evidence quietly dies.
