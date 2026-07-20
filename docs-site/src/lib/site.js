// Site-wide constants. Update NPM_URL once the package is published to npm.

export const PACKAGE = '@blocco/ledger';
export const VERSION = 'v0.1';
export const GITHUB_URL = 'https://github.com/nkwib/ledger';

// The package is not published yet. Until it is, the npm link points at the repo.
// Change this single constant (to https://www.npmjs.com/package/@blocco/ledger)
// once it ships.
export const NPM_URL = GITHUB_URL;
export const NPM_PUBLISHED = false;

export const TAGLINE =
  'A verifiable offline ledger: per-device signed hash chains that merge deterministically, with typed conflicts.';
