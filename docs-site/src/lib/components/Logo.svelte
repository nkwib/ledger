<script>
  let { size = 26 } = $props();
</script>

<span class="logo">
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    aria-hidden="true"
    role="img"
    fill="none"
  >
    <!-- Shield + check: tamper-evident, verified. -->
    <path
      d="M16 4.5l9.5 3.4v6.8c0 6.6-4.1 10.9-9.5 12.8-5.4-1.9-9.5-6.2-9.5-12.8V7.9L16 4.5z"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linejoin="round"
    />
    <path
      d="M11.4 15.6l3.3 3.3 6.2-6.8"
      stroke="var(--c-accent)"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
  <span class="wordmark">@blocco/ledger</span>
</span>

<style>
  .logo {
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    color: var(--c-text);
    font-weight: 600;
    letter-spacing: -0.02em;
  }

  .wordmark {
    font-family: var(--font-mono);
    font-size: 0.95rem;
  }
</style>
