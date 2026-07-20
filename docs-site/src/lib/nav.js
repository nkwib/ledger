// Sidebar structure (Diataxis order) and the flat ordered list that drives
// prev/next. Kept in sync with scripts/docs.config.mjs by convention.

export const sections = [
  {
    label: 'Tutorial',
    items: [{ href: '/tutorial', label: 'Multi-device scoreboard' }]
  },
  {
    label: 'How-to',
    items: [
      { href: '/howto/verify', label: 'Verify entries & chains' },
      { href: '/howto/conflicts', label: 'Handle conflicts' },
      { href: '/howto/keys', label: 'Manage keys' },
      { href: '/howto/transport', label: 'Move entries between devices' }
    ]
  },
  {
    label: 'Reference',
    items: [{ href: '/reference', label: 'API reference' }]
  },
  {
    label: 'Explanation',
    items: [
      { href: '/threat-model', label: 'Threat model' },
      { href: '/design', label: 'Design notes' }
    ]
  },
  {
    label: 'Try it',
    items: [{ href: '/playground', label: 'Playground' }]
  }
];

/** Flat, ordered list of docs pages (excludes the playground) for prev/next. */
export const flatNav = sections
  .filter((s) => s.label !== 'Try it')
  .flatMap((s) => s.items);

export function prevNext(pathname) {
  const i = flatNav.findIndex((item) => item.href === pathname);
  if (i === -1) return { prev: null, next: null };
  return {
    prev: i > 0 ? flatNav[i - 1] : null,
    next: i < flatNav.length - 1 ? flatNav[i + 1] : null
  };
}
