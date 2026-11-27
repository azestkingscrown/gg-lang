<script lang="ts">
  import {
    EXAMPLE_CATEGORY_LABELS,
    type ExampleCategory,
    type ExampleProgram,
  } from '../examples.js';

  interface Props {
    examples: ExampleProgram[];
    selectedExampleId: string;
    shareFeedback: boolean;
    onSelectExample: (id: string) => void;
    onOpenFile: (file: File) => void;
    onSaveFile: () => void;
    onShareLink: () => void;
    onOpenTranspiler: () => void;
  }

  let {
    examples,
    selectedExampleId,
    shareFeedback,
    onSelectExample,
    onOpenFile,
    onSaveFile,
    onShareLink,
    onOpenTranspiler,
  }: Props = $props();

  const CATEGORIES: ExampleCategory[] = ['basic', 'algorithm', 'text', 'diagnostic'];

  let fileInputEl: HTMLInputElement | undefined = $state();

  function handleExampleChange(event: Event) {
    const target = event.currentTarget as HTMLSelectElement;
    if (target.value) {
      onSelectExample(target.value);
    }
  }

  function handleFileChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) {
      onOpenFile(file);
    }
  }
</script>

<header class="topbar">
  <div class="brand">
    <div class="wordmark" aria-label="jjejje.gg">
      <span class="wm-muted">jje</span><span class="wm-bright">jje</span><span class="wm-ext">.gg</span>
    </div>
    <span class="brand-meta">줴줴랭 v1.2 // RUST + WASM</span>
  </div>

  <div class="actions">
    <label class="select-wrap" for="example-select">
      <span>EXAMPLE</span>
      <select
        id="example-select"
        class="mono-select"
        value={selectedExampleId}
        onchange={handleExampleChange}
        aria-label="예제 선택"
      >
        <option value="">직접 편집 / 파일</option>
        {#each CATEGORIES as cat (cat)}
          {@const groupItems = examples.filter((ex) => ex.category === cat)}
          {#if groupItems.length > 0}
            <optgroup label={EXAMPLE_CATEGORY_LABELS[cat]}>
              {#each groupItems as ex (ex.id)}
                <option value={ex.id} title={ex.description}>{ex.title}</option>
              {/each}
            </optgroup>
          {/if}
        {/each}
      </select>
    </label>

    <button
      class="btn btn-ghost"
      type="button"
      title=".gg / .GG 파일 열기"
      onclick={() => fileInputEl?.click()}
    >
      .gg 열기
    </button>
    <input
      bind:this={fileInputEl}
      type="file"
      accept=".gg,.GG"
      hidden
      onchange={handleFileChange}
    />

    <button class="btn btn-ghost" type="button" title=".gg 파일로 다운로드" onclick={onSaveFile}>
      .gg 저장
    </button>

    <button
      class="btn btn-ghost"
      type="button"
      title="현재 코드와 입력을 공유 링크로 복사"
      onclick={onShareLink}
    >
      {shareFeedback ? '링크 복사됨' : '공유 링크'}
    </button>

    <button class="btn" type="button" onclick={onOpenTranspiler}>문자열 → .gg</button>
  </div>
</header>

<style>
  .topbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 16px;
    background: var(--bg-panel);
    border-bottom: 1px solid var(--border);
  }

  .brand {
    display: flex;
    align-items: baseline;
    gap: 12px;
    flex-wrap: wrap;
  }

  .wordmark {
    display: inline-flex;
    align-items: center;
    font-size: 17px;
    font-weight: 700;
    letter-spacing: -0.03em;
  }

  .wm-muted {
    color: var(--text-muted);
  }

  .wm-bright {
    color: var(--text-primary);
  }

  .wm-ext {
    margin-left: 7px;
    font-size: 11px;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: var(--radius);
    border: 1px solid var(--border-strong);
    background: var(--bg-editor);
    color: var(--text-secondary);
    letter-spacing: 0.02em;
  }

  .brand-meta {
    font-size: 11.5px;
    color: var(--text-muted);
    letter-spacing: 0.02em;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .select-wrap {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    color: var(--text-muted);
    letter-spacing: 0.04em;
  }
</style>
