# How to manage keys

Device identity is a keypair. This page covers the lifecycle: creating it, persisting
it, sharing the public half, and the consequences of the private key being
non-extractable.

## Create a device key

```js
import { generateDeviceKey, deviceIdentity } from '@blocco/ledger';

const pair = await generateDeviceKey();          // ECDSA P-256 CryptoKeyPair
const identity = await deviceIdentity(pair);      // { deviceId, publicKeyJwk }
```

- `pair.privateKey` is **non-extractable**: WebCrypto will not let you export it. It can
  sign, and nothing else.
- `pair.publicKey` is exportable so peers can verify.
- `identity.deviceId` is `sha256(canonical public-key material)`, 64 lowercase hex
  chars. It is self-certifying: derived from the key, not assigned.

## Share the public key

Peers need your public key (as a JWK) to verify your entries. Publish
`identity.publicKeyJwk` however your transport allows, and reconstruct a `CryptoKey`
when verifying:

```js
import { exportPublicKey, importPublicKey } from '@blocco/ledger';

const jwk = await exportPublicKey(pair.publicKey); // same as identity.publicKeyJwk
const pub = await importPublicKey(jwk);            // verify-only CryptoKey
```

A registry maps device ids to public keys:

```js
const registry = { [identity.deviceId]: { publicKeyJwk: identity.publicKeyJwk } };
```

Because ids self-certify, a recipient can call `deviceIdMatches(id, jwk)` to reject a
registry that maps an id to the wrong key.

## Persist the keypair

You want the SAME device identity across restarts, otherwise every session is a new
"device" and its old chain cannot be extended. How you persist depends on the runtime.

### Browser: IndexedDB (recommended)

A non-extractable `CryptoKey` can be stored in IndexedDB directly. The structured-clone
storage keeps the key non-extractable: it survives reloads, and the private key still
never becomes readable by JavaScript.

```js
// pseudo-code: store the whole CryptoKeyPair as a value in an IndexedDB record
await idbPut('keys', 'device', pair);
const restored = await idbGet('keys', 'device'); // a usable, still non-extractable pair
```

`localStorage` cannot hold a `CryptoKey` (it stores strings only), so it is not an
option for a non-extractable key.

### Node: your call

Node has no IndexedDB. For a server or CLI, either generate an ephemeral key per process
(fine for verify-only nodes) or manage long-lived keys with your platform's secret store.
If you need a portable private key you must decide to make it extractable at generation
time, which changes the security properties below.

## The backup implication of non-extractable keys

This is the most important trade-off in the library.

A non-extractable private key **cannot be backed up, exported, or migrated**. That is the
point: the key genuinely never leaves the device, so a stolen backup cannot impersonate
the device. The cost is:

- **Lose the device (or clear its storage), lose the identity.** The old chain can still
  be verified by anyone holding the public key, but that device can never append to it
  again. It must start a new identity and a new chain.
- **You cannot move an identity between devices.** Each device is its own signer by
  design. If you want "one user, many devices", model the user as the set of their device
  keys, not as a single shared key.

If your product needs key portability or recovery, generate an extractable key instead
(pass `true` where the library passes `false` to `generateKey`) and accept that an
exported private key is now a secret you must protect like a password. The library's
default is non-extractable because tamper-evidence is stronger when the key cannot leak.

## Rotation

There is no built-in rotation. To rotate, generate a new keypair (a new device id and a
new chain) and keep the old public key in your registry so historical entries still
verify. Link the old and new identities at your application layer if you need continuity.

## What a key does NOT give you

Signing proves an entry came from the holder of a device key. It does not prove the
claim inside the entry is true, and it does not hide anything. See the
[threat model](./threat-model.md).
