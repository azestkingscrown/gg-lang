<script lang="ts">
  import { onDestroy } from 'svelte';
  import { copyToClipboard } from '../utils.js';

  interface Props {
    syntaxErrorCount: number;
    currentFileName: string;
  }

  let { syntaxErrorCount, currentFileName }: Props = $props();

  let copied = $state(false);
  let copyTimer: number | null = null;

  let cliCommand = $derived(`npm run gg -- ${currentFileName}`);

  async function handleCopyCommand() {
    const ok = await copyToClipboard(cliCommand);
    if (!ok) return;
    copied = true;
    if (copyTimer !== null) {
      window.clearTimeout(copyTimer);
    }
    copyTimer = window.setTimeout(() => {
      copied = false;
      copyTimer = null;
    }, 1300);
  }

  onDestroy(() => {
    if (copyTimer !== null) {
      window.clearTimeout(copyTimer);
    }
  });
</script>

<div class="command-strip">
  <div class="strip-left">
    <span class="syntax-indicator" class:err={syntaxErrorCount > 0}>
      <span class="dot" aria-hidden="true"></span>
      {#if syntaxErrorCount === 0}
        SYNTAX OK
      {:else}
        {syntaxErrorCount} SYNTAX {syntaxErrorCount === 1 ? 'ERROR' : 'ERRORS'}
      {/if}
    </span>
    <span class="strip-desc">예? 엄 아뇨아뇨 줴줴이야 — 터미널 스택 기반 난해한 언어</span>
  </div>

  <button
    type="button"
    class="cli-snippet"
    title="CLI 실행 명령어 복사"
    onclick={handleCopyCommand}
  >
    <span class="prompt">$</span>
    <span class="cmd">{cliCommand}</span>
    <span class="copy-tag" class:done={copied}>{copied ? 'COPIED' : 'COPY'}</span>
  </button>
</div>

<style>
  .command-strip {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 16px;
    background: var(--bg-base);
    border-bottom: 1px solid var(--border);
  }

  .strip-left {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 14px;
    min-width: 0;
  }

  .syntax-indicator {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--ok);
    letter-spacing: 0.03em;
  }

  .syntax-indicator.err {
    color: var(--danger);
  }

  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: currentColor;
  }

  .strip-desc {
    font-size: 12px;
    color: var(--text-muted);
  }

  .cli-snippet {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 4px 9px;
    background: var(--bg-editor);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text-secondary);
    font-size: 11.5px;
    cursor: pointer;
    max-width: 100%;
    transition: border-color 0.12s ease, background-color 0.12s ease;
  }

  .cli-snippet:hover {
    border-color: var(--border-strong);
    background: var(--bg-surface);
  }

  .prompt {
    color: var(--text-dim);
    user-select: none;
  }

  .cmd {
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .copy-tag {
    font-size: 10px;
    font-weight: 600;
    padding: 1px 5px;
    border-radius: 2px;
    border: 1px solid var(--border);
    color: var(--text-muted);
    letter-spacing: 0.04em;
  }

  .copy-tag.done {
    color: var(--ok);
    border-color: rgba(48, 209, 88, 0.4);
  }
</style>
