<script lang="ts">
  import { PALETTE_ITEMS, getOffsetForLineColumn } from '../utils.js';

  interface Props {
    code: string;
    fileName: string;
    errorLines: Set<number>;
    activeLine: number | null;
    onCodeChange: (nextCode: string) => void;
    onRunShortcut: () => void;
    onDropFile: (file: File) => void;
  }

  let {
    code,
    fileName,
    errorLines,
    activeLine,
    onCodeChange,
    onRunShortcut,
    onDropFile,
  }: Props = $props();

  let cursorLine = $state(1);
  let cursorCol = $state(1);
  let isDragOver = $state(false);
  let showPalette = $state(true);

  let frameEl: HTMLDivElement | undefined = $state();
  let gutterEl: HTMLDivElement | undefined = $state();
  let textareaEl: HTMLTextAreaElement | undefined = $state();

  let lineCount = $derived(Math.max(1, code.split(/\r\n|\r|\n/).length));

  function updateCursorPosition() {
    if (!textareaEl) return;
    const pos = textareaEl.selectionStart ?? 0;
    const before = textareaEl.value.slice(0, pos);
    const lines = before.split(/\r\n|\r|\n/);
    cursorLine = lines.length;
    cursorCol = (lines[lines.length - 1]?.length ?? 0) + 1;
  }

  function syncScroll() {
    if (gutterEl && textareaEl) {
      gutterEl.scrollTop = textareaEl.scrollTop;
    }
  }

  function insertAtCaret(text: string, start: number, end: number) {
    if (!textareaEl) return;
    textareaEl.focus();
    textareaEl.setSelectionRange(start, end);
    let insertedWithCommand = false;
    try {
      insertedWithCommand = document.execCommand('insertText', false, text);
    } catch {
      insertedWithCommand = false;
    }
    if (!insertedWithCommand) {
      textareaEl.setRangeText(text, start, end, 'end');
    }
  }

  function insertKeyword(token: string) {
    if (!textareaEl) return;
    const value = textareaEl.value;
    const start = textareaEl.selectionStart ?? value.length;
    const end = textareaEl.selectionEnd ?? start;
    const before = value.slice(0, start);
    const after = value.slice(end);

    const needLeadingSpace = before.length > 0 && !/[\s]$/.test(before);
    const needTrailingSpace = after.length > 0 && !/^[\s]/.test(after);
    const insertText = `${needLeadingSpace ? ' ' : ''}${token}${needTrailingSpace ? ' ' : ''}`;

    insertAtCaret(insertText, start, end);
    onCodeChange(textareaEl.value);
    updateCursorPosition();
  }

  function handleTabIndentation(shiftKey: boolean) {
    if (!textareaEl) return;
    const value = textareaEl.value;
    const start = textareaEl.selectionStart ?? 0;
    const end = textareaEl.selectionEnd ?? 0;

    if (!shiftKey && start === end) {
      insertAtCaret('  ', start, end);
      onCodeChange(textareaEl.value);
      updateCursorPosition();
      return;
    }

    const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    let lineEnd = value.indexOf('\n', end);
    if (lineEnd === -1) {
      lineEnd = value.length;
    } else if (end > start && value[end - 1] === '\n') {
      lineEnd = end - 1;
    }

    const block = value.slice(lineStart, lineEnd);
    const lines = block.split('\n');
    const updatedLines = shiftKey
      ? lines.map((line) => line.replace(/^ {1,2}|^\t/, ''))
      : lines.map((line) => `  ${line}`);

    const replacement = updatedLines.join('\n');
    if (replacement !== block) {
      insertAtCaret(replacement, lineStart, lineEnd);
      textareaEl.setSelectionRange(lineStart, lineStart + replacement.length);
      onCodeChange(textareaEl.value);
      updateCursorPosition();
    }
  }

  function handleInput(event: Event) {
    const target = event.currentTarget as HTMLTextAreaElement;
    onCodeChange(target.value);
    updateCursorPosition();
    syncScroll();
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.isComposing || event.keyCode === 229) {
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      onRunShortcut();
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      handleTabIndentation(event.shiftKey);
    }
  }

  function hasDraggedFiles(event: DragEvent): boolean {
    const types = event.dataTransfer?.types;
    return types ? Array.from(types).includes('Files') : false;
  }

  function handleDragOver(event: DragEvent) {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    isDragOver = true;
  }

  function handleDragLeave(event: DragEvent) {
    if (event.relatedTarget && frameEl?.contains(event.relatedTarget as Node)) {
      return;
    }
    isDragOver = false;
  }

  function handleDrop(event: DragEvent) {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    isDragOver = false;
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      onDropFile(file);
    }
  }

  export function jumpToSpan(line: number, column: number, endColumn: number): void {
    if (!textareaEl) return;
    const text = textareaEl.value;
    const startPos = getOffsetForLineColumn(text, line, column);
    const endPos = Math.max(startPos, getOffsetForLineColumn(text, line, endColumn));

    textareaEl.focus();
    textareaEl.setSelectionRange(startPos, endPos);
    const targetScrollTop = Math.max(0, (line - 4) * 22);
    textareaEl.scrollTop = targetScrollTop;
    if (gutterEl) {
      gutterEl.scrollTop = targetScrollTop;
    }
    updateCursorPosition();
  }

  export function resetScrollAndCaret(): void {
    if (!textareaEl) return;
    textareaEl.scrollTop = 0;
    textareaEl.scrollLeft = 0;
    if (gutterEl) {
      gutterEl.scrollTop = 0;
    }
    textareaEl.setSelectionRange(0, 0);
    cursorLine = 1;
    cursorCol = 1;
  }
</script>

<div class="editor-section">
  <div class="section-bar">
    <div class="bar-left">
      <span class="section-title">EDITOR</span>
      <span class="file-pill">{fileName}</span>
    </div>
    <div class="bar-right">
      <span class="cursor-pos">LN {cursorLine}, COL {cursorCol}</span>
      <span class="keybind-hint">⌘↵ RUN</span>
      <button
        type="button"
        class="btn-mini"
        onclick={() => (showPalette = !showPalette)}
      >
        {showPalette ? 'PALETTE ▲' : 'PALETTE ▼'}
      </button>
    </div>
  </div>

  {#if showPalette}
    <div class="palette" aria-label="8종 키워드 빠른 삽입">
      {#each PALETTE_ITEMS as item (item.token)}
        <button
          type="button"
          class="kw-chip"
          onclick={() => insertKeyword(item.token)}
        >
          <span class="kw-token">{item.token}</span>
          <span class="kw-label">{item.label}</span>
        </button>
      {/each}
    </div>
  {/if}

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    bind:this={frameEl}
    class="editor-frame"
    class:drag-over={isDragOver}
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    ondrop={handleDrop}
  >
    <div bind:this={gutterEl} class="line-gutter" aria-hidden="true">
      {#each Array.from({ length: lineCount }, (_, idx) => idx + 1) as lineNum (lineNum)}
        <div
          class="line-num"
          class:has-error={errorLines.has(lineNum)}
          class:is-active={activeLine === lineNum}
        >
          {lineNum}
        </div>
      {/each}
    </div>

    <textarea
      bind:this={textareaEl}
      class="code-editor"
      value={code}
      spellcheck="false"
      wrap="off"
      aria-label="줴줴랭 소스 코드 에디터"
      placeholder="요이~&#10;엄..... 야~~르&#10;줴줴이야"
      oninput={handleInput}
      onclick={updateCursorPosition}
      onkeyup={updateCursorPosition}
      onscroll={syncScroll}
      onkeydown={handleKeyDown}
    ></textarea>
  </div>
</div>

<style>
  .editor-section {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }

  .section-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 9px 14px;
    background: var(--bg-panel);
    border-bottom: 1px solid var(--border);
  }

  .bar-left,
  .bar-right {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .section-title {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--text-muted);
  }

  .file-pill {
    font-size: 12px;
    color: var(--text-primary);
    padding: 1px 6px;
    border-radius: var(--radius);
    border: 1px solid var(--border);
    background: var(--bg-editor);
  }

  .cursor-pos {
    font-size: 11.5px;
    color: var(--text-muted);
  }

  .keybind-hint {
    font-size: 11px;
    padding: 1px 6px;
    border-radius: var(--radius);
    border: 1px solid var(--border);
    background: var(--bg-editor);
    color: var(--text-secondary);
  }

  .palette {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    padding: 9px 14px;
    background: var(--bg-base);
    border-bottom: 1px solid var(--border);
  }

  .kw-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 7px;
    border-radius: var(--radius);
    border: 1px solid var(--border);
    background: var(--bg-surface);
    color: var(--text-primary);
    font-size: 11.5px;
    cursor: pointer;
    transition: border-color 0.12s ease, background-color 0.12s ease;
  }

  .kw-chip:hover {
    border-color: var(--border-strong);
    background: var(--bg-surface-hover);
  }

  .kw-label {
    font-size: 10.5px;
    color: var(--text-muted);
  }

  .editor-frame {
    position: relative;
    display: flex;
    flex: 1;
    min-height: 320px;
    max-height: 490px;
    background: var(--bg-editor);
    border-bottom: 1px solid var(--border);
    overflow: hidden;
  }

  .editor-frame.drag-over {
    outline: 1px solid var(--text-primary);
    outline-offset: -2px;
  }

  .line-gutter {
    min-width: 50px;
    width: auto;
    padding: 12px 0 28px 8px;
    background: #120f0f;
    border-right: 1px solid var(--border);
    font-size: 13px;
    line-height: 22px;
    color: var(--text-dim);
    text-align: right;
    user-select: none;
    overflow: hidden;
    flex-shrink: 0;
  }

  .line-num {
    padding-right: 10px;
    padding-left: 4px;
    height: 22px;
    border-left: 2px solid transparent;
  }

  .line-num.has-error {
    color: var(--danger);
    background: var(--danger-bg);
    border-left-color: var(--danger);
    font-weight: 700;
  }

  .line-num.is-active {
    color: var(--warn);
    background: var(--warn-bg);
    border-left-color: var(--warn);
    font-weight: 700;
  }

  .code-editor {
    flex: 1;
    border: 0;
    outline: none;
    resize: none;
    padding: 12px 14px;
    background: transparent;
    color: var(--text-primary);
    font-size: 13.5px;
    line-height: 22px;
    tab-size: 2;
    overflow: auto;
    white-space: pre;
  }

  .code-editor::placeholder {
    color: var(--text-dim);
  }
</style>
