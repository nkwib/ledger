import { describe, it, expect } from 'vitest';
import {
	entryContent,
	hashEntry,
	appendEntry,
	verifyChainLink,
	verifyChain
} from './chain.js';
import type { BaseEntry, Content } from './types.js';

/*
 * Hash-chain integrity tests: a valid chain verifies (linkage AND recomputed
 * hashes), and any mutation breaks it. The chain is what signatures cover, so
 * tamper-detection is the load-bearing guarantee here. A generic entry with a
 * MUTABLE `sync` field proves the content projection can exclude fields.
 */

interface Entry extends BaseEntry {
	kind: string;
	sync: 'synced' | 'queued'; // mutable, excluded from the hash
}

/** Content excludes `hash` (output) and the mutable `sync` field. */
const content: Content<Entry> = (e) => ({
	id: e.id,
	deviceId: e.deviceId,
	seq: e.seq,
	ts: e.ts,
	prev: e.prev ?? null,
	kind: e.kind
});

function base(over: Partial<Entry> = {}): Entry {
	return {
		id: 'e1',
		deviceId: 'A',
		seq: 0,
		ts: 1000,
		kind: 'attempt',
		sync: 'synced',
		...over
	};
}

/** Build a valid 3-entry chain for device A. */
async function validChain(): Promise<Entry[]> {
	const e0 = base({ id: 'e0', seq: 0, kind: 'attempt' });
	e0.hash = await hashEntry(e0, content);
	const e1 = base({ id: 'e1', seq: 1, kind: 'zone', prev: e0.hash });
	e1.hash = await hashEntry(e1, content);
	const e2 = base({ id: 'e2', seq: 2, kind: 'top', prev: e1.hash });
	e2.hash = await hashEntry(e2, content);
	return [e0, e1, e2];
}

describe('hashEntry / entryContent', () => {
	it('excludes the mutable field so flipping it does not change the hash', async () => {
		const a = base({ sync: 'queued' });
		const b = base({ sync: 'synced' });
		expect(entryContent(a, content)).toBe(entryContent(b, content));
		expect(await hashEntry(a, content)).toBe(await hashEntry(b, content));
	});

	it('changes when a protected field changes', async () => {
		expect(await hashEntry(base({ ts: 1000 }), content)).not.toBe(
			await hashEntry(base({ ts: 1001 }), content)
		);
		expect(await hashEntry(base({ kind: 'top' }), content)).not.toBe(
			await hashEntry(base({ kind: 'zone' }), content)
		);
	});
});

describe('appendEntry', () => {
	it('chains seq/prev/hash off the head', async () => {
		const first = await appendEntry(
			{ id: 'e0', deviceId: 'A', ts: 1, payload: { n: 1 } },
			null
		);
		expect(first.seq).toBe(0);
		expect(first.prev).toBeNull();
		expect(typeof first.hash).toBe('string');

		const second = await appendEntry(
			{ id: 'e1', deviceId: 'A', ts: 2, payload: { n: 2 } },
			first
		);
		expect(second.seq).toBe(1);
		expect(second.prev).toBe(first.hash);
		expect(verifyChainLink([first, second])).toBe(true);
	});
});

describe('verifyChainLink (sync linkage)', () => {
	it('accepts a valid per-device chain', async () => {
		expect(verifyChainLink(await validChain())).toBe(true);
	});

	it('accepts input in any array order (grouping is by device + seq)', async () => {
		const [e0, e1, e2] = await validChain();
		expect(verifyChainLink([e2, e0, e1])).toBe(true);
	});

	it('rejects a broken prev pointer', async () => {
		const chain = await validChain();
		chain[2] = { ...chain[2], prev: 'tampered' };
		expect(verifyChainLink(chain)).toBe(false);
	});

	it('skips unhashed legacy entries without failing', () => {
		const legacy = base({ id: 'seed', deviceId: 'seed-device' }); // no hash/prev
		expect(verifyChainLink([legacy])).toBe(true);
	});
});

describe('verifyChain (async full verify)', () => {
	it('verifies a valid chain', async () => {
		expect(await verifyChain(await validChain(), content)).toBe(true);
	});

	it('fails when an entry is mutated but its stored hash is not recomputed', async () => {
		const chain = await validChain();
		chain[1] = { ...chain[1], ts: (chain[1].ts as number) + 1 };
		expect(await verifyChain(chain, content)).toBe(false);
	});

	it('fails on broken linkage even if each entry hash is self-consistent', async () => {
		const chain = await validChain();
		const bad = { ...chain[2], prev: 'wrong' };
		bad.hash = await hashEntry(bad, content);
		expect(await verifyChain([chain[0], chain[1], bad], content)).toBe(false);
	});
});
