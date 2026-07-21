/**
 * Docs pipeline: transform the repo's markdown (../README.md, ../docs/*.md) into
 * routed SvelteKit `.svx` pages. The repo markdown stays the single source of
 * truth; editing it and rebuilding updates the site. Run automatically by the
 * `dev` and `build` npm scripts.
 *
 * Per file it:
 *  - extracts the page title from the first `#` heading and a description from
 *    the first paragraph (for <title> + OpenGraph/meta);
 *  - rewrites relative links between docs to site routes, falling back to the
 *    GitHub blob/tree URL for targets not published here (LICENSE, examples/);
 *  - turns ```mermaid fences into <div class="mermaid-diagram" data-mermaid>
 *    containers (base64 so the diagram source never hits the Svelte compiler),
 *    hydrated client-side and theme-aware by src/lib/mermaid.js;
 *  - leaves every other code fence for mdsvex + Prism to highlight (ts/js/bash/
 *    json/html), and relies on mdsvex to escape inline-code braces/angles.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pages, linkOnly, REPO, BRANCH } from './docs.config.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const siteRoot = resolve(here, '..');
const repoRoot = resolve(siteRoot, '..');

// normalized source path (relative to repo root) -> site route
const routeMap = new Map();
for (const p of pages) routeMap.set(p.src, p.route);
for (const [src, route] of Object.entries(linkOnly)) routeMap.set(src, route);

const escText = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\{/g, '&#123;').replace(/\}/g, '&#125;');
const escAttr = (s) => escText(s).replace(/"/g, '&quot;');

function ghUrl(path, anchor) {
  const kind = /\.[a-z0-9]+$/i.test(path) ? 'blob' : 'tree';
  return `https://github.com/${REPO}/${kind}/${BRANCH}/${path}${anchor}`;
}

function rewriteLinks(line, srcDir) {
  return line.replace(/\]\(([^)\s]+)\)/g, (whole, url) => {
    // Leave external, mail, in-page, and already-absolute links untouched.
    if (/^(https?:|mailto:|tel:|#|\/)/i.test(url)) return whole;
    const hashIdx = url.indexOf('#');
    const anchor = hashIdx >= 0 ? url.slice(hashIdx) : '';
    const rel = hashIdx >= 0 ? url.slice(0, hashIdx) : url;
    const norm = posix.normalize(posix.join(srcDir, rel));
    if (routeMap.has(norm)) return `](${routeMap.get(norm)}${anchor})`;
    return `](${ghUrl(norm, anchor)})`;
  });
}

/** Split into code fences vs prose; rewrite links in prose, containerize mermaid. */
function transformBody(src, srcRelPath) {
  const srcDir = posix.dirname(srcRelPath);
  const lines = src.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const open = lines[i].match(/^```(\S*)\s*$/);
    if (open) {
      const lang = open[1];
      const body = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) body.push(lines[i++]);
      i++; // consume closing fence
      if (lang === 'mermaid') {
        const b64 = Buffer.from(body.join('\n'), 'utf8').toString('base64');
        out.push('', `<div class="mermaid-diagram" data-mermaid="${b64}"></div>`, '');
      } else {
        out.push('```' + lang, ...body, '```');
      }
      continue;
    }
    out.push(rewriteLinks(lines[i], srcDir));
    i++;
  }
  return out.join('\n');
}

function extractTitle(src) {
  for (const line of src.split('\n')) {
    const m = line.match(/^#\s+(.+?)\s*$/);
    if (m) return m[1].replace(/`/g, '');
  }
  return 'Documentation';
}

function extractDescription(src) {
  const lines = src.split('\n');
  let seenH1 = false;
  let inFence = false;
  const para = [];
  for (const line of lines) {
    if (/^```/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    if (/^#\s+/.test(line)) { seenH1 = true; continue; }
    if (!seenH1) continue;
    // Skip leading blanks/blockquotes/tables/lists before the first prose paragraph.
    if (para.length === 0 && (/^\s*$/.test(line) || /^[#>|*-]/.test(line))) continue;
    if (para.length > 0 && /^\s*$/.test(line)) break; // paragraph ended
    para.push(line.trim());
  }
  const text = para
    .join(' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links -> text
    .replace(/[`*_]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) {
    return 'Verifiable offline ledger: per-device signed hash chains that merge deterministically, with typed conflict flags.';
  }
  return text.length > 155 ? text.slice(0, 152).trimEnd() + '...' : text;
}

let count = 0;
for (const page of pages) {
  const srcAbs = resolve(repoRoot, page.src);
  const raw = readFileSync(srcAbs, 'utf8');
  const title = extractTitle(raw);
  const description = extractDescription(raw);
  const body = transformBody(raw, page.src);

  const svx = `<svelte:head>
  <title>${escText(title)} · @nkwib/ledger</title>
  <meta name="description" content="${escAttr(description)}" />
  <meta property="og:title" content="${escAttr(title)} · @nkwib/ledger" />
  <meta property="og:description" content="${escAttr(description)}" />
</svelte:head>

${body}
`;

  const outAbs = resolve(siteRoot, page.out);
  mkdirSync(dirname(outAbs), { recursive: true });
  writeFileSync(outAbs, svx, 'utf8');
  count++;
  console.log(`  ${page.src}  ->  ${page.route}`);
}

console.log(`docs pipeline: generated ${count} page(s) from repo markdown.`);

// Animated hero: single source lives in ../.github/assets (kept out of the npm tarball).
{
  const { copyFileSync, existsSync } = await import('node:fs');
  const src = new URL('../../.github/assets/demo.gif', import.meta.url);
  if (existsSync(src)) {
    copyFileSync(src, new URL('../static/demo.gif', import.meta.url));
    console.log('docs pipeline: copied animated hero -> static/demo.gif');
  }
}
