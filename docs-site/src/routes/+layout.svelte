<script>
  import '@fontsource/inter/400.css';
  import '@fontsource/inter/500.css';
  import '@fontsource/inter/600.css';
  import '@fontsource/inter/700.css';
  import '@fontsource/jetbrains-mono/400.css';
  import '@fontsource/jetbrains-mono/500.css';
  import '@fontsource/jetbrains-mono/600.css';
  import '../styles/global.css';

  import { onMount } from 'svelte';
  import { afterNavigate } from '$app/navigation';
  import Header from '$lib/components/Header.svelte';
  import Footer from '$lib/components/Footer.svelte';
  import { renderMermaid } from '$lib/mermaid.js';

  let { children } = $props();

  onMount(() => {
    renderMermaid();
    const onTheme = () => renderMermaid();
    window.addEventListener('themechange', onTheme);
    return () => window.removeEventListener('themechange', onTheme);
  });

  // Re-hydrate diagrams after client-side navigation into a page that has them.
  afterNavigate(() => {
    renderMermaid();
  });
</script>

<svelte:head>
  <script>
    // Apply stored theme before paint to avoid a flash.
    (function () {
      try {
        var stored = localStorage.getItem('ledger-theme');
        var theme =
          stored === 'light' || stored === 'dark'
            ? stored
            : window.matchMedia('(prefers-color-scheme: dark)').matches
              ? 'dark'
              : 'light';
        document.documentElement.dataset.theme = theme;
      } catch (_) {}
    })();
  </script>
</svelte:head>

<div class="page-shell">
  <Header />
  <div class="page-content">
    {@render children()}
  </div>
  <Footer />
</div>

<style>
  .page-shell {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }

  .page-content {
    flex: 1;
  }
</style>
