<script>
  import Mermaid from '$lib/components/Mermaid.svelte';
  import { GITHUB_URL } from '$lib/site.js';

  const diagram = `flowchart LR
  subgraph DA["Device A (offline)"]
    A0["entry a0"] --> A1["entry a1"]
  end
  subgraph DB["Device B (offline)"]
    B0["entry b0"]
  end
  A1 -- "signed chain" --> M{{"mergeLedgers"}}
  B0 -- "signed chain" --> M
  M --> O["one ordered log"]
  M --> V{{"verifyAndMergeLedgers"}}
  V --> OK["0 conflicts: clean"]
  V --> C["typed conflicts:<br/>divergent_id<br/>broken_chain<br/>invalid_signature"]`;

  const notFor = [
    {
      need: 'Rich collaborative merge (text, trees) without authenticity',
      use: 'Automerge, Yjs',
      why: 'CRDTs merge concurrent edits field by field, but accept whatever a peer sends. No tamper-evidence.'
    },
    {
      need: 'A tamper-evident log with a single writer',
      use: 'An append-only signed audit log',
      why: 'If only one party ever writes, you do not need cross-device merge. Simpler.'
    },
    {
      need: 'A full peer-to-peer append-only stack (replication, discovery, storage)',
      use: 'Hypercore',
      why: 'Hypercore is a whole P2P system. This library is just the verifiable core, transport-agnostic.'
    },
    {
      need: 'A server-side, publicly auditable transparency log',
      use: 'Trillian',
      why: 'Merkle-tree transparency logs assume a central, always-on server. This is offline-first and serverless.'
    },
    {
      need: 'Confidentiality (hiding contents)',
      use: 'An encryption layer',
      why: 'Signatures prove authorship, not secrecy. Payloads are plaintext.'
    }
  ];
</script>

<svelte:head>
  <title>@blocco/ledger — verifiable offline ledger</title>
  <meta
    name="description"
    content="Prove your offline app's history was not tampered with, and merge many writers verifiably. Per-device signed hash chains, deterministic merge, typed conflicts. Zero dependencies."
  />
</svelte:head>

<section class="hero">
  <div class="hero-grid">
    <div class="hero-copy">
      <span class="badge">
        <span class="dot" aria-hidden="true"></span>
        v0.1 · MIT · zero deps · WebCrypto · browser + Node
      </span>
      <h1>
        Prove your offline history<br />
        <span class="accent">was not tampered with.</span>
      </h1>
      <p class="lede">
        Local-first apps create data on offline devices, edited by different people, synced
        later in any order. <strong>@blocco/ledger</strong> gives each device a signed
        hash chain, merges them deterministically, and surfaces tampering, forks, and
        forged signatures as <strong>typed conflict flags</strong> — never silent failures.
      </p>

      <div class="cta">
        <a class="btn primary" href="/playground">
          Open the playground
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M8 5l8 7-8 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </a>
        <a class="btn ghost" href="/tutorial">Read the tutorial</a>
      </div>

      <pre class="install"><span class="prompt">$</span> npm install @blocco/ledger</pre>
    </div>

    <aside class="demo" aria-label="Quickstart with tamper detection">
      <div class="demo-tab">
        <span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>
        <span class="filename">quickstart.mjs</span>
      </div>
      <pre class="demo-code"><code><span class="cmt">// two devices, each a signed hash chain</span>
<span class="kw">const</span> a0 = <span class="kw">await</span> <span class="fn">put</span>(a, idA, <span class="str">'a0'</span>, <span class="kw">null</span>, &lbrace; points: <span class="num">2</span> &rbrace;);
<span class="kw">const</span> b0 = <span class="kw">await</span> <span class="fn">put</span>(b, idB, <span class="str">'b0'</span>, <span class="kw">null</span>, &lbrace; points: <span class="num">4</span> &rbrace;);

<span class="cmt">// deterministic union, any arrival order</span>
<span class="fn">mergeLedgers</span>([[a0], [b0]], defaultCodec);   <span class="cmt">// 2 entries</span>

<span class="cmt">// flip one byte after signing, then verify</span>
<span class="kw">const</span> forged = &lbrace; ...a0, payload: &lbrace; points: <span class="num">999</span> &rbrace; &rbrace;;
<span class="kw">await</span> <span class="fn">verifyAndMergeLedgers</span>([[forged], [b0]], ...);
<span class="bad"><span class="bad-line">// broken_chain      -> a0</span>
<span class="bad-line">// invalid_signature -> a0</span></span></code></pre>
    </aside>
  </div>
</section>

<section class="strip">
  <div class="strip-inner">
    <div class="problem">
      <span class="num-badge">1</span>
      <p>You cannot prove a record was not altered after it was written.</p>
    </div>
    <div class="problem">
      <span class="num-badge">2</span>
      <p>When several devices each hold part of the truth, you cannot merge them into one history everyone can independently check.</p>
    </div>
    <p class="strip-note">
      CRDTs solve merging but trust their inputs. Signed audit logs solve authenticity but
      assume one writer. This does both, with one small idea.
    </p>
  </div>
</section>

<section class="features">
  <div class="features-inner">
    <div class="feature">
      <div class="feature-icon">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 3l7 2.5v5C19 15.6 16 19 12 20.5 8 19 5 15.6 5 10.5v-5L12 3z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
          <path d="M9 12l2 2 4-4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </div>
      <h3>Tamper-evident by hash chain</h3>
      <p>Every device keeps an append-only SHA-256 chain. Change one field and the recomputed hash diverges: the chain no longer verifies.</p>
    </div>

    <div class="feature">
      <div class="feature-icon">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="4" y="10" width="8" height="8" rx="2" stroke="currentColor" stroke-width="1.6" />
          <path d="M8 10V8a3 3 0 0 1 6 0" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
          <circle cx="17.5" cy="7" r="2.5" stroke="currentColor" stroke-width="1.6" />
        </svg>
      </div>
      <h3>Signed, self-certifying identity</h3>
      <p>Each entry is signed with a non-extractable ECDSA P-256 key. The device id is the hash of its own public key, so identity cannot be spoofed.</p>
    </div>

    <div class="feature">
      <div class="feature-icon">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 4v6a4 4 0 0 0 4 4h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M6 20v-6a4 4 0 0 1 4-4h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M15 11l3 3-3 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </div>
      <h3>Deterministic merge</h3>
      <p>Logs from any number of devices merge into one ordered log, identically regardless of arrival order. Commutative and associative over the set of entries.</p>
    </div>

    <div class="feature">
      <div class="feature-icon">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 3l9 16H3L12 3z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
          <path d="M12 10v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
          <circle cx="12" cy="16.5" r="1" fill="currentColor" />
        </svg>
      </div>
      <h3>Typed conflicts, no silent fixes</h3>
      <p><code>divergent_id</code>, <code>broken_chain</code>, <code>invalid_signature</code>. The library gives you facts and where they happened; you decide the policy.</p>
    </div>

    <div class="feature">
      <div class="feature-icon">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6" />
          <path d="M2 12h20M12 3c2.5 2.5 3.8 5.7 3.8 9S14.5 18.5 12 21c-2.5-2.5-3.8-5.7-3.8-9S9.5 5.5 12 3z" stroke="currentColor" stroke-width="1.4" />
        </svg>
      </div>
      <h3>Zero deps, isomorphic</h3>
      <p>Nothing to audit but this. Runs the same in a browser and in Node &ge; 20, touching only <code>globalThis.crypto.subtle</code>. TypeScript strict, generic over your payload.</p>
    </div>

    <div class="feature">
      <div class="feature-icon">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3" y="4" width="18" height="16" rx="2.5" stroke="currentColor" stroke-width="1.6" />
          <path d="M3 9h18" stroke="currentColor" stroke-width="1.4" />
          <path d="M8 14h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
        </svg>
      </div>
      <h3>A substrate, not a framework</h3>
      <p>No storage, no network, no UI. You bring those; the library gives you the verifiable core, transport-agnostic and honest about scope.</p>
    </div>
  </div>
</section>

<section class="diagram-section">
  <div class="diagram-inner">
    <h2>How it fits together</h2>
    <p class="section-lede">
      Each device appends to its own chain and signs each entry. Merge unions and orders
      the logs deterministically; the crypto tier additionally verifies every chain and
      signature and reports what failed and where.
    </p>
    <Mermaid code={diagram} caption="Signed per-device chains merge into one ordered log; verification reports typed conflicts." />
  </div>
</section>

<section class="quickstart">
  <div class="quickstart-inner">
    <h2>The 60-second version</h2>
    <ol class="steps">
      <li>
        <span class="step-label">Identify</span>
        Each device generates a keypair with <code>generateDeviceKey</code>; its id is the SHA-256 of its public key.
      </li>
      <li>
        <span class="step-label">Append &amp; sign</span>
        <code>appendEntry</code> chains each record off the previous one; <code>signEntry</code> signs the same bytes the hash covers.
      </li>
      <li>
        <span class="step-label">Merge</span>
        <code>mergeLedgers</code> unions every device's log, dedupes by id, and returns one deterministic order.
      </li>
      <li>
        <span class="step-label">Verify</span>
        <code>verifyAndMergeLedgers</code> re-checks chains and signatures. Zero conflicts means everything checks out.
      </li>
    </ol>
    <div class="cta">
      <a class="btn primary" href="/playground">Try it live in the playground →</a>
      <a class="btn ghost" href="/tutorial">Full tutorial</a>
    </div>
  </div>
</section>

<section class="notfor">
  <div class="notfor-inner">
    <h2>When NOT to use this</h2>
    <p class="section-lede">
      A narrow tool. Reach for something else when your problem is a different shape.
    </p>
    <table>
      <thead>
        <tr>
          <th>You need</th>
          <th>Use instead</th>
          <th>Why</th>
        </tr>
      </thead>
      <tbody>
        {#each notFor as row (row.need)}
          <tr>
            <td>{row.need}</td>
            <td class="use">{row.use}</td>
            <td class="why">{row.why}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    <p class="fit">
      If you want deterministic multi-writer merge <strong>and</strong> the ability to
      prove nobody rewrote history, and you are offline-first, this is the fit.
    </p>
  </div>
</section>

<section class="closer">
  <div class="closer-inner">
    <h2>See a byte flip break verification.</h2>
    <p>Two devices, real WebCrypto, entirely in your browser. Sign, merge, then tamper.</p>
    <div class="cta">
      <a class="btn primary" href="/playground">Open the playground</a>
      <a class="btn ghost" href={GITHUB_URL} target="_blank" rel="noopener">View on GitHub</a>
    </div>
  </div>
</section>

<style>
  .hero {
    max-width: var(--wide-max);
    margin: 0 auto;
    padding: var(--sp-8) var(--sp-5) var(--sp-7);
  }

  .hero-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--sp-7);
    align-items: center;
  }

  @media (max-width: 960px) {
    .hero-grid {
      grid-template-columns: 1fr;
      gap: var(--sp-6);
    }
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    color: var(--c-text-muted);
    background: var(--c-bg-alt);
    border: 1px solid var(--c-border);
    padding: 4px var(--sp-3);
    border-radius: 999px;
    margin-bottom: var(--sp-4);
  }

  .badge .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--c-good);
  }

  h1 {
    font-size: var(--fs-3xl);
    line-height: 1.1;
    margin: 0 0 var(--sp-4);
    letter-spacing: -0.035em;
  }

  .accent {
    color: var(--c-accent);
  }

  .lede {
    font-size: var(--fs-md);
    color: var(--c-text-muted);
    margin: 0 0 var(--sp-5);
    max-width: 32rem;
  }

  .lede code {
    font-size: 0.92em;
  }

  .cta {
    display: inline-flex;
    gap: var(--sp-3);
    margin-bottom: var(--sp-5);
    flex-wrap: wrap;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    padding: 0.6rem 1rem;
    border-radius: var(--r-md);
    font-size: var(--fs-sm);
    font-weight: 600;
    text-decoration: none;
    transition: background 120ms ease, color 120ms ease, border-color 120ms ease, filter 120ms ease;
  }

  .btn.primary {
    background: var(--c-accent);
    color: var(--c-accent-fg);
    border: 1px solid var(--c-accent);
  }

  .btn.primary:hover {
    text-decoration: none;
    filter: brightness(1.06);
  }

  .btn.ghost {
    background: var(--c-bg-alt);
    color: var(--c-text);
    border: 1px solid var(--c-border-strong);
  }

  .btn.ghost:hover {
    background: var(--c-surface-2);
    text-decoration: none;
  }

  .install {
    font-family: var(--font-mono);
    font-size: var(--fs-sm);
    background: var(--c-code-bg);
    border: 1px solid var(--c-border);
    color: var(--c-code-text);
    padding: var(--sp-3) var(--sp-4);
    border-radius: var(--r-md);
    margin: 0;
    display: inline-block;
  }

  .install .prompt {
    color: var(--c-text-subtle);
    margin-right: var(--sp-2);
  }

  .demo {
    background: var(--c-code-bg);
    border: 1px solid var(--c-border);
    border-radius: var(--r-lg);
    overflow: hidden;
    box-shadow: var(--sh-md);
  }

  .demo-tab {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding: var(--sp-3) var(--sp-4);
    border-bottom: 1px solid var(--c-border);
    background: var(--c-bg-alt);
  }

  .dots {
    display: inline-flex;
    gap: 6px;
  }

  .dots i {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--c-border-strong);
  }

  .filename {
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    color: var(--c-text-subtle);
  }

  .demo-code {
    margin: 0;
    padding: var(--sp-4) var(--sp-5);
    font-family: var(--font-mono);
    font-size: 0.8rem;
    line-height: 1.6;
    color: var(--c-code-text);
    overflow-x: auto;
  }

  .demo-code code {
    font-family: inherit;
  }

  .demo-code .kw { color: var(--c-code-keyword); }
  .demo-code .str { color: var(--c-code-string); }
  .demo-code .fn { color: var(--c-code-fn); }
  .demo-code .num { color: var(--c-code-num); }
  .demo-code .cmt { color: var(--c-code-comment); font-style: italic; }
  .demo-code .bad { display: block; color: var(--c-bad); }
  .demo-code .bad-line { display: block; }

  .strip {
    border-top: 1px solid var(--c-border);
    border-bottom: 1px solid var(--c-border);
    background: var(--c-bg-alt);
    padding: var(--sp-6) var(--sp-5);
  }

  .strip-inner {
    max-width: var(--wide-max);
    margin: 0 auto;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--sp-5) var(--sp-6);
    align-items: start;
  }

  .problem {
    display: flex;
    gap: var(--sp-3);
    align-items: flex-start;
  }

  .problem p {
    margin: 0;
    color: var(--c-text);
    font-weight: 500;
  }

  .num-badge {
    flex: none;
    width: 26px;
    height: 26px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--c-accent-soft);
    color: var(--c-accent);
    border-radius: 50%;
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    font-weight: 600;
  }

  .strip-note {
    grid-column: 1 / -1;
    margin: 0;
    color: var(--c-text-muted);
    font-size: var(--fs-sm);
    border-top: 1px dashed var(--c-border-strong);
    padding-top: var(--sp-4);
  }

  @media (max-width: 720px) {
    .strip-inner {
      grid-template-columns: 1fr;
    }
  }

  .features {
    background: var(--c-bg);
    padding: var(--sp-8) var(--sp-5);
  }

  .features-inner {
    max-width: var(--wide-max);
    margin: 0 auto;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--sp-6);
  }

  @media (max-width: 860px) {
    .features-inner {
      grid-template-columns: 1fr;
    }
  }

  .feature h3 {
    font-size: var(--fs-md);
    margin: 0 0 var(--sp-2);
  }

  .feature p {
    color: var(--c-text-muted);
    margin: 0;
    font-size: var(--fs-sm);
  }

  .feature-icon {
    width: 42px;
    height: 42px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--c-accent);
    background: var(--c-accent-soft);
    border-radius: var(--r-md);
    margin-bottom: var(--sp-3);
  }

  .feature-icon svg {
    width: 22px;
    height: 22px;
  }

  .diagram-section {
    border-top: 1px solid var(--c-border);
    background: var(--c-bg-alt);
    padding: var(--sp-8) var(--sp-5);
  }

  .diagram-inner,
  .quickstart-inner,
  .notfor-inner,
  .closer-inner {
    max-width: var(--wide-max);
    margin: 0 auto;
  }

  .diagram-inner {
    max-width: 60rem;
  }

  h2 {
    font-size: var(--fs-2xl);
    margin: 0 0 var(--sp-3);
    letter-spacing: -0.025em;
  }

  .section-lede {
    color: var(--c-text-muted);
    max-width: 44rem;
    margin: 0 0 var(--sp-5);
  }

  .quickstart {
    padding: var(--sp-8) var(--sp-5);
  }

  .quickstart-inner {
    max-width: 46rem;
  }

  .steps {
    list-style: none;
    counter-reset: step;
    padding: 0;
    margin: 0 0 var(--sp-6);
  }

  .steps li {
    counter-increment: step;
    position: relative;
    padding: var(--sp-4) 0 var(--sp-4) var(--sp-7);
    border-top: 1px solid var(--c-border);
    color: var(--c-text);
  }

  .steps li:last-child {
    border-bottom: 1px solid var(--c-border);
  }

  .steps li::before {
    content: counter(step);
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--c-accent-soft);
    color: var(--c-accent);
    border-radius: 50%;
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    font-weight: 600;
  }

  .step-label {
    display: block;
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    color: var(--c-text-subtle);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 2px;
  }

  .steps code {
    font-size: 0.88em;
  }

  .notfor {
    border-top: 1px solid var(--c-border);
    background: var(--c-bg-alt);
    padding: var(--sp-8) var(--sp-5);
  }

  .notfor table {
    background: var(--c-surface);
    border: 1px solid var(--c-border);
    border-radius: var(--r-lg);
    overflow: hidden;
  }

  .notfor .use {
    font-weight: 500;
    color: var(--c-text);
    white-space: nowrap;
  }

  .notfor .why {
    color: var(--c-text-muted);
  }

  .fit {
    margin-top: var(--sp-5);
    color: var(--c-text);
  }

  .closer {
    padding: var(--sp-9) var(--sp-5);
    text-align: center;
  }

  .closer .cta {
    justify-content: center;
    margin-bottom: 0;
  }

  .closer p {
    color: var(--c-text-muted);
    margin-bottom: var(--sp-5);
  }
</style>
