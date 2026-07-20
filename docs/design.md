# Design notes

Why this library is a hash chain plus signatures plus a deterministic order, and not a
CRDT, a blockchain, or a transparency log. This is the rationale, so you can judge
whether the trade-offs fit your problem.

## The problem it was shaped by

The library was extracted from an offline-first bouldering-competition app. Athletes,
judges, and organizers record results on separate devices, often with no network at the
crag. Later, those logs must combine into one ranking that anyone can independently check
and that nobody can quietly rewrite. Two requirements, in tension with most existing
tools:

1. Multiple writers, offline, merged later in any order.
2. Provable integrity: you can show a record was not altered after it was made.

## Why not a CRDT

CRDTs (Automerge, Yjs) are excellent at requirement 1 and silent on requirement 2. They
merge concurrent edits field by field and converge without coordination, but they trust
their inputs: a peer can hand a CRDT a doctored update and it merges cleanly. There is no
notion of "this change is not authentic" or "this history was rewritten". Bolting
signatures onto a CRDT is awkward because the merge rewrites structure, so there is no
stable set of bytes to sign.

This library keeps the merge boringly simple, precisely so there IS a stable thing to
sign. Each entry is immutable once written; the merge only unions, deduplicates, and
orders. Because entries never change, signing them is straightforward and the chain gives
you tamper-evidence for free.

The cost: this is not a rich collaborative data type. There is no automatic merge of two
edits to the same field, no text CRDT, no tree. If two devices assert conflicting facts
about the same id, you get a `divergent_id` flag and a deterministic winner, and YOU
decide. That is the right shape for append-only records (results, measurements, audit
events), and the wrong shape for a shared document.

## Why a hash chain

A per-device append-only hash chain is the smallest structure that makes edits and
deletions inside one writer's history detectable. Each entry commits to the previous
one, so you cannot silently drop, reorder, or alter an entry without breaking the link
and the recomputed hash. It needs no server and no global coordination: each device
maintains its own chain independently, which is exactly what "offline-first, many
writers" demands.

We chose one chain PER DEVICE rather than one global chain because a global chain would
require writers to coordinate on a single head, which is impossible offline. Per-device
chains merge without coordination, and the deterministic order stitches them into one
history at read time.

## Why signatures on top

The hash chain proves a history was not altered, but not WHO wrote it. Cheap integrity
(a plain chain) lets anyone forge a whole chain from scratch. ECDSA P-256 signatures bind
each entry to a device key, and the self-certifying device id (the hash of the public
key) means identity cannot be spoofed and a key registry can be checked for honesty.
Non-extractable private keys mean the signing key never leaves the device, so a leaked
backup cannot impersonate it.

P-256 was chosen because it is the WebCrypto-native curve available everywhere the target
runs (browsers and Node >= 20) with no dependency. Ed25519 would be a fine alternative
but is not yet uniformly available through `crypto.subtle` across those runtimes, and a
zero-dependency, isomorphic library was a hard requirement.

## Why a deterministic total order (not consensus)

Merge is a pure function of the SET of entries: union, dedup by id, sort by
`(seq, deviceId, ts, id)`. This makes it commutative and associative, so every party
reduces the same entries to the same log without talking to each other. No consensus
protocol, no quorum, no leader. That is what lets a fully offline set of devices agree
after the fact, just by exchanging entries.

The order deliberately leads with `seq` (real per-device append order) and breaks ties
with `deviceId` and then `ts`. Note that `ts` is a tie-breaker for display stability, not
a source of truth: see the [threat model](./threat-model.md) on why timestamps are
claims.

## Why not a blockchain

A blockchain adds global consensus, proof-of-work or proof-of-stake, and a shared ledger
across mutually distrusting parties. All of that solves "who gets to append next to a
single global chain", which is a problem this library does not have: writers append to
their OWN chains, and merge reconciles them deterministically. There is no coin, no
mining, no global state, and no need for one. Dragging in a blockchain would add enormous
cost and availability requirements to buy a property (global write ordering) that
offline-first multi-writer apps neither need nor can afford.

## Why not a transparency log (Merkle tree)

Server-side transparency logs (Trillian, Certificate Transparency) give a central,
always-on service a publicly verifiable append-only Merkle tree. They are the right tool
when you have a trusted-but-verify central authority and clients that are online. This
library targets the opposite: no central server, devices frequently offline, and merge
happening peer to peer or through an untrusted relay. The per-device chain is the
offline-friendly analogue of a Merkle log's integrity, without the central log.

## The shape of the trade-off

What you gain: zero dependencies, runs anywhere WebCrypto does, no server, no
coordination, independently reproducible history, and typed detection of tampering,
forks, and forgery.

What you give up: rich automatic merge, confidentiality, availability, protection against
false-but-signed claims, and revocation. Those are deliberately out of scope so the core
stays small and auditable. If you need them, layer them on top, or pick a different tool
(see "When NOT to use this" in the [README](../README.md)).
