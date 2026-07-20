/**
 * Per-device ECDSA P-256 signatures over ledger entries.
 *
 * Each device holds an ECDSA P-256 keypair whose PRIVATE key is non-extractable
 * (it never leaves the WebCrypto store) and whose PUBLIC key is exportable as a
 * JWK so peers can verify. An entry is signed over the SAME canonical content the
 * hash chain uses (your {@link Content} projection), so a signature and a hash
 * protect exactly the same bytes.
 *
 * Device identity is SELF-CERTIFYING: `deviceId = sha256(canonical public-key
 * material)`. Deriving the id from the key means a device cannot claim an
 * identity it does not hold the key for, and any peer can recompute the id from a
 * published JWK to confirm a key registry is honest (see {@link deviceIdMatches}).
 *
 * No dependencies, no import-time side effects; only touches the global `crypto`.
 */

import { sha256Hex, canonicalJSON } from './hash.js';
import { entryContent } from './chain.js';
import type { BaseEntry, Content } from './types.js';

/** Named ECDSA parameters shared by every operation in this module. */
const ALGO_KEY = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const ALGO_SIGN = { name: 'ECDSA', hash: 'SHA-256' } as const;

/** The Web Crypto `SubtleCrypto`, or throw a clear error if unavailable. */
function subtle(): SubtleCrypto {
	const c = (globalThis as { crypto?: Crypto }).crypto;
	if (!c || !c.subtle) {
		throw new Error('Web Crypto is unavailable: signing requires a secure context (HTTPS) or Node >= 20.');
	}
	return c.subtle;
}

/**
 * A device's public identity: the self-certifying id and its public key JWK.
 *
 * @example
 * ```ts
 * const id: DeviceIdentity = await deviceIdentity(pair);
 * const registry = { [id.deviceId]: { publicKeyJwk: id.publicKeyJwk } };
 * ```
 */
export interface DeviceIdentity {
	deviceId: string;
	publicKeyJwk: JsonWebKey;
}

/**
 * Generate a fresh ECDSA P-256 device keypair. The private key is
 * NON-EXTRACTABLE (cannot be exported); the public key is exportable so it can be
 * shared for verification.
 *
 * @example
 * ```ts
 * const pair = await generateDeviceKey();
 * ```
 */
export function generateDeviceKey(): Promise<CryptoKeyPair> {
	return subtle().generateKey(ALGO_KEY, false, ['sign', 'verify']);
}

/**
 * Export the PUBLIC key as a JWK. The private key is never exportable.
 *
 * @example
 * ```ts
 * const jwk = await exportPublicKey(pair.publicKey);
 * ```
 */
export function exportPublicKey(key: CryptoKey): Promise<JsonWebKey> {
	return subtle().exportKey('jwk', key);
}

/**
 * Import a public-key JWK back into a verify-only `CryptoKey`.
 *
 * @example
 * ```ts
 * const pub = await importPublicKey(jwk);
 * ```
 */
export function importPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
	return subtle().importKey('jwk', jwk, ALGO_KEY, true, ['verify']);
}

/**
 * Derive a stable, self-certifying `deviceId` from a public key: the SHA-256
 * (hex) of its canonical material `{ crv, kty, x, y }`. Volatile JWK fields
 * (`key_ops`, `ext`, `use`) are excluded so an export/import round-trip yields
 * the SAME id.
 *
 * @example
 * ```ts
 * const deviceId = await getDeviceId(jwk); // 64 lowercase hex chars
 * ```
 */
export function getDeviceId(jwk: JsonWebKey): Promise<string> {
	const material = canonicalJSON({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y });
	return sha256Hex(material);
}

/**
 * True when `deviceId` is the self-certifying id of `jwk` (registry honesty).
 *
 * @example
 * ```ts
 * await deviceIdMatches(deviceId, jwk); // false if the registry lies about the key
 * ```
 */
export async function deviceIdMatches(deviceId: string, jwk: JsonWebKey): Promise<boolean> {
	return deviceId === (await getDeviceId(jwk));
}

/**
 * Build the full public identity (self-certifying id + JWK) for a keypair.
 *
 * @example
 * ```ts
 * const { deviceId, publicKeyJwk } = await deviceIdentity(pair);
 * ```
 */
export async function deviceIdentity(pair: CryptoKeyPair): Promise<DeviceIdentity> {
	const publicKeyJwk = await exportPublicKey(pair.publicKey);
	const deviceId = await getDeviceId(publicKeyJwk);
	return { deviceId, publicKeyJwk };
}

/**
 * Sign an entry with a device private key. The signature covers the entry's
 * canonical content (`content(entry)`), and is returned base64-encoded. ECDSA is
 * non-deterministic, so two calls on the same entry yield different (both valid)
 * signatures; verify, never compare.
 *
 * @example
 * ```ts
 * const sig = await signEntry(pair.privateKey, entry, defaultContent);
 * ```
 */
export async function signEntry<E extends BaseEntry>(
	privateKey: CryptoKey,
	entry: E,
	content: Content<E>
): Promise<string> {
	const bytes = new TextEncoder().encode(entryContent(entry, content));
	const sig = await subtle().sign(ALGO_SIGN, privateKey, bytes as BufferSource);
	return bytesToBase64(new Uint8Array(sig));
}

/**
 * Verify a base64 signature over an entry against a public key. Returns `false`
 * (never throws) for a tampered entry, a wrong key, or a malformed signature, so
 * it is safe to call on untrusted input during merge. It DOES throw if Web Crypto
 * is unavailable, so a broken environment fails loudly rather than passing data.
 *
 * @example
 * ```ts
 * await verifyEntrySignature(pub, entry, sig, defaultContent);
 * ```
 */
export async function verifyEntrySignature<E extends BaseEntry>(
	publicKey: CryptoKey,
	entry: E,
	signatureB64: string,
	content: Content<E>
): Promise<boolean> {
	const s = subtle();
	try {
		const bytes = new TextEncoder().encode(entryContent(entry, content));
		const sig = base64ToBytes(signatureB64);
		return await s.verify(ALGO_SIGN, publicKey, sig as BufferSource, bytes as BufferSource);
	} catch {
		// Malformed base64 or an otherwise unusable signature: not authentic.
		return false;
	}
}

// -- base64 (dependency-free; btoa/atob exist in browsers and Node >= 16) -------

function bytesToBase64(bytes: Uint8Array): string {
	let bin = '';
	for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
	return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
	const bin = atob(b64);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}
