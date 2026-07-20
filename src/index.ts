/**
 * @blocco/ledger — a verifiable offline ledger substrate.
 *
 * Per-device ECDSA-signed SHA-256 hash chains that merge deterministically into
 * one ordered log, with typed conflict flags. Zero runtime dependencies,
 * isomorphic (browser + Node >= 20), WebCrypto only. See the README and docs/.
 */

// Types + codec
export type {
	BaseEntry,
	LedgerEntry,
	Content,
	Compare,
	LedgerCodec
} from './types.js';
export { defaultContent, defaultCodec } from './types.js';

// Hashing + canonical JSON
export { sha256Hex, canonicalJSON, cryptoAvailable } from './hash.js';

// Ordering
export { orderLedger, defaultCompare } from './order.js';

// Hash chain
export { entryContent, hashEntry, appendEntry, verifyChainLink, verifyChain } from './chain.js';

// Signatures + device identity
export type { DeviceIdentity } from './signing.js';
export {
	generateDeviceKey,
	exportPublicKey,
	importPublicKey,
	getDeviceId,
	deviceIdMatches,
	deviceIdentity,
	signEntry,
	verifyEntrySignature
} from './signing.js';

// Merge + conflicts
export type {
	ConflictKind,
	LedgerConflict,
	MergeResult,
	DeviceKey,
	DeviceKeyRegistry,
	SignatureMap
} from './merge.js';
export { mergeLedgers, verifyAndMergeLedgers } from './merge.js';
