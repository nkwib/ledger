/**
 * Deterministic, commutative merge of many device logs into one ordered log,
 * with typed conflict flags.
 *
 * Multiple devices each append offline to their own hash chain. The merged log is
 * the deterministic union of all of them: entries are DEDUPLICATED by `id` (the
 * same entry arriving from two transports collapses to one) and returned in the
 * single total order (see {@link orderLedger}). Merging is commutative and
 * associative over the set of input entries, so the result is identical no matter
 * how the logs were split or in which arrival order they arrived.
 *
 * Two tiers:
 * - {@link mergeLedgers} is fast, pure, and SYNC: dedup + order + detect same-id/
 *   different-content forks (a content comparison, no crypto).
 * - {@link verifyAndMergeLedgers} is ASYNC: on top of the sync merge it verifies
 *   each device's hash chain and each entry's signature against a device-key
 *   registry, adding a conflict for every broken chain, unsigned/unknown-device
 *   entry, or forged signature.
 *
 * The conflict list is structured data for a caller to surface to a human; this
 * module builds NO UI and resolves nothing silently.
 */

import type { BaseEntry, LedgerCodec } from './types.js';
import { orderLedger } from './order.js';
import { entryContent, verifyChain } from './chain.js';
import { importPublicKey, verifyEntrySignature, deviceIdMatches } from './signing.js';

/**
 * Kind of ledger conflict a human must resolve.
 *
 * @example
 * ```ts
 * const forks = conflicts.filter((c) => c.kind === 'divergent_id');
 * ```
 */
export type ConflictKind =
	/** Two+ entries share an `id` but differ in content: tamper or fork. */
	| 'divergent_id'
	/** A device's append-only hash chain does not verify. */
	| 'broken_chain'
	/** An entry is unsigned, from an unknown device, or its signature is forged. */
	| 'invalid_signature';

/**
 * A structured conflict for a resolution UI (no UI is built here).
 *
 * @example
 * ```ts
 * for (const c of conflicts) console.warn(`${c.kind} at ${c.entryId}: ${c.detail}`);
 * ```
 */
export interface LedgerConflict<E extends BaseEntry = BaseEntry> {
	kind: ConflictKind;
	/** The entry id at issue (chain conflicts report the first offending entry). */
	entryId: string;
	/** The device the conflict is attributed to. */
	deviceId: string;
	/** Human-readable explanation (English). */
	detail: string;
	/** The entries involved: all divergent variants for `divergent_id`, else the entry. */
	entries: E[];
}

/**
 * Result of a merge: the deduped + ordered entries and any conflicts found.
 *
 * @example
 * ```ts
 * const { entries, conflicts }: MergeResult<E> = mergeLedgers(logs, codec);
 * ```
 */
export interface MergeResult<E extends BaseEntry> {
	entries: E[];
	conflicts: LedgerConflict<E>[];
}

/**
 * A registered device public key, keyed by `deviceId` in the registry.
 *
 * @example
 * ```ts
 * const key: DeviceKey = { publicKeyJwk: identity.publicKeyJwk };
 * ```
 */
export interface DeviceKey {
	publicKeyJwk: JsonWebKey;
}

/**
 * deviceId -> its public key. Supplied to {@link verifyAndMergeLedgers}.
 *
 * @example
 * ```ts
 * const registry: DeviceKeyRegistry = { [id.deviceId]: { publicKeyJwk: id.publicKeyJwk } };
 * ```
 */
export type DeviceKeyRegistry = Record<string, DeviceKey>;

/**
 * entryId -> base64 signature (see {@link signEntry}). Kept outside the entry.
 *
 * @example
 * ```ts
 * const signatures: SignatureMap = { e0: await signEntry(pk, e0, defaultContent) };
 * ```
 */
export type SignatureMap = Record<string, string>;

/**
 * Fast, pure, sync merge: union all logs, dedup by `id`, order by the codec.
 * Identical entries (same `id`, same canonical content) collapse to one; entries
 * that share an `id` but differ in content are a fork and produce a
 * `divergent_id` conflict. The winner kept in `entries` is deterministic (the
 * variant with the lexicographically smallest canonical content), so the output
 * is identical no matter how the logs were split or ordered.
 *
 * @example
 * ```ts
 * const { entries, conflicts } = mergeLedgers([logA, logB], defaultCodec);
 * ```
 */
export function mergeLedgers<E extends BaseEntry>(
	logs: E[][],
	codec: LedgerCodec<E>
): MergeResult<E> {
	// id -> (canonical content -> a representative entry). A Map-of-Maps dedups
	// exact duplicates and detects divergent content for the same id.
	const perId = new Map<string, Map<string, E>>();
	for (const log of logs) {
		for (const entry of log) {
			let variants = perId.get(entry.id);
			if (!variants) {
				variants = new Map();
				perId.set(entry.id, variants);
			}
			const content = entryContent(entry, codec.content);
			if (!variants.has(content)) variants.set(content, entry);
		}
	}

	const merged: E[] = [];
	const conflicts: LedgerConflict<E>[] = [];
	for (const [id, variants] of perId) {
		if (variants.size === 1) {
			merged.push(variants.values().next().value as E);
			continue;
		}
		// Fork: pick a deterministic winner and flag the divergence for a human.
		const orderedContents = [...variants.keys()].sort();
		const entries = orderedContents.map((c) => variants.get(c) as E);
		merged.push(entries[0]);
		conflicts.push({
			kind: 'divergent_id',
			entryId: id,
			deviceId: entries[0].deviceId,
			detail: `Entry ${id} has ${variants.size} divergent versions (tampering or a fork between devices).`,
			entries
		});
	}

	return { entries: orderLedger(merged, codec.compare), conflicts: orderConflicts(conflicts) };
}

/**
 * Async merge with cryptographic verification. Runs {@link mergeLedgers}, then
 * for every device present in the merged entries:
 * - verifies the append-only hash chain; a break -> `broken_chain`.
 * - verifies every entry's signature against the device's registered key; an
 *   entry whose device is unknown, whose signature is missing, or whose signature
 *   does not verify -> `invalid_signature`.
 *
 * When `signatures` is omitted, signature checks are skipped and only chains are
 * verified. A valid, fully-signed set produces zero conflicts. A `deviceId` that
 * looks self-certifying (64 hex chars) MUST hash to its registered key, otherwise
 * the device is treated as unknown; any other id shape is accepted as opaque.
 *
 * @example
 * ```ts
 * const registry = { [id.deviceId]: { publicKeyJwk: id.publicKeyJwk } };
 * const { conflicts } = await verifyAndMergeLedgers([log], defaultCodec, registry, sigs);
 * ```
 */
export async function verifyAndMergeLedgers<E extends BaseEntry>(
	logs: E[][],
	codec: LedgerCodec<E>,
	deviceKeys: DeviceKeyRegistry,
	signatures?: SignatureMap
): Promise<MergeResult<E>> {
	const base = mergeLedgers(logs, codec);
	const conflicts = [...base.conflicts];

	// Group the merged entries by device, deterministically ordered.
	const perDevice = new Map<string, E[]>();
	for (const entry of base.entries) {
		const arr = perDevice.get(entry.deviceId);
		if (arr) arr.push(entry);
		else perDevice.set(entry.deviceId, [entry]);
	}
	const deviceIds = [...perDevice.keys()].sort();

	for (const deviceId of deviceIds) {
		const entries = perDevice.get(deviceId) as E[];

		// 1. Hash chain integrity for this device.
		if (!(await verifyChain(entries, codec.content))) {
			conflicts.push({
				kind: 'broken_chain',
				entryId: entries[0].id,
				deviceId,
				detail: `Hash chain for device ${deviceId} does not verify (tampering or missing entries).`,
				entries
			});
		}

		// 2. Signatures. Skip entirely when no signature map is provided.
		if (!signatures) continue;

		const dk = deviceKeys[deviceId];
		const keyIsHonest = dk ? await deviceIdIsHonest(deviceId, dk.publicKeyJwk) : false;
		const pub = keyIsHonest ? await importPublicKey((dk as DeviceKey).publicKeyJwk) : null;

		for (const entry of entries) {
			if (!pub) {
				conflicts.push(signatureConflict(entry, `device ${deviceId} is unknown or untrusted`));
				continue;
			}
			const sig = signatures[entry.id];
			if (!sig) {
				conflicts.push(signatureConflict(entry, 'not signed'));
				continue;
			}
			if (!(await verifyEntrySignature(pub, entry, sig, codec.content))) {
				conflicts.push(signatureConflict(entry, 'invalid signature (forged or altered entry)'));
			}
		}
	}

	return { entries: base.entries, conflicts: orderConflicts(conflicts) };
}

/**
 * Registry honesty for self-certifying ids: a 64-hex-char id looks like a
 * sha256 device id and MUST hash to its key; any other shape is treated as an
 * opaque id and accepted as-is.
 */
async function deviceIdIsHonest(deviceId: string, jwk: JsonWebKey): Promise<boolean> {
	if (/^[0-9a-f]{64}$/.test(deviceId)) return deviceIdMatches(deviceId, jwk);
	return true;
}

function signatureConflict<E extends BaseEntry>(entry: E, reason: string): LedgerConflict<E> {
	return {
		kind: 'invalid_signature',
		entryId: entry.id,
		deviceId: entry.deviceId,
		detail: `Entry ${entry.id}: ${reason}.`,
		entries: [entry]
	};
}

/** Stable conflict order so the list is identical across input permutations. */
function orderConflicts<E extends BaseEntry>(conflicts: LedgerConflict<E>[]): LedgerConflict<E>[] {
	return [...conflicts].sort((a, b) => {
		if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
		if (a.entryId !== b.entryId) return a.entryId < b.entryId ? -1 : 1;
		return a.deviceId < b.deviceId ? -1 : a.deviceId > b.deviceId ? 1 : 0;
	});
}
