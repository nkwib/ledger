import { describe, it, expect } from 'vitest';
import { mergeLedgers, verifyAndMergeLedgers, type DeviceKeyRegistry } from './merge.js';
import { appendEntry, hashEntry } from './chain.js';
import { generateDeviceKey, deviceIdentity, signEntry } from './signing.js';
import { defaultContent, type LedgerEntry, type LedgerCodec } from './types.js';

/*
 * Cross-device merge tests. Two device logs merge order-independently to the
 * same reduced result; merge is commutative and associative over the set of
 * entries; same-id/different-content forks, broken hash chains, and
 * forged/unsigned entries all surface as structured conflicts; a valid signed
 * set produces zero conflicts. A tiny generic payload + reducer stands in for
 * any real domain.
 */

interface Score {
	athlete: string;
	points: number;
}
type Entry = LedgerEntry<Score>;
const codec: LedgerCodec<Entry> = { content: defaultContent };

function entry(over: Partial<Entry> & { payload?: Partial<Score> } = {}): Entry {
	return {
		id: 'e1',
		deviceId: 'A',
		seq: 0,
		ts: 1000,
		prev: null,
		...over,
		payload: { athlete: 'ada', points: 1, ...(over.payload ?? {}) }
	} as Entry;
}

/** Sum points per athlete over a merged log (order-independent reducer). */
function totals(entries: Entry[]): Record<string, number> {
	const out: Record<string, number> = {};
	for (const e of entries) out[e.payload.athlete] = (out[e.payload.athlete] ?? 0) + e.payload.points;
	return out;
}

/** Build a valid signed hash chain for a device. */
async function buildChain(
	deviceId: string,
	privateKey: CryptoKey,
	specs: { id: string; payload: Score }[]
): Promise<{ rows: Entry[]; sigs: Record<string, string> }> {
	const rows: Entry[] = [];
	const sigs: Record<string, string> = {};
	let head: Entry | null = null;
	let ts = 1000;
	for (const spec of specs) {
		const row = await appendEntry({ id: spec.id, deviceId, ts: ts++, payload: spec.payload }, head);
		sigs[row.id] = await signEntry(privateKey, row, defaultContent);
		rows.push(row);
		head = row;
	}
	return { rows, sigs };
}

describe('mergeLedgers - dedup + deterministic order', () => {
	it('deduplicates the same entry arriving from multiple logs', () => {
		const r = entry({ id: 'dup', deviceId: 'd1', seq: 0 });
		const res = mergeLedgers([[r], [r], [{ ...r }]], codec);
		expect(res.entries.length).toBe(1);
		expect(res.conflicts.length).toBe(0);
	});

	it('produces an identical merged log regardless of input order', () => {
		const a = entry({ id: 'a', deviceId: 'd1', seq: 0, ts: 100 });
		const b = entry({ id: 'b', deviceId: 'd2', seq: 0, ts: 50 });
		const c = entry({ id: 'c', deviceId: 'd1', seq: 1, ts: 200 });
		expect(mergeLedgers([[a, b], [c]], codec).entries).toEqual(
			mergeLedgers([[c], [b, a]], codec).entries
		);
	});
});

describe('mergeLedgers - commutativity and associativity over 3 logs', () => {
	const L1 = [
		entry({ id: '1', deviceId: 'd1', seq: 0, ts: 10 }),
		entry({ id: '2', deviceId: 'd1', seq: 1, ts: 20 })
	];
	const L2 = [entry({ id: '3', deviceId: 'd2', seq: 0, ts: 15 })];
	const L3 = [
		entry({ id: '4', deviceId: 'd3', seq: 0, ts: 5 }),
		entry({ id: '5', deviceId: 'd2', seq: 1, ts: 25 })
	];
	const expected = mergeLedgers([L1, L2, L3], codec).entries;

	it('is commutative across all permutations of the logs', () => {
		const perms = [
			[L1, L2, L3],
			[L1, L3, L2],
			[L2, L1, L3],
			[L2, L3, L1],
			[L3, L1, L2],
			[L3, L2, L1]
		];
		for (const perm of perms) expect(mergeLedgers(perm, codec).entries).toEqual(expected);
	});

	it('is associative regardless of how the logs are grouped', () => {
		const left = mergeLedgers([mergeLedgers([L1, L2], codec).entries, L3], codec).entries;
		const right = mergeLedgers([L1, mergeLedgers([L2, L3], codec).entries], codec).entries;
		expect(left).toEqual(expected);
		expect(right).toEqual(expected);
	});
});

describe('mergeLedgers - reduces to the same totals regardless of split/order', () => {
	const logA = [
		entry({ id: 'a-0', deviceId: 'devA', seq: 0, payload: { athlete: 'a1', points: 1 } }),
		entry({ id: 'a-1', deviceId: 'devA', seq: 1, payload: { athlete: 'a1', points: 2 } })
	];
	const logB = [
		entry({ id: 'b-0', deviceId: 'devB', seq: 0, payload: { athlete: 'a2', points: 5 } })
	];

	it('yields the same totals whether merged A+B, B+A, or as one combined log', () => {
		const t1 = totals(mergeLedgers([logA, logB], codec).entries);
		const t2 = totals(mergeLedgers([logB, logA], codec).entries);
		const t3 = totals(mergeLedgers([[...logB, ...logA]], codec).entries);
		expect(t1).toEqual(t2);
		expect(t1).toEqual(t3);
		expect(t1).toEqual({ a1: 3, a2: 5 });
	});
});

describe('mergeLedgers - divergent_id conflict (tamper / fork)', () => {
	it('flags two entries that share an id but differ in content, deterministically', () => {
		const r1 = entry({ id: 'x', deviceId: 'd1', seq: 0, ts: 100 });
		const r2 = entry({ id: 'x', deviceId: 'd1', seq: 0, ts: 200 });
		const res = mergeLedgers([[r1], [r2]], codec);
		expect(res.entries.length).toBe(1);
		expect(res.conflicts.length).toBe(1);
		expect(res.conflicts[0].kind).toBe('divergent_id');
		expect(res.conflicts[0].entries.length).toBe(2);
		expect(mergeLedgers([[r1], [r2]], codec).entries[0]).toEqual(
			mergeLedgers([[r2], [r1]], codec).entries[0]
		);
		expect(mergeLedgers([[r1], [r2]], codec).conflicts).toEqual(
			mergeLedgers([[r2], [r1]], codec).conflicts
		);
	});
});

describe('verifyAndMergeLedgers - chains and signatures', () => {
	it('a valid, fully-signed two-device set produces zero conflicts', async () => {
		const pairA = await generateDeviceKey();
		const idA = await deviceIdentity(pairA);
		const pairB = await generateDeviceKey();
		const idB = await deviceIdentity(pairB);

		const A = await buildChain(idA.deviceId, pairA.privateKey, [
			{ id: 'a0', payload: { athlete: 'a1', points: 1 } },
			{ id: 'a1', payload: { athlete: 'a1', points: 2 } }
		]);
		const B = await buildChain(idB.deviceId, pairB.privateKey, [
			{ id: 'b0', payload: { athlete: 'a2', points: 3 } }
		]);

		const registry: DeviceKeyRegistry = {
			[idA.deviceId]: { publicKeyJwk: idA.publicKeyJwk },
			[idB.deviceId]: { publicKeyJwk: idB.publicKeyJwk }
		};
		const sigs = { ...A.sigs, ...B.sigs };

		const res = await verifyAndMergeLedgers([A.rows, B.rows], codec, registry, sigs);
		expect(res.conflicts).toEqual([]);
		expect(res.entries.length).toBe(3);
	});

	it('flags a broken hash chain', async () => {
		const pairA = await generateDeviceKey();
		const idA = await deviceIdentity(pairA);
		const A = await buildChain(idA.deviceId, pairA.privateKey, [
			{ id: 'c0', payload: { athlete: 'a1', points: 1 } },
			{ id: 'c1', payload: { athlete: 'a1', points: 2 } }
		]);
		const broken = [...A.rows];
		broken[1] = { ...broken[1], ts: (broken[1].ts as number) + 999 };

		const res = await verifyAndMergeLedgers([broken], codec, {});
		expect(res.conflicts.some((c) => c.kind === 'broken_chain' && c.deviceId === idA.deviceId)).toBe(
			true
		);
	});

	it('flags an unsigned entry (present in the log, missing from the signature map)', async () => {
		const pairA = await generateDeviceKey();
		const idA = await deviceIdentity(pairA);
		const A = await buildChain(idA.deviceId, pairA.privateKey, [
			{ id: 'u0', payload: { athlete: 'a1', points: 1 } },
			{ id: 'u1', payload: { athlete: 'a1', points: 2 } }
		]);
		const registry: DeviceKeyRegistry = { [idA.deviceId]: { publicKeyJwk: idA.publicKeyJwk } };
		const sigs = { ...A.sigs };
		delete sigs['u1'];

		const res = await verifyAndMergeLedgers([A.rows], codec, registry, sigs);
		expect(res.conflicts.some((c) => c.kind === 'invalid_signature' && c.entryId === 'u1')).toBe(
			true
		);
		expect(res.conflicts.some((c) => c.entryId === 'u0')).toBe(false);
	});

	it('flags a forged signature (signed by a key other than the registered one)', async () => {
		const pairA = await generateDeviceKey();
		const idA = await deviceIdentity(pairA);
		const attacker = await generateDeviceKey();
		const A = await buildChain(idA.deviceId, pairA.privateKey, [
			{ id: 'f0', payload: { athlete: 'a1', points: 1 } }
		]);
		A.sigs['f0'] = await signEntry(attacker.privateKey, A.rows[0], defaultContent);

		const registry: DeviceKeyRegistry = { [idA.deviceId]: { publicKeyJwk: idA.publicKeyJwk } };
		const res = await verifyAndMergeLedgers([A.rows], codec, registry, A.sigs);
		expect(res.conflicts.some((c) => c.kind === 'invalid_signature' && c.entryId === 'f0')).toBe(
			true
		);
		expect(res.conflicts.some((c) => c.kind === 'broken_chain')).toBe(false);
	});

	it('flags entries from a device with no registered key', async () => {
		const pairA = await generateDeviceKey();
		const idA = await deviceIdentity(pairA);
		const A = await buildChain(idA.deviceId, pairA.privateKey, [
			{ id: 'k0', payload: { athlete: 'a1', points: 1 } }
		]);
		const res = await verifyAndMergeLedgers([A.rows], codec, {}, A.sigs);
		expect(res.conflicts.some((c) => c.kind === 'invalid_signature' && c.entryId === 'k0')).toBe(
			true
		);
	});

	it('sanity: a built chain hashes consistently', async () => {
		const pairA = await generateDeviceKey();
		const idA = await deviceIdentity(pairA);
		const A = await buildChain(idA.deviceId, pairA.privateKey, [
			{ id: 's0', payload: { athlete: 'a1', points: 1 } }
		]);
		expect(await hashEntry(A.rows[0], defaultContent)).toBe(A.rows[0].hash);
	});
});
