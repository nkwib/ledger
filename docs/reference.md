# API reference

Every public export of `@blocco/ledger`. All async functions return Promises. All
functions are pure except those that touch `globalThis.crypto` (noted). Nothing has
import-time side effects.

## Types

### `BaseEntry`

The envelope fields every operation reads.

```ts
interface BaseEntry {
	id: string;          // globally unique entry id (use a UUID)
	deviceId: string;    // the writer; one hash chain per device
	seq: number;         // monotonic per-device counter, from 0
	ts: number | string; // timestamp CLAIM (epoch ms or ISO string), never a proof
	prev?: string | null;// hash of the previous entry on this device (null on first)
	hash?: string;       // this entry's hash; absent = unchained, skipped by verifiers
}
```

### `LedgerEntry<P>`

Recommended shape: the envelope plus a typed `payload`. `extends BaseEntry`.

```ts
interface LedgerEntry<P = unknown> extends BaseEntry { payload: P; }
```

### `Content<E>`

`(entry: E) => unknown`. Projects an entry to the value that is canonicalized, then
hashed and signed. Must exclude `hash` and any mutable field, and be deterministic. See
[how to verify](./howto-verify.md).

### `Compare<E>`

`(a: E, b: E) => number`. A total-order comparator for `orderLedger`.

### `LedgerCodec<E>`

```ts
interface LedgerCodec<E extends BaseEntry> {
	content: Content<E>;
	compare?: Compare<E>; // defaults to defaultCompare
}
```

### `DeviceIdentity`

```ts
interface DeviceIdentity { deviceId: string; publicKeyJwk: JsonWebKey; }
```

### `ConflictKind`

`'divergent_id' | 'broken_chain' | 'invalid_signature'`.

### `LedgerConflict<E>`

```ts
interface LedgerConflict<E extends BaseEntry = BaseEntry> {
	kind: ConflictKind;
	entryId: string;
	deviceId: string;
	detail: string;
	entries: E[];
}
```

### `MergeResult<E>`

```ts
interface MergeResult<E extends BaseEntry> { entries: E[]; conflicts: LedgerConflict<E>[]; }
```

### `DeviceKey`, `DeviceKeyRegistry`, `SignatureMap`

```ts
interface DeviceKey { publicKeyJwk: JsonWebKey; }
type DeviceKeyRegistry = Record<string, DeviceKey>; // deviceId -> key
type SignatureMap = Record<string, string>;         // entryId -> base64 signature
```

## Hashing and canonical JSON

### `sha256Hex(input): Promise<string>`

`input: ArrayBuffer | Uint8Array | string`. SHA-256 as lowercase hex. Strings are
UTF-8 encoded first. Uses `crypto.subtle`; throws if Web Crypto is unavailable.

### `canonicalJSON(value): string`

Deterministic JSON: object keys sorted recursively, array order preserved. Same logical
value always yields the same string.

### `cryptoAvailable(): boolean`

True when real SHA-256 / signing can be computed here (a secure context or Node >= 20).

## Ordering

### `defaultCompare(a, b): number`

Total order `(seq, deviceId, ts, id)`. Numeric `ts` compared numerically, string `ts`
lexicographically.

### `orderLedger(entries, compare?): E[]`

Returns a new array in total order. Input never mutated. `compare` defaults to
`defaultCompare`.

## Hash chain (touches crypto for hashing)

### `entryContent(entry, content): string`

`canonicalJSON(content(entry))`. The exact string that gets hashed and signed. Pure.

### `hashEntry(entry, content): Promise<string>`

SHA-256 (hex) of `entryContent(entry, content)`. This is `entry.hash`.

### `appendEntry(input, head, content?): Promise<LedgerEntry<P>>`

Builds the next entry on a chain. `input: { id, deviceId, ts, payload }`. `head` is the
previous entry on the same device, or `null` for the first. Fills `seq` (`head.seq + 1`
or 0), `prev` (`head.hash` or `null`), and `hash`. `content` defaults to
`defaultContent`. Does not sign.

### `verifyChainLink(entries): boolean`

Fast, sync linkage check per device. Ignores array order; skips unhashed entries.

### `verifyChain(entries, content): Promise<boolean>`

Full verify: linkage AND every stored `hash` recomputed from content.

## Signatures and identity (touches crypto)

### `generateDeviceKey(): Promise<CryptoKeyPair>`

Fresh ECDSA P-256 keypair. Private key is NON-extractable; public key is exportable.

### `exportPublicKey(key): Promise<JsonWebKey>`

Export a public `CryptoKey` as a JWK. Private keys cannot be exported.

### `importPublicKey(jwk): Promise<CryptoKey>`

Import a public-key JWK into a verify-only `CryptoKey`.

### `getDeviceId(jwk): Promise<string>`

Self-certifying device id: `sha256Hex` of canonical `{ crv, kty, x, y }`. 64 hex chars.

### `deviceIdMatches(deviceId, jwk): Promise<boolean>`

True when `deviceId` is the self-certifying id of `jwk` (registry honesty check).

### `deviceIdentity(pair): Promise<DeviceIdentity>`

Convenience: `{ deviceId, publicKeyJwk }` for a keypair.

### `signEntry(privateKey, entry, content): Promise<string>`

Base64 ECDSA signature over `entryContent(entry, content)`. Non-deterministic: verify,
never compare two signatures.

### `verifyEntrySignature(publicKey, entry, signatureB64, content): Promise<boolean>`

Returns `false` (never throws) for tamper, wrong key, or malformed signature. Throws
only if Web Crypto is unavailable.

## Merge

### `mergeLedgers(logs, codec): MergeResult<E>`

`logs: E[][]`. Sync. Unions all logs, dedups by `id`, orders by `codec.compare`. Emits
`divergent_id` conflicts for same-id/different-content forks. Commutative and
associative over the set of entries.

### `verifyAndMergeLedgers(logs, codec, deviceKeys, signatures?): Promise<MergeResult<E>>`

Async. Runs `mergeLedgers`, then per device verifies the hash chain (`broken_chain` on
failure) and every signature against `deviceKeys` (`invalid_signature` on unknown
device, missing, or forged signature). Omit `signatures` to verify chains only. A
self-certifying id (64 hex chars) must hash to its registered key or the device is
treated as unknown.

## Defaults

### `defaultContent(entry): unknown`

`Content` for `LedgerEntry<P>`: `{ id, deviceId, seq, ts, prev: prev ?? null, payload }`.

### `defaultCodec: LedgerCodec<LedgerEntry>`

`{ content: defaultContent }`.

## Errors

The library favors typed results over exceptions:

- Verification functions (`verifyChainLink`, `verifyChain`, `verifyEntrySignature`)
  return `false` rather than throwing on bad data, so untrusted input is safe.
- Merge reports problems as `LedgerConflict[]`, never by throwing.
- The ONE thrown error is a missing Web Crypto environment (no `crypto.subtle`): every
  hashing/signing function throws `Error('Web Crypto is unavailable: ...')`. Guard with
  `cryptoAvailable()` if you cannot guarantee a secure context or Node >= 20.

## Name mapping from the parent app (Italian to English)

`@blocco/ledger` was extracted from an Italian-named codebase. If you are reading that
app or migrating from it, the public names map as follows.

| App (Italian) | Library (English) |
| --- | --- |
| `generaChiaviDispositivo` | `generateDeviceKey` |
| `esportaChiavePubblica` | `exportPublicKey` |
| `importaChiavePubblica` | `importPublicKey` |
| `deviceIdDaChiave` | `getDeviceId` |
| `deviceIdCorrisponde` | `deviceIdMatches` |
| `identitaDispositivo` | `deviceIdentity` |
| `firmaRiga` | `signEntry` (bound to the app's row projection) |
| `verificaFirma` | `verifyEntrySignature` |
| `contenutoRiga` | `entryContent` (with the app's `content`) |
| `hashRiga` | `hashEntry` |
| `verificaLinkCatena` | `verifyChainLink` |
| `verificaCatena` | `verifyChain` |
| `ordinaLedger` | `orderLedger` |
| `mergeLedger` | `mergeLedgers` |
| `mergeConVerifica` | `verifyAndMergeLedgers` |
| `MergeResult.merged` | `MergeResult.entries` |
| `MergeResult.conflitti` | `MergeResult.conflicts` |
| `TipoConflitto` | `ConflictKind` |
| `LedgerConflict.tipo` | `LedgerConflict.kind` |
| `LedgerConflict.dettaglio` | `LedgerConflict.detail` |
| `LedgerConflict.righe` | `LedgerConflict.entries` |
| conflict `id_divergente` | `divergent_id` |
| conflict `catena_rotta` | `broken_chain` |
| conflict `firma_non_valida` | `invalid_signature` |
