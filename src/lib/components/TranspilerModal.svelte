<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import { textToGG } from '../../core/index.js';
  import { DEBOUNCE_MS, MAX_TRANSPILER_CHARS, copyToClipboard } from '../utils.js';

  interface Props {
    open: boolean;
    onClose: () => void;
    onApply: (generatedCode: string) => void;
    onWarn: (message: string) => void;
  }

  let { open, onClose, onApply, onWarn }: Props = $props();

  let rawText = $state('줴줴이야~ 화이팅!');
  let generatedCode = $state('');
  let copied = $state(false);

  let inputEl: HTMLTextAreaElement | undefined = $state();
  let outputEl: HTMLTextAreaElement | undefined = $state();
  let lastFocusedEl: HTMLElement | null = null;
  let debounceTimer: number | null = null;
  let copyTimer: number | null = null;

  let lineCount = $derived(generatedCode ? generatedCode.split('\n').length : 0);

  function updatePreview() {
    let text = rawText;
    if (text.length > MAX_TRANSPILER_CHARS) {
      text = text.slice(0, MAX_TRANSPILER_CHARS);
      rawText = text;
      onWarn(`변환기 입력은 최대 ${MAX_TRANSPILER_CHARS.toLocaleString()}자까지만 지원합니다.`);
    }
    generatedCode = textToGG(text);
  }

  $effect(() => {
    if (open) {
      lastFocusedEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      updatePreview();
      void tick().then(() => inputEl?.focus());
    } else if (lastFocusedEl) {
      if (document.contains(lastFocusedEl)) {
        lastFocusedEl.focus();
      }
      lastFocusedEl = null;
    }
  });

  function handleInput(event: Event) {
    rawText = (event.currentTarget as HTMLTextAreaElement).value;
    if (debounceTimer !== null) {
      window.clearTimeout(debounceTimer);
    }
    debounceTimer = window.setTimeout(() => {
      debounceTimer = null;
      updatePreview();
    }, DEBOUNCE_MS);
  }

  async function handleCopy() {
    const ok = await copyToClipboard(generatedCode, outputEl);
    if (!ok) {
      onWarn('자동 복사에 실패했습니다. 선택된 코드를 직접 복사해주세요.');
      return;
    }
    copied = true;
    if (copyTimer !== null) {
      window.clearTimeout(copyTimer);
    }
    copyTimer = window.setTimeout(() => {
      copied = false;
      copyTimer = null;
    }, 1300);
  }

  function handleApply() {
    const code = textToGG(rawText.slice(0, MAX_TRANSPILER_CHARS));
    onApply(code);
  }

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  function handleWindowKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape' && open) {
      onClose();
    }
  }

  onDestroy(() => {
    if (debounceTimer !== null) window.clearTimeout(debounceTimer);
    if (copyTimer !== null) window.clearTimeout(copyTimer);
  });
</script>

<svelte:window onkeydown={handleWindowKeyDown} />

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-backdrop" onclick={handleBackdropClick}>
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-head">
        <h2 id="modal-title">문자열 → .gg 코드 자동 변환기</h2>
        <button type="button" class="btn btn-ghost" aria-label="닫기" onclick={onClose}>✕</button>
      </div>

      <p class="modal-desc">
        원하는 텍스트(영문, 한글, 이모지, 줄바꿈 포함)를 입력하면 그대로 출력하는 줴줴랭 코드를 생성합니다.
      </p>

      <label class="modal-label" for="transpile-input">
        원본 문자열 (최대 {MAX_TRANSPILER_CHARS.toLocaleString()}자)
      </label>
      <textarea
        bind:this={inputEl}
        id="transpile-input"
        class="modal-textarea"
        rows="3"
        value={rawText}
        placeholder="여기에 문자열을 입력하세요..."
        oninput={handleInput}
      ></textarea>

      <div class="modal-label-row">
        <label class="modal-label" for="transpile-output">생성된 .gg 코드</label>
        <span class="count-pill">{lineCount}줄</span>
      </div>
      <textarea
        bind:this={outputEl}
        id="transpile-output"
        class="modal-textarea code-output"
        rows="9"
        wrap="off"
        readonly
        value={generatedCode}
      ></textarea>

      <div class="modal-actions">
        <button type="button" class="btn" onclick={handleCopy}>
          {copied ? '복사됨' : '코드 복사'}
        </button>
        <button type="button" class="btn btn-primary" onclick={handleApply}>
          에디터로 불러오기
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(10, 8, 8, 0.78);
    display: grid;
    place-items: center;
    padding: 16px;
    z-index: 50;
  }

  .modal-card {
    width: min(680px, 100%);
    background: var(--bg-panel);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .modal-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .modal-head h2 {
    margin: 0;
    font-size: 14.5px;
    color: var(--text-primary);
  }

  .modal-desc {
    margin: 0;
    font-size: 12px;
    color: var(--text-muted);
    line-height: 1.5;
  }

  .modal-label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .modal-label {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--text-muted);
  }

  .modal-textarea {
    width: 100%;
    background: var(--bg-editor);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 10px 12px;
    color: var(--text-primary);
    font-size: 12.5px;
    line-height: 1.5;
    resize: vertical;
    outline: none;
  }

  .modal-textarea:focus {
    border-color: var(--border-strong);
  }

  .modal-textarea.code-output {
    font-size: 12px;
    white-space: pre;
    overflow-x: auto;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
  }
</style>
