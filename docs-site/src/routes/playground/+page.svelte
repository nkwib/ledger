<script>
  import { onMount, tick } from 'svelte';
  import {
    generateDeviceKey,
    deviceIdentity,
    appendEntry,
    signEntry,
    verifyEntrySignature,
    mergeLedgers,
    verifyAndMergeLedgers,
    defaultContent,
    defaultCodec,
    cryptoAvailable
  } from '@blocco/ledger';

  // --- Non-reactive runtime: real CryptoKey objects must NOT be wrapped in a
  // Svelte $state proxy (WebCrypto rejects proxied keys), so identities and
  // keypairs live here, outside reactivity. The UI mirrors what it needs into
  // $state below. ------------------------------------------------------------
  const rt = { A: null, B: null }; // { pair, identity }

  const DEVICES = /** @type {const} */ (['A', 'B']);
  const META = {
    A: { name: 'Phone', hue: 'a', prefix: 'a' },
    B: { name: 'Tablet', hue: 'b', prefix: 'b' }
  };

  let ready = $state(true);
  let cryptoMsg = $state('');

  let keysReady = $state({ A: false, B: false });
  let ids = $state({ A: null, B: null }); // deviceId strings
  let chains = $state({ A: [], B: [] }); // plain entry JSON
  let sigs = $state({}); // entryId -> base64
  let sigValid = $state({}); // entryId -> boolean (live check)

  let draft = $state({
    A: { athlete: 'ada', points: 3 },
    B: { athlete: 'bo', points: 4 }
  });

  let merged = $state(null); // { entries, totals, conflicts }
  let tamperTarget = $state('');
  let tamper = $state(null); // { entryId, before, after, conflicts, badIds, sigValid }
  let busy = $state(false);

  const bothReady = $derived(keysReady.A && keysReady.B);
  const totalEntries = $derived(chains.A.length + chains.B.length);
  const allEntries = $derived([...chains.A, ...chains.B]);

  onMount(() => {
    if (!cryptoAvailable()) {
      ready = false;
      cryptoMsg =
        'WebCrypto (crypto.subtle) is unavailable here. It needs a secure context: this page over https or localhost.';
    }
  });

  function short(h, n = 10) {
    if (h === null || h === undefined) return 'null';
    return h.length > n ? h.slice(0, n) + '…' : h;
  }

  async function genKeys() {
    busy = true;
    try {
      for (const d of DEVICES) {
        const pair = await generateDeviceKey();
        const identity = await deviceIdentity(pair);
        rt[d] = { pair, identity };
        ids[d] = identity.deviceId;
        keysReady[d] = true;
      }
    } catch (e) {
      cryptoMsg = String(e);
      ready = false;
    } finally {
      busy = false;
    }
  }

  async function append(d) {
    if (!keysReady[d]) return;
    busy = true;
    try {
      const head = chains[d].length ? chains[d][chains[d].length - 1] : null;
      const id = META[d].prefix + chains[d].length;
      const points = Number(draft[d].points) || 0;
      const payload = { athlete: String(draft[d].athlete || 'anon'), points };
      const entry = await appendEntry(
        { id, deviceId: ids[d], ts: Date.now(), payload },
        head
      );
      const sig = await signEntry(rt[d].pair.privateKey, entry, defaultContent);
      sigs[id] = sig;
      sigValid[id] = await verifyEntrySignature(rt[d].pair.publicKey, entry, sig, defaultContent);
      chains[d] = [...chains[d], entry];
      // Any earlier merge/tamper result is stale now.
      merged = null;
      tamper = null;
    } finally {
      busy = false;
    }
  }

  function registry() {
    const r = {};
    for (const d of DEVICES) {
      if (rt[d]) r[rt[d].identity.deviceId] = { publicKeyJwk: rt[d].identity.publicKeyJwk };
    }
    return r;
  }

  async function doMerge() {
    busy = true;
    try {
      const logs = [chains.A, chains.B].filter((l) => l.length);
      const base = mergeLedgers(logs, defaultCodec);
      const verified = await verifyAndMergeLedgers(logs, defaultCodec, registry(), sigs);
      const totals = {};
      for (const e of base.entries) {
        totals[e.payload.athlete] = (totals[e.payload.athlete] ?? 0) + Number(e.payload.points || 0);
      }
      merged = { entries: base.entries, totals, conflicts: verified.conflicts };
      tamper = null;
      await tick();
    } finally {
      busy = false;
    }
  }

  async function doTamper() {
    if (!tamperTarget) return;
    busy = true;
    try {
      // Find the target entry and its owning device.
      let owner = null;
      let original = null;
      for (const d of DEVICES) {
        const found = chains[d].find((e) => e.id === tamperTarget);
        if (found) {
          owner = d;
          original = found;
          break;
        }
      }
      if (!original) return;

      // Flip one byte: bump the score, keep the OLD hash and signature.
      const after = {
        ...original,
        payload: { ...original.payload, points: Number(original.payload.points) + 1 }
      };

      const logs = DEVICES.map((d) =>
        chains[d].map((e) => (e.id === tamperTarget ? after : e))
      ).filter((l) => l.length);

      const verified = await verifyAndMergeLedgers(logs, defaultCodec, registry(), sigs);
      const badIds = new Set(verified.conflicts.map((c) => c.entryId));

      // Live single-signature check on the tampered entry (still using its old sig).
      const pub = rt[owner].pair.publicKey;
      const stillValid = await verifyEntrySignature(pub, after, sigs[tamperTarget], defaultContent);

      tamper = {
        entryId: tamperTarget,
        owner,
        before: JSON.stringify(original.payload),
        after: JSON.stringify(after.payload),
        conflicts: verified.conflicts,
        badIds,
        stillValid
      };
    } finally {
      busy = false;
    }
  }

  async function loadExample() {
    reset();
    await genKeys();
    draft.A = { athlete: 'ada', points: 2 };
    await append('A');
    draft.A = { athlete: 'ada', points: 3 };
    await append('A');
    draft.B = { athlete: 'bo', points: 4 };
    await append('B');
    draft.A = { athlete: 'ada', points: 3 };
    await doMerge();
    tamperTarget = 'a1';
  }

  function reset() {
    rt.A = null;
    rt.B = null;
    keysReady = { A: false, B: false };
    ids = { A: null, B: null };
    chains = { A: [], B: [] };
    sigs = {};
    sigValid = {};
    merged = null;
    tamper = null;
    tamperTarget = '';
    draft = { A: { athlete: 'ada', points: 3 }, B: { athlete: 'bo', points: 4 } };
  }
</script>

<svelte:head>
  <title>Playground · @blocco/ledger</title>
  <meta
    name="description"
    content="Interactive, in-browser playground: two devices sign entries onto hash chains, merge deterministically, then tamper one byte and watch verification fail with typed conflicts. Real WebCrypto, no server."
  />
</svelte:head>

<div class="pg">
  <header class="pg-head">
    <div>
      <h1>Playground</h1>
      <p class="sub">
        Two devices, real WebCrypto, entirely in your browser. Give each device keys, sign
        entries onto its chain, <strong>merge</strong> deterministically, then
        <strong>tamper</strong> one byte and watch verification name the exact broken entry.
        Nothing leaves this page.
      </p>
    </div>
    <div class="head-actions">
      <button class="btn primary" onclick={loadExample} disabled={busy || !ready}>Load example</button>
      <button class="btn ghost" onclick={reset} disabled={busy}>Reset</button>
    </div>
  </header>

  {#if !ready}
    <div class="notice bad">{cryptoMsg}</div>
  {/if}

  <!-- STAGE 1: identities -->
  <section class="stage">
    <div class="narration">
      <span class="tag">1 · Identity</span>
      Each device generates a non-extractable ECDSA P-256 keypair. The
      <code>deviceId</code> is the SHA-256 of its public key, so identity is self-certifying:
      no device can claim an id it does not hold the key for.
    </div>

    {#if !bothReady}
      <button class="btn primary big" onclick={genKeys} disabled={busy || !ready}>
        {busy ? 'Generating…' : 'Generate device keys'}
      </button>
    {/if}

    <div class="devices">
      {#each DEVICES as d (d)}
        <div class="device dev-{META[d].hue}">
          <div class="device-head">
            <span class="device-name">{META[d].name}</span>
            <span class="device-tag">Device {d}</span>
          </div>
          {#if keysReady[d]}
            <div class="idline">
              <span class="k">deviceId</span>
              <code>{short(ids[d], 24)}</code>
            </div>
            <div class="badges">
              <span class="badge good">keypair ✓</span>
              <span class="badge muted">private key non-extractable</span>
            </div>
          {:else}
            <div class="idline empty">no key yet</div>
          {/if}
        </div>
      {/each}
    </div>
  </section>

  <!-- STAGE 2: append + sign -->
  <section class="stage" class:disabled={!bothReady}>
    <div class="narration">
      <span class="tag">2 · Append &amp; sign</span>
      <code>appendEntry</code> chains each record off the previous one (<code>prev</code> =
      last hash, <code>seq</code> increments). <code>signEntry</code> signs the exact bytes
      the hash covers. Both chains grow independently and offline.
    </div>

    <div class="devices">
      {#each DEVICES as d (d)}
        <div class="device dev-{META[d].hue}">
          <div class="device-head">
            <span class="device-name">{META[d].name} chain</span>
            <span class="device-tag">{chains[d].length} entr{chains[d].length === 1 ? 'y' : 'ies'}</span>
          </div>

          <div class="append-form">
            <label>
              <span>athlete</span>
              <input type="text" bind:value={draft[d].athlete} disabled={!keysReady[d] || busy} />
            </label>
            <label class="pts">
              <span>points</span>
              <input type="number" bind:value={draft[d].points} disabled={!keysReady[d] || busy} />
            </label>
            <button class="btn accent" onclick={() => append(d)} disabled={!keysReady[d] || busy}>
              Append &amp; sign
            </button>
          </div>

          <div class="chain">
            {#each chains[d] as e (e.id)}
              <div class="entry">
                <div class="entry-top">
                  <code class="eid">{e.id}</code>
                  <span class="seq">seq {e.seq}</span>
                  {#if sigValid[e.id]}
                    <span class="badge good sm">sig ✓</span>
                  {/if}
                </div>
                <div class="payload">{JSON.stringify(e.payload)}</div>
                <div class="hashes">
                  <span><span class="k">prev</span> <code>{short(e.prev)}</code></span>
                  <span><span class="k">hash</span> <code>{short(e.hash)}</code></span>
                </div>
              </div>
            {:else}
              <div class="chain-empty">No entries yet.</div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  </section>

  <!-- STAGE 3: merge -->
  <section class="stage" class:disabled={totalEntries === 0}>
    <div class="narration">
      <span class="tag">3 · Merge</span>
      <code>mergeLedgers</code> unions both logs, dedupes by id, and returns one total order
      <code>(seq, deviceId, ts, id)</code>, identical no matter the arrival order.
      <code>verifyAndMergeLedgers</code> then re-checks every chain and signature.
    </div>

    <button class="btn primary big" onclick={doMerge} disabled={totalEntries === 0 || busy}>
      Merge &amp; verify the logs
    </button>

    {#if merged}
      <div class="merge-result">
        <div class="verdict {merged.conflicts.length === 0 ? 'good' : 'bad'}">
          {#if merged.conflicts.length === 0}
            ✓ 0 conflicts: every chain links, every hash matches, every signature verifies.
          {:else}
            {merged.conflicts.length} conflict(s) found.
          {/if}
        </div>

        <div class="merged-log">
          <div class="col-title">Merged, ordered log</div>
          {#each merged.entries as e, i (e.id)}
            <div class="mrow dev-{e.deviceId === ids.A ? 'a' : 'b'}">
              <span class="ord">#{i}</span>
              <code class="eid">{e.id}</code>
              <span class="who">{e.deviceId === ids.A ? META.A.name : META.B.name}</span>
              <span class="seq">seq {e.seq}</span>
              <span class="payload inline">{JSON.stringify(e.payload)}</span>
              <code class="hh">{short(e.hash, 8)}</code>
            </div>
          {/each}
        </div>

        <div class="totals">
          <span class="col-title">Scoreboard (your domain reducer)</span>
          {#each Object.entries(merged.totals) as [athlete, pts] (athlete)}
            <span class="pill"><b>{athlete}</b> {pts}</span>
          {/each}
        </div>
      </div>
    {/if}
  </section>

  <!-- STAGE 4: tamper -->
  <section class="stage" class:disabled={totalEntries === 0}>
    <div class="narration">
      <span class="tag">4 · Tamper</span>
      Pick a signed entry and flip one byte (we bump its <code>points</code> by one) while
      keeping its <strong>old hash and signature</strong>. Re-verify: the recomputed hash
      diverges (<code>broken_chain</code>) and the signature no longer matches
      (<code>invalid_signature</code>). The exact entry is named.
    </div>

    <div class="tamper-controls">
      <label>
        <span>entry to tamper</span>
        <select bind:value={tamperTarget} disabled={totalEntries === 0 || busy}>
          <option value="" disabled>choose an entry…</option>
          {#each allEntries as e (e.id)}
            <option value={e.id}>{e.id} · {JSON.stringify(e.payload)}</option>
          {/each}
        </select>
      </label>
      <button class="btn danger" onclick={doTamper} disabled={!tamperTarget || busy}>
        Flip one byte &amp; re-verify
      </button>
    </div>

    {#if tamper}
      <div class="tamper-result">
        <div class="diff">
          <div class="diff-row">
            <span class="k">entry</span> <code>{tamper.entryId}</code> on {META[tamper.owner].name}
          </div>
          <div class="diff-row">
            <span class="k">before</span> <code class="ok">{tamper.before}</code>
          </div>
          <div class="diff-row">
            <span class="k">after</span> <code class="bad-code">{tamper.after}</code>
            <span class="note">payload changed, hash + signature left unchanged</span>
          </div>
          <div class="diff-row">
            <span class="k">signature</span>
            <span class="badge {tamper.stillValid ? 'good' : 'bad'}">
              {tamper.stillValid ? 'still valid ✓' : 'invalid ✗'}
            </span>
          </div>
        </div>

        <div class="verdict bad">
          {tamper.conflicts.length} typed conflict(s): verification failed.
        </div>

        <div class="conflicts">
          {#each tamper.conflicts as c (c.kind + c.entryId)}
            <div class="conflict">
              <div class="conflict-head">
                <span class="flag">{c.kind}</span>
                <code class="eid">{c.entryId}</code>
              </div>
              <p class="detail">{c.detail}</p>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </section>

  <p class="foot-note">
    This runs the real library (imported as <code>@blocco/ledger</code>) against your
    browser's WebCrypto. Read the <a href="/tutorial">tutorial</a> to build the same thing
    from scratch, or the <a href="/howto/conflicts">conflict guide</a> for what each flag means.
  </p>
</div>

<style>
  .pg {
    max-width: 62rem;
    margin: 0 auto;
    padding: var(--sp-7) var(--sp-5) var(--sp-8);
  }

  .pg-head {
    display: flex;
    gap: var(--sp-5);
    align-items: flex-start;
    justify-content: space-between;
    flex-wrap: wrap;
    margin-bottom: var(--sp-6);
  }

  .pg-head h1 {
    font-size: var(--fs-2xl);
    margin: 0 0 var(--sp-2);
  }

  .sub {
    color: var(--c-text-muted);
    max-width: 44rem;
    margin: 0;
    font-size: var(--fs-sm);
  }

  .head-actions {
    display: inline-flex;
    gap: var(--sp-2);
  }

  .notice {
    padding: var(--sp-3) var(--sp-4);
    border-radius: var(--r-md);
    font-size: var(--fs-sm);
    margin-bottom: var(--sp-5);
  }

  .notice.bad {
    background: var(--c-bad-soft);
    border: 1px solid var(--c-bad);
    color: var(--c-bad);
  }

  .stage {
    border: 1px solid var(--c-border);
    background: var(--c-surface);
    border-radius: var(--r-lg);
    padding: var(--sp-5);
    margin-bottom: var(--sp-5);
    transition: opacity 150ms ease;
  }

  .stage.disabled {
    opacity: 0.55;
  }

  .narration {
    font-size: var(--fs-sm);
    color: var(--c-text-muted);
    line-height: 1.6;
    margin-bottom: var(--sp-4);
    padding-left: var(--sp-4);
    border-left: 3px solid var(--c-accent);
  }

  .narration .tag {
    display: inline-block;
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--c-accent);
    font-weight: 600;
    margin-right: var(--sp-2);
  }

  .devices {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--sp-4);
    margin-top: var(--sp-4);
  }

  @media (max-width: 720px) {
    .devices {
      grid-template-columns: 1fr;
    }
  }

  .device {
    border: 1px solid var(--c-border);
    border-radius: var(--r-md);
    padding: var(--sp-4);
    background: var(--c-bg);
    border-top: 3px solid var(--c-border-strong);
  }

  .device.dev-a {
    border-top-color: var(--c-accent);
  }

  .device.dev-b {
    border-top-color: #7c3aed;
  }

  .device-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: var(--sp-3);
  }

  .device-name {
    font-weight: 600;
  }

  .device-tag {
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    color: var(--c-text-subtle);
  }

  .idline {
    font-size: var(--fs-sm);
    display: flex;
    gap: var(--sp-2);
    align-items: center;
  }

  .idline.empty,
  .chain-empty {
    color: var(--c-text-subtle);
    font-style: italic;
    font-size: var(--fs-sm);
  }

  .k {
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    color: var(--c-text-subtle);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .badges {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin-top: var(--sp-3);
  }

  .badge {
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    padding: 2px 8px;
    border-radius: 999px;
    border: 1px solid var(--c-border);
    color: var(--c-text-muted);
    background: var(--c-bg-alt);
  }

  .badge.sm {
    font-size: 0.68rem;
    padding: 1px 6px;
  }

  .badge.good {
    color: var(--c-good);
    background: var(--c-good-soft);
    border-color: var(--c-good);
  }

  .badge.bad {
    color: var(--c-bad);
    background: var(--c-bad-soft);
    border-color: var(--c-bad);
  }

  .badge.muted {
    color: var(--c-text-subtle);
  }

  .append-form {
    display: grid;
    grid-template-columns: 1fr 80px auto;
    gap: var(--sp-2);
    align-items: end;
    margin-bottom: var(--sp-4);
  }

  .append-form label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: var(--fs-xs);
    color: var(--c-text-subtle);
  }

  .append-form input {
    font: inherit;
    font-size: var(--fs-sm);
    padding: 6px 8px;
    border: 1px solid var(--c-border-strong);
    border-radius: var(--r-sm);
    background: var(--c-surface);
    color: var(--c-text);
    width: 100%;
  }

  .chain {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .entry {
    border: 1px solid var(--c-border);
    border-radius: var(--r-sm);
    padding: var(--sp-3);
    background: var(--c-surface);
    font-size: var(--fs-sm);
  }

  .entry-top {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin-bottom: var(--sp-2);
  }

  .eid {
    font-family: var(--font-mono);
    font-weight: 600;
    color: var(--c-text);
  }

  .seq,
  .who {
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    color: var(--c-text-subtle);
  }

  .payload {
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    background: var(--c-code-bg);
    padding: 4px 8px;
    border-radius: var(--r-sm);
    color: var(--c-code-text);
    overflow-x: auto;
  }

  .payload.inline {
    background: transparent;
    padding: 0;
  }

  .hashes {
    display: flex;
    gap: var(--sp-4);
    margin-top: var(--sp-2);
  }

  .hashes code,
  .idline code {
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    color: var(--c-text-muted);
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    padding: 0.5rem 0.9rem;
    border-radius: var(--r-md);
    font: inherit;
    font-size: var(--fs-sm);
    font-weight: 600;
    cursor: pointer;
    border: 1px solid transparent;
    transition: filter 120ms ease, background 120ms ease, border-color 120ms ease;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn.big {
    padding: 0.65rem 1.2rem;
  }

  .btn.primary {
    background: var(--c-accent);
    color: var(--c-accent-fg);
    border-color: var(--c-accent);
  }

  .btn.accent {
    background: var(--c-accent-soft);
    color: var(--c-accent);
    border-color: var(--c-accent);
  }

  .btn.ghost {
    background: var(--c-bg-alt);
    color: var(--c-text);
    border-color: var(--c-border-strong);
  }

  .btn.danger {
    background: var(--c-bad);
    color: var(--c-bad-fg);
    border-color: var(--c-bad);
  }

  .btn:not(:disabled):hover {
    filter: brightness(1.05);
  }

  .merge-result,
  .tamper-result {
    margin-top: var(--sp-4);
  }

  .verdict {
    font-weight: 600;
    font-size: var(--fs-sm);
    padding: var(--sp-3) var(--sp-4);
    border-radius: var(--r-md);
    margin-bottom: var(--sp-4);
  }

  .verdict.good {
    background: var(--c-good-soft);
    color: var(--c-good);
    border: 1px solid var(--c-good);
  }

  .verdict.bad {
    background: var(--c-bad-soft);
    color: var(--c-bad);
    border: 1px solid var(--c-bad);
  }

  .col-title {
    display: block;
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--c-text-subtle);
    margin-bottom: var(--sp-2);
  }

  .merged-log {
    border: 1px solid var(--c-border);
    border-radius: var(--r-md);
    padding: var(--sp-3);
    background: var(--c-bg);
  }

  .mrow {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding: var(--sp-2) var(--sp-2);
    border-radius: var(--r-sm);
    font-size: var(--fs-sm);
    border-left: 3px solid transparent;
  }

  .mrow + .mrow {
    border-top: 1px solid var(--c-border);
  }

  .mrow.dev-a {
    border-left-color: var(--c-accent);
  }

  .mrow.dev-b {
    border-left-color: #7c3aed;
  }

  .ord {
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    color: var(--c-text-subtle);
    width: 2.2rem;
  }

  .hh {
    margin-left: auto;
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    color: var(--c-text-subtle);
  }

  .totals {
    margin-top: var(--sp-4);
  }

  .pill {
    display: inline-block;
    font-size: var(--fs-sm);
    background: var(--c-bg-alt);
    border: 1px solid var(--c-border);
    border-radius: 999px;
    padding: 3px 12px;
    margin-right: var(--sp-2);
  }

  .tamper-controls {
    display: flex;
    gap: var(--sp-3);
    align-items: flex-end;
    flex-wrap: wrap;
  }

  .tamper-controls label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: var(--fs-xs);
    color: var(--c-text-subtle);
  }

  .tamper-controls select {
    font: inherit;
    font-size: var(--fs-sm);
    padding: 6px 8px;
    border: 1px solid var(--c-border-strong);
    border-radius: var(--r-sm);
    background: var(--c-surface);
    color: var(--c-text);
    min-width: 16rem;
  }

  .diff {
    border: 1px solid var(--c-border);
    border-radius: var(--r-md);
    padding: var(--sp-3) var(--sp-4);
    background: var(--c-bg);
    margin-bottom: var(--sp-4);
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .diff-row {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    font-size: var(--fs-sm);
    flex-wrap: wrap;
  }

  .diff-row code {
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
  }

  code.ok {
    color: var(--c-good);
  }

  code.bad-code {
    color: var(--c-bad);
    background: var(--c-bad-soft);
    padding: 2px 6px;
    border-radius: var(--r-sm);
  }

  .note {
    font-size: var(--fs-xs);
    color: var(--c-text-subtle);
    font-style: italic;
  }

  .conflicts {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }

  .conflict {
    border: 1px solid var(--c-bad);
    border-left-width: 4px;
    border-radius: var(--r-md);
    padding: var(--sp-3) var(--sp-4);
    background: var(--c-bad-soft);
  }

  .conflict-head {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    margin-bottom: var(--sp-2);
  }

  .flag {
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    font-weight: 700;
    color: var(--c-bad-fg);
    background: var(--c-bad);
    padding: 2px 8px;
    border-radius: var(--r-sm);
  }

  .conflict .detail {
    margin: 0;
    font-size: var(--fs-sm);
    color: var(--c-text);
  }

  .foot-note {
    color: var(--c-text-muted);
    font-size: var(--fs-sm);
    margin-top: var(--sp-6);
    text-align: center;
  }
</style>
