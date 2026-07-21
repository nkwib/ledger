# Threat model

Read this before you trust `@nkwib/ledger` with anything that matters. A crypto library
is only as good as your understanding of what it does and does not promise. This page is
in plain language on purpose.

## The one-sentence summary

`@nkwib/ledger` makes it detectable when a signed record is changed AFTER it was
written, and it lets many devices agree on one history. It does NOT stop a device from
writing a false record in the first place, hide anything, or keep your system online.

## What it guarantees

### Tamper-evidence after signing

Once an entry is hashed and signed, any later change to a protected field is detectable.
Editing a field makes the recomputed hash diverge (`broken_chain`) and makes the
signature fail (`invalid_signature`). This holds for a single field flip, a reordering,
or a deletion inside a device's chain.

Scope: this protects the fields your `content` projection includes. Anything you leave
out of `content` is NOT protected. Choosing that projection well is your responsibility
(see [how to verify](./howto-verify.md)).

### Attribution to a device key

A valid signature proves the entry was produced by the holder of a specific device's
private key. Because the device id is the hash of the public key, a device cannot claim
an identity it does not hold the key for, and a registry that maps an id to the wrong
key is detectable (`deviceIdMatches`).

Scope: this attributes an entry to a KEY, not to a person. Whoever controls the key
controls the identity.

### Deterministic, verifiable merge

Any number of device logs merge into one ordered log, identically regardless of arrival
order or grouping (commutative and associative over the set of entries). Every party who
runs the merge on the same entries gets the same result and the same conflict list, so
the merged history is independently reproducible.

### Detection semantics of each conflict flag

- `divergent_id`: two entries share an id but differ. A fork or a tampered copy. The
  merge still yields a deterministic winner, and flags the divergence.
- `broken_chain`: a device's hash chain does not link or a stored hash does not match
  recomputed content. Editing or missing entries.
- `invalid_signature`: unsigned, unknown/dishonest device, or a signature that does not
  verify. Attribution failed.

These are DETECTION guarantees. The library tells you something is wrong and where; it
does not undo it.

## What it does NOT guarantee

### It cannot stop a device lying at write time

Signing proves who wrote an entry, not that the entry is true. A judge's device can sign
"athlete X topped the boulder" when they did not. The signature is authentic; the claim
is false. Tamper-evidence begins the instant an entry is signed, not before. Guard write
time with your own controls (witnesses, tiers of authority, out-of-band checks).

### Timestamps are claims, not proofs

`ts` is whatever the writing device put there. A device with a wrong or dishonest clock
produces entries with wrong or dishonest timestamps, and they still verify. Do not use
`ts` as evidence of when something happened. If you need trusted time, add a timestamping
authority at your layer. `seq` is a reliable per-device order; `ts` is not a reliable
wall clock.

### Key compromise breaks attribution

If an attacker obtains a device's private key, they can sign entries that verify as that
device. Non-extractable keys make theft hard (the key never leaves WebCrypto and cannot
be exported), but a compromised device, a malicious app on it, or an extractable key you
chose to create all defeat this. There is no revocation built in: on compromise, stop
trusting that device id in your registry and rotate to a new identity (see
[how to manage keys](./howto-keys.md)).

### No confidentiality

Payloads are plaintext JSON. Signatures prove authorship, not secrecy. Anyone who sees an
entry sees its contents. If you need to hide data, encrypt it before it becomes a payload;
the library will faithfully sign and chain the ciphertext, but it provides no encryption
of its own.

### No availability

This is a verification substrate, not a system. It does not replicate, store, discover
peers, retry, or stay online. If a device is lost before it hands off its entries, those
entries are gone. Durability and delivery are your transport's job (see
[how to move entries between devices](./howto-transport.md)).

### Not a defense against a malicious majority

Merge is deterministic, not democratic. It does not vote, does not weigh devices, and
does not resolve `divergent_id` by "most copies wins". A flood of forged-but-unverifiable
entries is caught by signature checks; a flood of validly-signed but false entries from
compromised keys is NOT, because each one is individually authentic.

## Assumptions you are trusting

- `globalThis.crypto.subtle` is a correct WebCrypto implementation (browser or Node >= 20).
- SHA-256 and ECDSA P-256 remain unbroken.
- Private keys are generated and stored where the attacker in your model cannot read
  them (the non-extractable default helps, but the host device must not be fully owned).
- Your `content` projection includes every field you intend to protect and is stable
  over time.

If any of these does not hold in your setting, re-examine which guarantees above still
apply.
