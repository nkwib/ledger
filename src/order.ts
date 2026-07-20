/**
 * Deterministic total order over ledger entries.
 *
 * A single, stable total order is what makes the merge commutative and
 * associative: any set of entries, arriving in any order, reduces to the same
 * ordered log. The order is pure and never touches the hash chain.
 */

import type { BaseEntry, Compare } from './types.js';

/**
 * Built-in total order: `(seq, deviceId, ts, id)`. `seq` is the monotonic
 * per-device counter, so within one device it equals real append order;
 * `deviceId`, then `ts`, then `id` break ties across devices. Numeric `ts` is
 * compared numerically, string `ts` lexicographically.
 *
 * @example
 * ```ts
 * [b, a].sort(defaultCompare); // stable regardless of input order
 * ```
 */
export function defaultCompare(a: BaseEntry, b: BaseEntry): number {
	if (a.seq !== b.seq) return a.seq - b.seq;
	if (a.deviceId !== b.deviceId) return a.deviceId < b.deviceId ? -1 : 1;
	if (a.ts !== b.ts) {
		if (typeof a.ts === 'number' && typeof b.ts === 'number') return a.ts - b.ts;
		return a.ts < b.ts ? -1 : 1;
	}
	return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Return a new array of entries in deterministic total order. The input is never
 * mutated. Pass a custom `compare` to override the built-in order.
 *
 * @example
 * ```ts
 * const ordered = orderLedger([...logA, ...logB]);
 * ```
 */
export function orderLedger<E extends BaseEntry>(
	entries: E[],
	compare: Compare<E> = defaultCompare
): E[] {
	return [...entries].sort(compare);
}
