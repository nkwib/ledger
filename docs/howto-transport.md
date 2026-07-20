# How to move entries between devices

The library is transport-agnostic on purpose. It produces and verifies entries; getting
them from one device to another is your job. This page shows what to move and sketches
the three common channels.

## What travels

An entry is plain JSON. To let a recipient verify it, send three things:

1. The entries (`LedgerEntry[]` or your entry shape).
2. The signatures (`{ [entryId]: base64Signature }`).
3. The signer's public key (`publicKeyJwk`) and its `deviceId`.

That is enough for the recipient to build a registry and call
`verifyAndMergeLedgers`. A minimal envelope:

```js
const payload = {
	deviceId: identity.deviceId,
	publicKeyJwk: identity.publicKeyJwk,
	entries: log,          // array of entries
	signatures             // { entryId: sig }
};
const wire = JSON.stringify(payload); // move these bytes by any channel below
```

On receipt:

```js
const p = JSON.parse(wire);
const registry = { [p.deviceId]: { publicKeyJwk: p.publicKeyJwk } };
const { entries, conflicts } = await verifyAndMergeLedgers(
	[p.entries], codec, registry, p.signatures
);
```

Because merge is deterministic and deduplicates by id, it is safe to send the same
entries more than once, to send overlapping batches, and to receive them in any order.
Design your transport to be at-least-once and let the merge sort it out.

## The three channels

### QR codes (zero network)

Encode the wire string (base64url is QR-friendly) into one or more QR codes and scan
them on the other device. Large payloads exceed a single QR's capacity, so split the
string into indexed frames and reassemble on the scanner, detecting missing or
out-of-order frames. This is the fully offline path: no shared network required.

### File (sneakernet or cloud drop)

Write the wire string to a file and move it by USB stick, AirDrop, email attachment, or
a shared folder. Simple, auditable, and works across trust boundaries. The recipient
verifies exactly as above; a corrupted or truncated file simply fails verification.

### HTTP (when a network exists)

POST the payload to a peer or a relay and merge on receipt. The server is just a mailbox:
it does not need to be trusted, because every entry is verified against the sender's key
after transport. A relay that tampers with entries in flight produces `broken_chain` or
`invalid_signature` conflicts on arrival.

## Reference implementation: the parent app

`@blocco/ledger` was extracted from a bouldering-competition PWA where these exact
transports ship. The app keeps transport OUT of the library, in
`src/lib/transport/pacchetto.ts`, which is worth reading as a concrete pattern:

- A single self-describing, versioned, base64url payload with the prefix `BLKC1.`
  carrying the event id, code, device id, signer JWK, rows, and signatures.
- A multi-frame QR ladder (`BLKF1.<id>.<index>.<total>.<data>`) that tags every frame
  with a content-derived payload id, so a scan cannot splice two different hand-ins
  together, and detects out-of-order, duplicate, and missing frames on reassembly.
- The same payload flows over QR (scan), file (paste or load), and HTTP (an intake
  endpoint), and is verified on receipt with `verifyAndMergeLedgers`.

Treat that file as an example of a transport layer built on top of this library, not as
part of the library. Your envelope, versioning, and framing are yours to design.
