<script>
  /** @type {{ prev: { href: string, label: string } | null, next: { href: string, label: string } | null }} */
  let { prev, next } = $props();
</script>

{#if prev || next}
  <nav class="prevnext" aria-label="Pagination">
    {#if prev}
      <a class="pn prev" href={prev.href}>
        <span class="dir">← Previous</span>
        <span class="label">{prev.label}</span>
      </a>
    {:else}
      <span></span>
    {/if}
    {#if next}
      <a class="pn next" href={next.href}>
        <span class="dir">Next →</span>
        <span class="label">{next.label}</span>
      </a>
    {/if}
  </nav>
{/if}

<style>
  .prevnext {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--sp-4);
    margin-top: var(--sp-8);
    padding-top: var(--sp-5);
    border-top: 1px solid var(--c-border);
  }

  .pn {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--sp-3) var(--sp-4);
    border: 1px solid var(--c-border);
    border-radius: var(--r-md);
    text-decoration: none;
    background: var(--c-surface);
    transition: border-color 120ms ease, background 120ms ease;
  }

  .pn:hover {
    border-color: var(--c-accent);
    text-decoration: none;
    background: var(--c-bg-alt);
  }

  .pn.next {
    text-align: right;
  }

  .dir {
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    color: var(--c-text-subtle);
  }

  .label {
    color: var(--c-text);
    font-weight: 500;
    font-size: var(--fs-sm);
  }

  @media (max-width: 560px) {
    .prevnext {
      grid-template-columns: 1fr;
    }
    .pn.next {
      text-align: left;
    }
  }
</style>
