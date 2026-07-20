/**
 * Core types for the verifiable ledger substrate.
 *
 * The library never sees your domain. It reads only the ENVELOPE fields it needs
 * to chain, order, sign and merge entries ({@link BaseEntry}); everything else is
 * your opaque `payload`. Hashing and signing are driven by a {@link Content}
 * projection you supply, so the exact bytes that get hashed are always under your
 * control (and can be kept byte-for-byte stable across refactors).
 */

/**
 * The envelope fields every ledger operation reads. Your own entry type only has
 * to be assignable to this: carry these fields (under these names) and put the
 * rest of your data wherever you like (a nested `payload`, or as sibling fields).
 *
 * - `id`       globally unique entry id (a UUID is fine).
 * - `deviceId` the writer. One append-only hash chain exists PER device.
 * - `seq`      monotonic per-device counter, starting at 0. Defines append order.
 * - `ts`       a timestamp CLAIM (epoch ms number or ISO string). Never a proof.
 * - `prev`     hash of the previous entry on the same device (`null` on the first).
 * - `hash`     this entry's own hash (set by {@link appendEntry}); absent = not yet
 *              chained, and such entries are skipped by the chain verifier.
 *
 * @example
 * ```ts
 * const entry: BaseEntry = {
 *   id: 'e1', deviceId: 'A', seq: 0, ts: Date.now(), prev: null
 * };
 * ```
 */
export interface BaseEntry {
	id: string;
	deviceId: string;
	seq: number;
	ts: number | string;
	prev?: string | null;
	hash?: string;
}

/**
 * The recommended, clean shape for new adopters: the {@link BaseEntry} envelope
 * plus a typed `payload` holding your domain data.
 *
 * @example
 * ```ts
 * type Score = { athlete: string; points: number };
 * const e: LedgerEntry<Score> = {
 *   id: 'e1', deviceId: 'A', seq: 0, ts: Date.now(), prev: null,
 *   payload: { athlete: 'ada', points: 3 }
 * };
 * ```
 */
export interface LedgerEntry<P = unknown> extends BaseEntry {
	payload: P;
}

/**
 * Projects an entry to the value that is canonicalized (see
 * {@link canonicalJSON}) and then hashed / signed. It MUST exclude the entry's
 * own `hash` (that is the output) and any MUTABLE field you do not want to
 * protect (for example a local "sync" flag), and it MUST be deterministic.
 *
 * @example
 * ```ts
 * // Flat entry: protect everything except a mutable `sync` field and `hash`.
 * const content: Content<MyEntry> = (e) => ({
 *   id: e.id, deviceId: e.deviceId, seq: e.seq, ts: e.ts,
 *   prev: e.prev ?? null, kind: e.kind
 * });
 * ```
 */
export type Content<E extends BaseEntry> = (entry: E) => unknown;

/**
 * Total-order comparator over entries (see {@link orderLedger}).
 *
 * @example
 * ```ts
 * const bySeq: Compare<BaseEntry> = (a, b) => a.seq - b.seq;
 * ```
 */
export type Compare<E extends BaseEntry> = (a: E, b: E) => number;

/**
 * The two things merge/verify need to know about YOUR entries: how to project an
 * entry to its signable content, and (optionally) how to order entries. Omit
 * `compare` to use the built-in `(seq, deviceId, ts, id)` total order.
 *
 * @example
 * ```ts
 * const codec: LedgerCodec<LedgerEntry<Score>> = { content: defaultContent };
 * ```
 */
export interface LedgerCodec<E extends BaseEntry> {
	content: Content<E>;
	compare?: Compare<E>;
}

/**
 * Default {@link Content} for the {@link LedgerEntry} shape: the envelope fields
 * plus the nested `payload`, with `prev` normalized to `null`. Collision-free
 * (your data stays under `payload`). If you need a flat layout or custom field
 * exclusions, write your own `Content` instead.
 *
 * @example
 * ```ts
 * defaultContent({ id: 'e1', deviceId: 'A', seq: 0, ts: 1, prev: undefined, payload: { x: 1 } });
 * // => { id: 'e1', deviceId: 'A', seq: 0, ts: 1, prev: null, payload: { x: 1 } }
 * ```
 */
export function defaultContent<P>(entry: LedgerEntry<P>): unknown {
	return {
		id: entry.id,
		deviceId: entry.deviceId,
		seq: entry.seq,
		ts: entry.ts,
		prev: entry.prev ?? null,
		payload: entry.payload
	};
}

/**
 * A ready-made {@link LedgerCodec} using {@link defaultContent} and the built-in
 * order. Convenient for the common `LedgerEntry<P>` case.
 *
 * @example
 * ```ts
 * const result = mergeLedgers([logA, logB], defaultCodec);
 * ```
 */
export const defaultCodec: LedgerCodec<LedgerEntry> = { content: defaultContent };
