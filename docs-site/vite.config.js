import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// The playground imports the real library. The package exports map exposes its
// TypeScript source under the development/production conditions; we pin the bare
// specifier to that source so Vite bundles it directly (no separate dist build
// needed). Vite resolves the library's internal `./x.js` imports to `./x.ts`.
const ledgerSrc = fileURLToPath(new URL('../src/index.ts', import.meta.url));

export default defineConfig({
  plugins: [sveltekit()],
  resolve: {
    alias: {
      '@nkwib/ledger': ledgerSrc
    }
  }
});
