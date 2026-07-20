// Single source of truth for the docs pipeline. `scripts/build-docs.mjs` reads
// this to know which repo markdown files become routed pages and how relative
// links between them resolve to site routes.

export const REPO = 'nkwib/ledger';
export const BRANCH = 'main';

/**
 * Repo markdown -> generated SvelteKit page. `src` is relative to the repo root
 * (one level above docs-site/). `out` is relative to docs-site/.
 */
export const pages = [
  {
    src: 'docs/tutorial.md',
    route: '/tutorial',
    out: 'src/routes/(docs)/tutorial/+page.svx'
  },
  {
    src: 'docs/howto-verify.md',
    route: '/howto/verify',
    out: 'src/routes/(docs)/howto/verify/+page.svx'
  },
  {
    src: 'docs/howto-conflicts.md',
    route: '/howto/conflicts',
    out: 'src/routes/(docs)/howto/conflicts/+page.svx'
  },
  {
    src: 'docs/howto-keys.md',
    route: '/howto/keys',
    out: 'src/routes/(docs)/howto/keys/+page.svx'
  },
  {
    src: 'docs/howto-transport.md',
    route: '/howto/transport',
    out: 'src/routes/(docs)/howto/transport/+page.svx'
  },
  {
    src: 'docs/reference.md',
    route: '/reference',
    out: 'src/routes/(docs)/reference/+page.svx'
  },
  {
    src: 'docs/threat-model.md',
    route: '/threat-model',
    out: 'src/routes/(docs)/threat-model/+page.svx'
  },
  {
    src: 'docs/design.md',
    route: '/design',
    out: 'src/routes/(docs)/design/+page.svx'
  }
];

/**
 * Extra source -> route mappings used only for rewriting links (these targets
 * are not generated as pages here). The README's own content is retold on the
 * bespoke landing page, so a link to it resolves to `/`.
 */
export const linkOnly = {
  'README.md': '/'
};
