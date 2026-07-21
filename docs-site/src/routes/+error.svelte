<script>
  import { page } from '$app/stores';
</script>

<svelte:head>
  <title>{$page.status} · @nkwib/ledger</title>
</svelte:head>

<section class="err">
  <div class="code">{$page.status}</div>
  <h1>{$page.status === 404 ? 'Page not found' : 'Something went wrong'}</h1>
  <p>
    {$page.status === 404
      ? 'That page has no signed entry in this chain.'
      : $page.error?.message || 'An unexpected error occurred.'}
  </p>
  <div class="actions">
    <a class="btn primary" href="/">Home</a>
    <a class="btn ghost" href="/tutorial">Read the tutorial</a>
    <a class="btn ghost" href="/playground">Open the playground</a>
  </div>
</section>

<style>
  .err {
    max-width: 40rem;
    margin: 0 auto;
    padding: var(--sp-9) var(--sp-5);
    text-align: center;
  }

  .code {
    font-family: var(--font-mono);
    font-size: var(--fs-4xl);
    font-weight: 700;
    color: var(--c-accent);
    letter-spacing: -0.04em;
  }

  h1 {
    font-size: var(--fs-2xl);
    margin-top: var(--sp-3);
  }

  p {
    color: var(--c-text-muted);
    margin-bottom: var(--sp-6);
  }

  .actions {
    display: inline-flex;
    gap: var(--sp-3);
    flex-wrap: wrap;
    justify-content: center;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    padding: 0.55rem 1rem;
    border-radius: var(--r-md);
    font-size: var(--fs-sm);
    font-weight: 600;
    text-decoration: none;
  }

  .btn.primary {
    background: var(--c-accent);
    color: var(--c-accent-fg);
    border: 1px solid var(--c-accent);
  }

  .btn.ghost {
    background: var(--c-bg-alt);
    color: var(--c-text);
    border: 1px solid var(--c-border-strong);
  }

  .btn:hover {
    text-decoration: none;
    filter: brightness(1.03);
  }
</style>
