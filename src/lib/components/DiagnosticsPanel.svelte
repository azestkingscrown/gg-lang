<script lang="ts">
  import type { Diagnostic } from '../../core/index.js';

  interface Props {
    diagnostics: Diagnostic[];
    onSelect: (diag: Diagnostic) => void;
  }

  let { diagnostics, onSelect }: Props = $props();
</script>

<section class="diag-section" aria-label="문법 및 런타임 진단">
  <div class="diag-header">
    <h3>DIAGNOSTICS</h3>
    <span class="count-pill">{diagnostics.length}</span>
  </div>

  <div class="diag-list">
    {#if diagnostics.length === 0}
      <div class="diag-ok">요이~ 문법/런타임 오류가 하나도 없어요!</div>
    {:else}
      {#each diagnostics as diag, index (`${diag.code}:${diag.line}:${diag.column}:${index}`)}
        <button
          type="button"
          class="diag-item"
          class:runtime={diag.kind === 'runtime'}
          onclick={() => onSelect(diag)}
        >
          <div class="diag-meta">
            [{diag.kind === 'syntax' ? '문법 에러' : '런타임 에러'}] {diag.line}:{diag.column} · {diag.code}
          </div>
          <div class="diag-msg">{diag.message}</div>
          {#if diag.hint}
            <div class="diag-hint">힌트: {diag.hint}</div>
          {/if}
        </button>
      {/each}
    {/if}
  </div>
</section>

<style>
  .diag-section {
    display: flex;
    flex-direction: column;
    background: var(--bg-base);
  }

  .diag-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 14px;
    background: var(--bg-panel);
    border-bottom: 1px solid var(--border);
  }

  .diag-header h3 {
    margin: 0;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--text-muted);
  }

  .diag-list {
    padding: 10px 14px;
    background: var(--bg-editor);
    max-height: 185px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .diag-ok {
    font-size: 12.5px;
    color: var(--ok);
    padding: 3px 2px;
  }

  .diag-item {
    width: 100%;
    text-align: left;
    padding: 8px 10px;
    border-radius: var(--radius);
    border: 1px solid rgba(255, 59, 48, 0.35);
    background: var(--danger-bg);
    color: var(--text-primary);
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 3px;
    transition: border-color 0.12s ease;
  }

  .diag-item:hover {
    border-color: var(--danger);
  }

  .diag-item.runtime {
    background: var(--warn-bg);
    border-color: rgba(255, 159, 10, 0.4);
  }

  .diag-item.runtime:hover {
    border-color: var(--warn);
  }

  .diag-meta {
    font-size: 11px;
    font-weight: 600;
    color: #ff8a80;
  }

  .diag-item.runtime .diag-meta {
    color: var(--warn);
  }

  .diag-msg {
    font-size: 12.5px;
    line-height: 1.45;
    word-break: break-word;
  }

  .diag-hint {
    font-size: 11.5px;
    color: var(--text-secondary);
  }
</style>
