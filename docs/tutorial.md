# Tutorial: a tiny multi-device scoreboard

By the end of this tutorial you will have a working, verifiable scoreboard where two
devices record scores offline, their logs merge into one ranking, and tampering is
caught and named. No storage or network: everything is in memory, so you can focus on
the ledger itself.

This is a learning exercise. Copy each block into a file (`scoreboard.mjs`) and run it
with `node scoreboard.mjs` on Node >= 20, or paste the whole thing at once.

## 1. Model your entry

The library never sees your domain. You keep your data in a `payload` and the library
manages the envelope (`id`, `deviceId`, `seq`, `ts`, `prev`, `hash`). For a scoreboard,
the payload is just an athlete and their points.

```js
import {
	generateDeviceKey, deviceIdentity, appendEntry, signEntry,
	mergeLedgers, verifyAndMergeLedgers, defaultContent, defaultCodec
} from '@nkwib/ledger';

// A payload is anything JSON-serializable. This is ours:
//   { athlete: string, points: number }
```

`defaultContent` is the projection that decides which bytes get hashed and signed. For
the recommended `{ ...envelope, payload }` shape it protects the whole entry. (Later,
in [how to verify](./howto-verify.md), you will see how to exclude mutable fields.)

## 2. Give each device an identity

Each device generates an ECDSA P-256 keypair. The private key never leaves the device
(it is non-extractable). The device id is the SHA-256 of the public key, so it is
self-certifying: nobody can claim an id they do not hold the key for.

```js
const phone = await generateDeviceKey();
const tablet = await generateDeviceKey();

const phoneId = await deviceIdentity(phone);   // { deviceId, publicKeyJwk }
const tabletId = await deviceIdentity(tablet);

console.log('phone is', phoneId.deviceId.slice(0, 12), '...');
```

## 3. Append and sign entries

Every device keeps its own chain. `appendEntry` fills in `seq`, `prev`, and `hash` from
the previous entry (the "head"); pass `null` for the first entry. We sign each entry as
we go and keep the signatures in a map keyed by entry id.

```js
const signatures = {};

async function record(device, identity, id, head, payload) {
	const entry = await appendEntry(
		{ id, deviceId: identity.deviceId, ts: Date.now(), payload },
		head
	);
	signatures[entry.id] = await signEntry(device.privateKey, entry, defaultContent);
	return entry;
}

// The phone records Ada; the tablet records Bo. Both are offline.
const p0 = await record(phone, phoneId, 'p0', null, { athlete: 'ada', points: 2 });
const p1 = await record(phone, phoneId, 'p1', p0, { athlete: 'ada', points: 3 });
const t0 = await record(tablet, tabletId, 't0', null, { athlete: 'bo', points: 4 });

const phoneLog = [p0, p1];
const tabletLog = [t0];
```

## 4. Merge the logs

`mergeLedgers` unions the logs, removes duplicates by id, and returns entries in one
deterministic order. Feed it the logs in any order and any grouping: the result is the
same.

```js
const { entries, conflicts } = mergeLedgers([phoneLog, tabletLog], defaultCodec);
console.log('merged', entries.length, 'entries,', conflicts.length, 'conflicts');

// Reduce to a ranking. This is your domain logic, not the library's.
const totals = {};
for (const e of entries) {
	totals[e.payload.athlete] = (totals[e.payload.athlete] ?? 0) + e.payload.points;
}
console.log(totals); // { ada: 5, bo: 4 }
```

## 5. Verify chains and signatures

`mergeLedgers` is fast and does no crypto. When you want proof, `verifyAndMergeLedgers`
also checks every device chain and every signature against a registry of public keys. A
clean set has zero conflicts.

```js
const registry = {
	[phoneId.deviceId]: { publicKeyJwk: phoneId.publicKeyJwk },
	[tabletId.deviceId]: { publicKeyJwk: tabletId.publicKeyJwk }
};

const verified = await verifyAndMergeLedgers(
	[phoneLog, tabletLog], defaultCodec, registry, signatures
);
console.log('conflicts after verify:', verified.conflicts.length); // 0
```

## 6. Tamper with one byte

Now change Ada's second entry after it was signed, and verify again. The recomputed
hash no longer matches the stored one, and the signature no longer matches the content.
The conflict names the exact entry.

```js
const forged = { ...p1, payload: { athlete: 'ada', points: 999 } };
const tamperedPhoneLog = [p0, forged];

const check = await verifyAndMergeLedgers(
	[tamperedPhoneLog, tabletLog], defaultCodec, registry, signatures
);
for (const c of check.conflicts) {
	console.log(c.kind, '->', c.entryId, ':', c.detail);
}
// broken_chain -> p1 : Hash chain for device ... does not verify ...
// invalid_signature -> p1 : Entry p1: invalid signature (forged or altered entry).
```

## What you built

- Two independent, signed hash chains, created offline.
- A deterministic merge that does not care about order.
- Cryptographic verification that names exactly what was tampered.

The library did the verifiable core; you supplied the payload and the ranking. That is
the whole idea.

## Next steps

- [How to handle conflicts](./howto-conflicts.md): what each flag means and how to react.
- [How to manage keys](./howto-keys.md): persistence and the backup implications of
  non-extractable keys.
- [How to move entries between devices](./howto-transport.md): QR, file, or HTTP.
- [Threat model](./threat-model.md): read this before you trust it with anything real.
