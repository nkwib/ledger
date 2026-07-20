import { describe, it, expect } from 'vitest';
import { sha256Hex, canonicalJSON, cryptoAvailable } from './hash.js';

/*
 * Golden-vector + determinism tests: a fixed input yields a known SHA-256, and
 * canonical JSON is key-order independent, so a hash is reproducible anywhere.
 */

describe('sha256Hex', () => {
	it('has real SubtleCrypto in this environment', () => {
		expect(cryptoAvailable()).toBe(true);
	});

	it('hashes a known string to its known SHA-256 hex (golden vector)', async () => {
		expect(await sha256Hex('hello')).toBe(
			'2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
		);
	});

	it('hashes the empty string to the standard SHA-256 empty digest', async () => {
		expect(await sha256Hex('')).toBe(
			'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
		);
	});

	it('hashes raw bytes identically to the equivalent string', async () => {
		const bytes = new TextEncoder().encode('hello');
		expect(await sha256Hex(bytes)).toBe(await sha256Hex('hello'));
		expect(await sha256Hex(bytes.buffer)).toBe(await sha256Hex('hello'));
	});

	it('a one-byte mutation changes the digest', async () => {
		const a = await sha256Hex(new Uint8Array([1, 2, 3, 4]));
		const b = await sha256Hex(new Uint8Array([1, 2, 3, 5]));
		expect(a).not.toBe(b);
	});
});

describe('canonicalJSON', () => {
	it('sorts object keys recursively so order does not affect the string', () => {
		const a = canonicalJSON({ b: 1, a: 2, nested: { y: 1, x: 2 } });
		const b = canonicalJSON({ nested: { x: 2, y: 1 }, a: 2, b: 1 });
		expect(a).toBe(b);
		expect(a).toBe('{"a":2,"b":1,"nested":{"x":2,"y":1}}');
	});

	it('preserves array order (meaningful) while sorting keys inside elements', () => {
		expect(canonicalJSON([{ b: 1, a: 2 }, 3])).toBe('[{"a":2,"b":1},3]');
	});

	it('feeds a deterministic SHA-256 (golden vector over canonical JSON)', async () => {
		const hash = await sha256Hex(canonicalJSON({ a: 2, b: 1, nested: { x: 2, y: 1 } }));
		expect(hash).toBe('a754dc12a997561b68374d89ce27c7f76821d73461880e45e54accf78095fad7');
	});
});
