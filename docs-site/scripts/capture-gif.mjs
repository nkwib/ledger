/**
 * Capture the playground's sign -> merge -> tamper arc as a README-quality GIF.
 *
 * Pipeline: Playwright (headless Chromium, recordVideo) drives the built site
 * deterministically -> webm -> ffmpeg two-pass palette encode -> GIF.
 *
 * Usage: pnpm build && pnpm preview --port 4310 &
 *        node scripts/capture-gif.mjs [outDir]
 * Requires: ffmpeg on PATH.
 */
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PORT = Number(process.env.PORT) || 4310;
const outDir = process.argv[2] || 'gif-out';
mkdirSync(outDir, { recursive: true });

const VIEW = { width: 1000, height: 800 };
const browser = await chromium.launch();
const context = await browser.newContext({
	viewport: VIEW,
	recordVideo: { dir: outDir, size: VIEW },
	colorScheme: 'dark'
});
const page = await context.newPage();

const settle = async (sel) => {
	await page.locator(sel).first().evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
	await page.waitForTimeout(700);
};

await page.goto(`http://localhost:${PORT}/playground`, { waitUntil: 'networkidle' });

// Stage 1: device keys.
const gen = page.getByRole('button', { name: 'Generate device keys' });
await gen.waitFor({ state: 'visible' });
await page.waitForFunction(() => !document.querySelector('button.big')?.disabled);
await settle('button.big');
await gen.click();
await page.waitForTimeout(1100);

// Stage 2: signed entries on both chains.
const appends = page.getByRole('button', { name: 'Append & sign' });
await settle('button.accent');
await appends.nth(0).click();
await page.waitForTimeout(650);
await appends.nth(0).click();
await page.waitForTimeout(650);
await appends.nth(1).click();
await page.waitForTimeout(900);

// Stage 3: deterministic merge, zero conflicts.
const merge = page.getByRole('button', { name: 'Merge & verify the logs' });
await merge.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
await page.waitForTimeout(700);
await merge.click();
await page.waitForTimeout(1600);

// Stage 4: flip one byte, watch verification name the entry.
const tamper = page.getByRole('button', { name: 'Flip one byte & re-verify' });
await tamper.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
await page.waitForTimeout(600);
await page.locator('select').first().selectOption({ index: 1 });
await page.waitForTimeout(500);
await tamper.click();
try {
	await page.getByText(/broken_chain|invalid_signature/).first().waitFor({ timeout: 8000 });
} catch {
	console.warn('conflict text not found; capturing whatever rendered');
}
await page.waitForTimeout(2200);

await context.close();
await browser.close();

const webm = readdirSync(outDir)
	.filter((f) => f.endsWith('.webm'))
	.map((f) => join(outDir, f))
	.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];

const gif = join(outDir, 'demo.gif');
execFileSync('ffmpeg', [
	'-y',
	'-ss', '0.4',
	'-i', webm,
	'-filter_complex',
	'[0:v] fps=12,scale=820:-1:flags=lanczos,split [a][b];[a] palettegen=stats_mode=diff [p];[b][p] paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle',
	'-loop', '0',
	gif
], { stdio: 'inherit' });

console.log(`\nGIF written: ${gif} (${Math.round(statSync(gif).size / 1024)} KB)`);
