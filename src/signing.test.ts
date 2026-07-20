import { describe, it, expect } from 'vitest';
import {
	generateDeviceKey,
	exportPublicKey,
	importPublicKey,
	signEntry,
	verifyEntrySignature,
	getDeviceId,
	deviceIdMatches,
	deviceIdentity
} from './signing.js';
import type { BaseEntry, Content } from './types.js';

/*
 * Device-signature tests. A genuine signature verifies; a tampered entry, a
 * wrong key, or a garbage signature all fail; public keys round-trip through JWK
 * export/import; and the self-certifying deviceId is stable and bound to the key.
 */

interface Entry extends BaseEntry {
	kind: string;
	sync: 'synced' | 'queued';
}

const content: Content<Entry> = (e) => ({
	id: e.id,
	deviceId: e.deviceId,
	seq: e.seq,
	ts: e.ts,
	prev: e.prev ?? null,
	kind: e.kind
});

function base(over: Partial<Entry> = {}): Entry {
	return { id: 'e1', deviceId: 'A', seq: 0, ts: 1000, kind: 'attempt', sync: 'synced', ...over };
}

describe('signEntry / verifyEntrySignature', () => {
	it('a genuine signature verifies against the matching public key', async () => {
		const pair = await generateDeviceKey();
		const entry = base();
		const sig = await signEntry(pair.privateKey, entry, content);
		expect(typeof sig).toBe('string');
		expect(sig.length).toBeGreaterThan(0);
		expect(await verifyEntrySignature(pair.publicKey, entry, sig, content)).toBe(true);
	});

	it('fails when the entry is tampered after signing', async () => {
		const pair = await generateDeviceKey();
		const sig = await signEntry(pair.privateKey, base({ ts: 1000 }), content);
		expect(await verifyEntrySignature(pair.publicKey, base({ ts: 1001 }), sig, content)).toBe(false);
		expect(await verifyEntrySignature(pair.publicKey, base({ kind: 'top' }), sig, content)).toBe(
			false
		);
	});

	it('ignores the mutable field (signing covers the projected content only)', async () => {
		const pair = await generateDeviceKey();
		const sig = await signEntry(pair.privateKey, base({ sync: 'queued' }), content);
		expect(await verifyEntrySignature(pair.publicKey, base({ sync: 'synced' }), sig, content)).toBe(
			true
		);
	});

	it('fails against a different device key', async () => {
		const pair = await generateDeviceKey();
		const other = await generateDeviceKey();
		const entry = base();
		const sig = await signEntry(pair.privateKey, entry, content);
		expect(await verifyEntrySignature(other.publicKey, entry, sig, content)).toBe(false);
	});

	it('returns false (never throws) on a malformed signature', async () => {
		const pair = await generateDeviceKey();
		expect(await verifyEntrySignature(pair.publicKey, base(), 'not-base64-!!', content)).toBe(false);
		expect(await verifyEntrySignature(pair.publicKey, base(), '', content)).toBe(false);
	});
});

describe('public key export / import', () => {
	it('round-trips through JWK: the imported key still verifies', async () => {
		const pair = await generateDeviceKey();
		const entry = base();
		const sig = await signEntry(pair.privateKey, entry, content);

		const jwk = await exportPublicKey(pair.publicKey);
		expect(jwk.kty).toBe('EC');
		expect(jwk.crv).toBe('P-256');
		expect('d' in jwk).toBe(false); // never leaks private material

		const reimported = await importPublicKey(jwk);
		expect(await verifyEntrySignature(reimported, entry, sig, content)).toBe(true);
	});
});

describe('self-certifying deviceId', () => {
	it('is stable across an export/import round-trip of the same key', async () => {
		const pair = await generateDeviceKey();
		const jwk1 = await exportPublicKey(pair.publicKey);
		const reimported = await importPublicKey(jwk1);
		const jwk2 = await exportPublicKey(reimported);
		expect(await getDeviceId(jwk1)).toBe(await getDeviceId(jwk2));
	});

	it('differs for two independently generated devices', async () => {
		const a = await deviceIdentity(await generateDeviceKey());
		const b = await deviceIdentity(await generateDeviceKey());
		expect(a.deviceId).not.toBe(b.deviceId);
		expect(a.deviceId).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
	});

	it('deviceIdMatches confirms a key owns its id and rejects a foreign key', async () => {
		const a = await deviceIdentity(await generateDeviceKey());
		const b = await deviceIdentity(await generateDeviceKey());
		expect(await deviceIdMatches(a.deviceId, a.publicKeyJwk)).toBe(true);
		expect(await deviceIdMatches(a.deviceId, b.publicKeyJwk)).toBe(false);
	});
});
