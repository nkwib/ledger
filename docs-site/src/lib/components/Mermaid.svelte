<script>
  import { encodeMermaid } from '$lib/mermaid.js';

  /** @type {{ code: string, caption?: string }} */
  let { code, caption = '' } = $props();

  // The layout's mermaid hydrator finds this container and replaces its contents
  // with the rendered SVG on mount (and again on theme change). Before hydration
  // (and with JS off) the raw diagram source shows as a graceful fallback.
  const data = encodeMermaid(code.trim());
</script>

<figure class="mermaid-figure">
  <div class="mermaid-diagram" data-mermaid={data}>
    <pre class="mermaid-src">{code.trim()}</pre>
  </div>
  {#if caption}
    <figcaption>{caption}</figcaption>
  {/if}
</figure>

<style>
  .mermaid-figure {
    margin: var(--sp-6) 0;
  }

  .mermaid-src {
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    color: var(--c-text-subtle);
    background: var(--c-code-bg);
    border: 1px dashed var(--c-border);
    border-radius: var(--r-md);
    padding: var(--sp-4);
    overflow-x: auto;
    margin: 0;
  }

  figcaption {
    text-align: center;
    color: var(--c-text-subtle);
    font-size: var(--fs-sm);
    margin-top: var(--sp-3);
  }
</style>
