/**
 * Append-only hash chain, one chain per device.
 *
 * Each entry carries `prev` (the hash of the previous entry on the SAME device)
 * and `hash` (SHA-256 over the entry's canonical content). Chaining makes any
 * tampering detectable: change one field and the recomputed hash diverges.
 *
 * Two verification tiers:
 * - {@link verifyChainLink} is a fast, pure, SYNC linkage check (do the `prev`
 *   pointers line up per device, given the stored hashes).
 * - {@link verifyChain} is the async full verify: it recomputes every hash and
 *   compares, on top of the linkage check.
 *
 * Entries whose `hash` is absent are treated as legacy/unchained and skipped, so
 * a pre-hashing seed row never fails verification.
 */

import { sha256Hex, canonicalJSON } from './hash.js';
import type { BaseEntry, Content, LedgerEntry } from './types.js';
import { defaultContent } from './types.js';

/**
 * The canonical content STRING of an entry (what gets hashed and signed):
 * `canonicalJSON(content(entry))`. Useful to compare two entries for byte
 * equality without hashing.
 *
 * @example
 * ```ts
 * entryContent(entry, defaultContent); // '{"deviceId":"A",...}'
 * ```
 */
export function entryContent<E extends BaseEntry>(entry: E, content: Content<E>): string {
	return canonicalJSON(content(entry));
}

/**
 * SHA-256 (hex) of an entry's canonical content. This is the value stored in
 * `entry.hash` and chained into the next entry's `prev`.
 *
 * @example
 * ```ts
 * const h = await hashEntry(entry, defaultContent);
 * ```
 */
export function hashEntry<E extends BaseEntry>(entry: E, content: Content<E>): Promise<string> {
	return sha256Hex(entryContent(entry, content));
}

/** Group entries by `deviceId`, each group sorted by `(seq, id)`. */
function byDevice<E extends BaseEntry>(entries: E[]): Map<string, E[]> {
	const per = new Map<string, E[]>();
	for (const e of entries) {
		const arr = per.get(e.deviceId);
		if (arr) arr.push(e);
		else per.set(e.deviceId, [e]);
	}
	for (const arr of per.values()) {
		arr.sort((a, b) => (a.seq !== b.seq ? a.seq - b.seq : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
	}
	return per;
}

/**
 * Fast, pure linkage check (sync). Per device, each hashed entry's `prev` must
 * equal the previous hashed entry's `hash`, and the first hashed entry must have
 * no `prev`. Unhashed (legacy) entries are skipped. Returns `false` as soon as
 * any link is broken. Order of the input array does not matter (grouping is by
 * device + seq).
 *
 * @example
 * ```ts
 * verifyChainLink(entries); // true when every device chain links up
 * ```
 */
export function verifyChainLink<E extends BaseEntry>(entries: E[]): boolean {
	for (const arr of byDevice(entries).values()) {
		let expected: string | undefined;
		for (const e of arr) {
			if (e.hash === undefined) {
				expected = undefined; // a gap: an unhashed entry restarts the chain
				continue;
			}
			if ((e.prev ?? undefined) !== expected) return false;
			expected = e.hash;
		}
	}
	return true;
}

/**
 * Full async verify: linkage AND every stored `hash` recomputed from content. A
 * mutated field makes the recomputed hash diverge and fails. Unhashed entries
 * are skipped.
 *
 * @example
 * ```ts
 * await verifyChain(entries, defaultContent); // false if any entry was altered
 * ```
 */
export async function verifyChain<E extends BaseEntry>(
	entries: E[],
	content: Content<E>
): Promise<boolean> {
	if (!verifyChainLink(entries)) return false;
	for (const e of entries) {
		if (e.hash === undefined) continue;
		if ((await hashEntry(e, content)) !== e.hash) return false;
	}
	return true;
}

/**
 * Build the next {@link LedgerEntry} on a device chain: fills in `seq`
 * (`head.seq + 1`, or 0 for the first), `prev` (`head.hash`, or `null`), and
 * `hash`. Pass `head = null` for the first entry. Does NOT sign; see
 * {@link signEntry}.
 *
 * @example
 * ```ts
 * const first  = await appendEntry({ id: 'e0', deviceId: 'A', ts: Date.now(), payload: { x: 1 } }, null);
 * const second = await appendEntry({ id: 'e1', deviceId: 'A', ts: Date.now(), payload: { x: 2 } }, first);
 * ```
 */
export async function appendEntry<P>(
	input: { id: string; deviceId: string; ts: number | string; payload: P },
	head: BaseEntry | null,
	content: Content<LedgerEntry<P>> = defaultContent
): Promise<LedgerEntry<P>> {
	const entry: LedgerEntry<P> = {
		id: input.id,
		deviceId: input.deviceId,
		ts: input.ts,
		seq: head ? head.seq + 1 : 0,
		prev: head?.hash ?? null,
		payload: input.payload
	};
	entry.hash = await hashEntry(entry, content);
	return entry;
}
