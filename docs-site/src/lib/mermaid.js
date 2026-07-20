// Client-side, lazy-loaded, theme-aware Mermaid rendering.
//
// The docs pipeline and the <Mermaid> component both emit
//   <div class="mermaid-diagram" data-mermaid="<base64 source>"></div>
// This module decodes the source, dynamically imports mermaid only when a
// diagram is actually on the page, and re-renders on theme change. Runs in the
// browser only (guarded by callers), so it never runs during prerender.

let mermaidPromise = null;
let idCounter = 0;

async function getMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((m) => m.default);
  }
  return mermaidPromise;
}

function currentTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'default';
}

function decode(b64) {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Base64-encode diagram source (works during SSR and in the browser). */
export function encodeMermaid(code) {
  if (typeof btoa === 'function') {
    return btoa(String.fromCharCode(...new TextEncoder().encode(code)));
  }
  return Buffer.from(code, 'utf8').toString('base64');
}

/**
 * Render (or re-render, e.g. after a theme switch) every mermaid container under
 * `root`. No-op when there are none, so the mermaid bundle is never fetched on
 * pages without a diagram.
 */
export async function renderMermaid(root = document) {
  const nodes = root.querySelectorAll('.mermaid-diagram[data-mermaid]');
  if (!nodes.length) return;

  let mermaid;
  try {
    mermaid = await getMermaid();
  } catch {
    return; // offline / bundle failed; leave the raw container in place
  }

  mermaid.initialize({
    startOnLoad: false,
    theme: currentTheme(),
    securityLevel: 'strict',
    fontFamily: 'var(--font-sans)'
  });

  for (const el of nodes) {
    let code = el.__mmdSrc;
    if (code === undefined) {
      try {
        code = decode(el.getAttribute('data-mermaid'));
      } catch {
        continue;
      }
      el.__mmdSrc = code;
    }
    try {
      const { svg } = await mermaid.render(`mmd-${idCounter++}`, code);
      el.innerHTML = svg;
      el.dataset.rendered = 'true';
    } catch (err) {
      el.innerHTML = `<pre class="mermaid-error">mermaid: ${String(err)}</pre>`;
    }
  }
}
