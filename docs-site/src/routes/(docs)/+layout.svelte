<script>
  import { page } from '$app/stores';
  import { afterNavigate } from '$app/navigation';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import PrevNext from '$lib/components/PrevNext.svelte';
  import { sections, prevNext } from '$lib/nav.js';

  let { children } = $props();

  let drawerOpen = $state(false);
  const pn = $derived(prevNext($page.url.pathname));

  afterNavigate(() => {
    drawerOpen = false;
  });
</script>

<div class="docs-shell">
  <!-- Mobile: a drawer toggle in a compact bar -->
  <div class="mobile-bar">
    <button
      class="drawer-toggle"
      aria-expanded={drawerOpen}
      aria-controls="docs-nav"
      onclick={() => (drawerOpen = !drawerOpen)}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      </svg>
      Documentation menu
    </button>
  </div>

  {#if drawerOpen}
    <button class="scrim" aria-label="Close menu" onclick={() => (drawerOpen = false)}></button>
  {/if}

  <aside id="docs-nav" class="sidebar" class:open={drawerOpen}>
    <Sidebar {sections} onnavigate={() => (drawerOpen = false)} />
  </aside>

  <article class="docs-article">
    {@render children()}
    <PrevNext prev={pn.prev} next={pn.next} />
  </article>
</div>

<style>
  .docs-shell {
    max-width: var(--wide-max);
    margin: 0 auto;
    padding: 0 var(--sp-5);
    display: grid;
    grid-template-columns: var(--sidebar-w) minmax(0, 1fr);
    gap: var(--sp-7);
    align-items: start;
  }

  .sidebar {
    position: sticky;
    top: var(--header-h);
    align-self: start;
    max-height: calc(100vh - var(--header-h));
    overflow-y: auto;
  }

  .docs-article {
    padding: var(--sp-7) 0 var(--sp-9);
    max-width: var(--content-max);
    width: 100%;
    min-width: 0;
  }

  .docs-article :global(h1) {
    font-size: var(--fs-2xl);
    margin-top: 0;
  }

  .mobile-bar {
    display: none;
  }

  .drawer-toggle {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    font: inherit;
    font-size: var(--fs-sm);
    font-weight: 500;
    color: var(--c-text);
    background: var(--c-surface);
    border: 1px solid var(--c-border);
    border-radius: var(--r-md);
    padding: var(--sp-2) var(--sp-3);
    cursor: pointer;
  }

  .scrim {
    display: none;
  }

  @media (max-width: 960px) {
    .docs-shell {
      grid-template-columns: 1fr;
      gap: 0;
    }

    .mobile-bar {
      display: block;
      padding: var(--sp-4) 0 0;
    }

    .scrim {
      display: block;
      position: fixed;
      inset: 0;
      z-index: 60;
      background: rgba(0, 0, 0, 0.4);
      border: 0;
      cursor: pointer;
    }

    .sidebar {
      position: fixed;
      top: 0;
      left: 0;
      z-index: 70;
      width: min(80vw, 20rem);
      height: 100vh;
      max-height: 100vh;
      background: var(--c-surface);
      border-right: 1px solid var(--c-border);
      box-shadow: var(--sh-lg);
      transform: translateX(-100%);
      transition: transform 200ms ease;
    }

    .sidebar.open {
      transform: translateX(0);
    }

    .docs-article {
      padding: var(--sp-4) 0 var(--sp-7);
    }
  }
</style>
