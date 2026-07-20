import { describe, it, expect } from 'vitest';
import { hashEntry, entryContent } from './chain.js';
import { canonicalJSON, sha256Hex } from './hash.js';
import type { BaseEntry, Content } from './types.js';

/*
 * GOLDEN COMPATIBILITY TEST.
 *
 * The parent app (street-bouldering) signs and chains rows whose canonical
 * content is a FLAT object with a fixed field set (see the app's
 * src/lib/crypto/_content.ts). This test pins the exact SHA-256 that content
 * produced BEFORE the ledger substrate was extracted into this package, proving
 * the library reproduces the same hash byte-for-byte. If this ever fails, an
 * existing signed chain in the wild would stop verifying: do not "fix" it by
 * changing the expected value, fix the code that changed the bytes.
 *
 * The expected hash was computed independently (Node crypto) over the real seed
 * row `seed-a1-b1-0` of the Fiuggi 2025 demo event.
 */

/** A real app row: envelope fields + the domain fields it carries as siblings. */
interface AppRow extends BaseEntry {
	tipo: string;
	bloccoId: string;
	atletaId: string;
	eventoId: string;
	origine: string;
	targetId?: string | null;
}

/** The app's exact flat projection (excludes `hash` and the mutable `sync`). */
const appContent: Content<AppRow> = (r) => ({
	id: r.id,
	tipo: r.tipo,
	bloccoId: r.bloccoId,
	atletaId: r.atletaId,
	eventoId: r.eventoId,
	ts: r.ts,
	origine: r.origine,
	deviceId: r.deviceId,
	seq: r.seq,
	targetId: r.targetId ?? null,
	prev: r.prev ?? null
});

const SEED_ROW: AppRow = {
	id: 'seed-a1-b1-0',
	tipo: 'tentativo',
	bloccoId: 'b1',
	atletaId: 'a1',
	eventoId: 'fiuggi-2025',
	ts: 1748000000000,
	origine: 'atleta',
	deviceId: 'seed-device',
	seq: 0
};

const GOLDEN_CANONICAL =
	'{"atletaId":"a1","bloccoId":"b1","deviceId":"seed-device","eventoId":"fiuggi-2025","id":"seed-a1-b1-0","origine":"atleta","prev":null,"seq":0,"targetId":null,"tipo":"tentativo","ts":1748000000000}';
const GOLDEN_HASH = '31e1aac29869e926cf7cfd2cfad8a4825843a7fcbf3c2a03de828899ba809ae2';

describe('golden compatibility with the parent app', () => {
	it('produces the exact canonical content string the old code produced', () => {
		expect(entryContent(SEED_ROW, appContent)).toBe(GOLDEN_CANONICAL);
	});

	it('produces the exact SHA-256 the old code produced (existing chains still verify)', async () => {
		expect(await hashEntry(SEED_ROW, appContent)).toBe(GOLDEN_HASH);
	});

	it('canonicalJSON + sha256Hex compose to the same golden hash', async () => {
		expect(await sha256Hex(canonicalJSON(appContent(SEED_ROW)))).toBe(GOLDEN_HASH);
	});
});
