import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { mdsvex, escapeSvelte } from 'mdsvex';
import remarkGfm from 'remark-gfm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Prism = require('prismjs');
const loadLanguages = require('prismjs/components/');

loadLanguages([
  'markup',
  'css',
  'clike',
  'javascript',
  'typescript',
  'tsx',
  'json',
  'bash',
  'diff',
  'yaml'
]);

const ALIASES = {
  ts: 'typescript',
  js: 'javascript',
  sh: 'bash',
  shell: 'bash',
  console: 'bash',
  html: 'markup',
  xml: 'markup'
};

// Prism highlighter that emits our token-classed markup. Mermaid fences never
// reach this: the docs prebuild rewrites them into <div class="mermaid-diagram">
// containers before mdsvex sees the file.
function highlighter(code, lang) {
  const language = ALIASES[lang] || lang || 'plain';
  const grammar = Prism.languages[language];
  const html = grammar
    ? Prism.highlight(code, grammar, language)
    : Prism.util.encode(code).toString();
  return `<pre class="code-block language-${language}" data-lang="${language}"><code class="language-${language}">${escapeSvelte(html)}</code></pre>`;
}

/** @type {import('@sveltejs/kit').Config} */
export default {
  extensions: ['.svelte', '.svx'],
  preprocess: [
    vitePreprocess(),
    mdsvex({
      extensions: ['.svx'],
      smartypants: false,
      remarkPlugins: [remarkGfm],
      highlight: { highlighter }
    })
  ],
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      // Emits build/404.html (served by Cloudflare's not_found_handling =
      // "404-page"). All real routes are still fully prerendered; this only
      // catches genuinely unknown paths and shows +error.svelte.
      fallback: '404.html',
      precompress: false,
      strict: true
    })
  }
};
