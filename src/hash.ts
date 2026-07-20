/**
 * Real cryptographic hashing and deterministic JSON.
 *
 * SHA-256 over actual bytes via `globalThis.crypto.subtle`, plus a canonical JSON
 * serializer so a value hashes deterministically regardless of key order. No
 * dependencies, no import-time side effects; only touches the global `crypto`.
 */

/** The Web Crypto `SubtleCrypto`, or throw a clear error if unavailable. */
function subtle(): SubtleCrypto {
	const c = (globalThis as { crypto?: Crypto }).crypto;
	if (!c || !c.subtle) {
		// crypto.subtle needs a secure context (HTTPS) in browsers, and Node >= 20
		// exposes it on globalThis. A plain-HTTP page or an old runtime lands here:
		// fail loudly, never silently pass unverified data.
		throw new Error('Web Crypto is unavailable: hashing requires a secure context (HTTPS) or Node >= 20.');
	}
	return c.subtle;
}

/**
 * True when real SHA-256 can be computed in this environment.
 *
 * @example
 * ```ts
 * if (!cryptoAvailable()) throw new Error('need a secure context');
 * ```
 */
export function cryptoAvailable(): boolean {
	const c = (globalThis as { crypto?: Crypto }).crypto;
	return !!c?.subtle;
}

/**
 * SHA-256 of the input, returned as lowercase hex. Strings are UTF-8 encoded
 * first; a `Uint8Array` or `ArrayBuffer` is hashed as-is.
 *
 * @example
 * ```ts
 * await sha256Hex('hello');
 * // '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
 * ```
 */
export async function sha256Hex(input: ArrayBuffer | Uint8Array | string): Promise<string> {
	const bytes =
		typeof input === 'string'
			? new TextEncoder().encode(input)
			: input instanceof Uint8Array
				? input
				: new Uint8Array(input);
	const digest = await subtle().digest('SHA-256', bytes as BufferSource);
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Deterministic JSON: object keys are sorted recursively so the same logical
 * value always serializes to the same string (and therefore the same SHA-256).
 * Array order is preserved (it is meaningful); primitives pass through.
 *
 * @example
 * ```ts
 * canonicalJSON({ b: 1, a: 2 }); // '{"a":2,"b":1}'
 * canonicalJSON({ a: 2, b: 1 }); // '{"a":2,"b":1}' (same bytes)
 * ```
 */
export function canonicalJSON(value: unknown): string {
	return JSON.stringify(sortKeys(value));
}

function sortKeys(v: unknown): unknown {
	if (Array.isArray(v)) return v.map(sortKeys);
	if (v && typeof v === 'object') {
		const src = v as Record<string, unknown>;
		const out: Record<string, unknown> = {};
		for (const k of Object.keys(src).sort()) out[k] = sortKeys(src[k]);
		return out;
	}
	return v;
}
