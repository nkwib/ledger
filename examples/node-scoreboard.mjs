// A tiny two-device scoreboard, end to end, in one file.
//
// Two devices each sign entries onto their own hash chain, the logs merge
// deterministically, then one byte is tampered and verification names the exact
// broken entry.
//
// Run it:
//   - In this repo:      pnpm --filter @blocco/ledger test   (runs it via Vitest)
//   - As a dependency:   node node-scoreboard.mjs
//
// The `runScoreboard()` export is exercised by example.test.ts so this file can
// never silently drift from the real API.

import {
	appendEntry,
	signEntry,
	verifyEntrySignature,
	generateDeviceKey,
	deviceIdentity,
	defaultContent,
	mergeLedgers,
	verifyAndMergeLedgers,
	defaultCodec
} from '@blocco/ledger';

export async function runScoreboard({ log = () => {} } = {}) {
	// 1. Each device gets a keypair and a self-certifying id.
	const alice = await generateDeviceKey();
	const bob = await generateDeviceKey();
	const idA = await deviceIdentity(alice);
	const idB = await deviceIdentity(bob);

	const sigs = {};
	const sign = async (privateKey, entry) => {
		sigs[entry.id] = await signEntry(privateKey, entry, defaultContent);
		return entry;
	};

	// 2. Alice records two entries; Bob records one. Each chains off its own head.
	const a0 = await sign(alice.privateKey, await appendEntry({ id: 'a0', deviceId: idA.deviceId, ts: 1, payload: { athlete: 'ada', points: 2 } }, null));
	const a1 = await sign(alice.privateKey, await appendEntry({ id: 'a1', deviceId: idA.deviceId, ts: 2, payload: { athlete: 'ada', points: 3 } }, a0));
	const b0 = await sign(bob.privateKey, await appendEntry({ id: 'b0', deviceId: idB.deviceId, ts: 1, payload: { athlete: 'bo', points: 4 } }, null));

	const logA = [a0, a1];
	const logB = [b0];

	// 3. Merge the two logs. Deterministic, order-independent.
	const merged = mergeLedgers([logA, logB], defaultCodec);
	const totals = {};
	for (const e of merged.entries) totals[e.payload.athlete] = (totals[e.payload.athlete] ?? 0) + e.payload.points;
	log('merged entries:', merged.entries.map((e) => e.id).join(', '));
	log('totals:', JSON.stringify(totals));

	// 4. Full crypto verification: chains + signatures. A clean set has 0 conflicts.
	const registry = {
		[idA.deviceId]: { publicKeyJwk: idA.publicKeyJwk },
		[idB.deviceId]: { publicKeyJwk: idB.publicKeyJwk }
	};
	const clean = await verifyAndMergeLedgers([logA, logB], defaultCodec, registry, sigs);
	log('conflicts (clean):', clean.conflicts.length);

	// 5. Tamper one byte: change Alice's second entry's points, keep its old hash.
	const tampered = [a0, { ...a1, payload: { ...a1.payload, points: 999 } }];
	const afterTamper = await verifyAndMergeLedgers([tampered, logB], defaultCodec, registry, sigs);
	const broken = afterTamper.conflicts.map((c) => `${c.kind}:${c.entryId}`);
	log('conflicts (tampered):', broken.join(', '));

	// A one-off check anyone can run: the stored signature no longer matches.
	const stillValid = await verifyEntrySignature(alice.publicKey, tampered[1], sigs['a1'], defaultContent);
	log('tampered a1 signature still valid?', stillValid);

	return { totals, cleanConflicts: clean.conflicts.length, brokenFlags: broken, stillValid };
}

// Run when invoked directly (node node-scoreboard.mjs), stay quiet when imported.
if (import.meta.url === `file://${process.argv[1]}`) {
	runScoreboard({ log: (...a) => console.log(...a) }).catch((e) => {
		console.error(e);
		process.exit(1);
	});
}
