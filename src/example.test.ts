import { describe, it, expect } from 'vitest';
// @ts-expect-error - plain .mjs example, no type declarations by design
import { runScoreboard } from '../examples/node-scoreboard.mjs';

/*
 * Executes the Node example end to end so it can never rot: if the public API
 * changes shape, this fails. Mirrors the flow a reader copy-pastes.
 */

describe('examples/node-scoreboard.mjs', () => {
	it('signs, merges, and names the tampered entry', async () => {
		const r = await runScoreboard();
		expect(r.totals).toEqual({ ada: 5, bo: 4 });
		expect(r.cleanConflicts).toBe(0);
		// The tampered entry is reported by id, via a signature (and chain) conflict.
		expect(r.brokenFlags.some((f: string) => f.includes('a1'))).toBe(true);
		expect(r.stillValid).toBe(false);
	});
});
