<script lang="ts">
  import type { VMState } from '../../core/index.js';

  interface Props {
    vmState: VMState | null;
    statusOverride: string | null;
    stdin: string;
    isWorkerRunning: boolean;
    isAutoPlaying: boolean;
    onRun: () => void;
    onStop: () => void;
    onStep: () => void;
    onTogglePlay: () => void;
    onReset: () => void;
    onStdinChange: (next: string) => void;
    onClearStdin: () => void;
    onClearOutput: () => void;
  }

  let {
    vmState,
    statusOverride,
    stdin,
    isWorkerRunning,
    isAutoPlaying,
    onRun,
    onStop,
    onStep,
    onTogglePlay,
    onReset,
    onStdinChange,
    onClearStdin,
    onClearOutput,
  }: Props = $props();

  let stdoutEl: HTMLPreElement | undefined = $state();

  let statusText = $derived.by(() => {
    if (statusOverride) return statusOverride;
    if (isWorkerRunning) return 'RUNNING (WORKER)';
    if (!vmState) return 'IDLE';
    if (vmState.error) return vmState.error.kind === 'syntax' ? 'SYNTAX ERROR' : 'RUNTIME ERROR';
    if (vmState.halted) return 'HALTED (줴줴이야)';
    if (isAutoPlaying) return 'AUTO STEP';
    return 'PAUSED';
  });

  let statusTone = $derived.by(() => {
    if (vmState?.error) return 'err';
    if (vmState?.halted) return 'ok';
    if (isWorkerRunning || isAutoPlaying) return 'run';
    return 'idle';
  });

  $effect(() => {
    const _output = vmState?.output ?? '';
    if (stdoutEl) {
      stdoutEl.scrollTop = stdoutEl.scrollHeight;
    }
    void _output;
  });

  function handleStdinInput(event: Event) {
    const target = event.currentTarget as HTMLTextAreaElement;
    onStdinChange(target.value);
  }
</script>

<div class="runtime-top">
  <div class="controls-bar">
    <div class="controls-group">
      <button
        type="button"
        class="btn btn-primary"
        disabled={isWorkerRunning}
        onclick={onRun}
      >
        실행
      </button>

      {#if isWorkerRunning}
        <button type="button" class="btn btn-danger" onclick={onStop}>중지</button>
      {/if}

      <button
        type="button"
        class="btn"
        disabled={isWorkerRunning}
        onclick={onStep}
      >
        한 스텝
      </button>

      <button
        type="button"
        class="btn"
        disabled={isWorkerRunning}
        onclick={onTogglePlay}
      >
        {isAutoPlaying ? '일시정지' : '자동 재생'}
      </button>

      <button type="button" class="btn btn-ghost" onclick={onReset}>초기화</button>
    </div>
  </div>

  <div class="status-strip">
    <div class="stat-cell">
      <span class="stat-k">STATUS</span>
      <strong class={`stat-v ${statusTone}`}>{statusText}</strong>
    </div>
    <div class="stat-cell">
      <span class="stat-k">STEPS</span>
      <strong class="stat-v">{vmState?.steps ?? 0}</strong>
    </div>
    <div class="stat-cell">
      <span class="stat-k">IP</span>
      <strong class="stat-v">{vmState?.ip ?? 0}</strong>
    </div>
    <div class="stat-cell">
      <span class="stat-k">TOKEN</span>
      <strong class="stat-v">{vmState?.currentToken ? vmState.currentToken.raw : '-'}</strong>
    </div>
  </div>

  <div class="io-grid">
    <div class="io-pane">
      <div class="io-header">
        <h3>STDIN</h3>
        <button type="button" class="btn-mini" onclick={onClearStdin}>비우기</button>
      </div>
      <textarea
        class="io-textarea"
        value={stdin}
        spellcheck="false"
        placeholder="예? / 아 예? 로 읽을 입력을 적으세요 (예: 12 30)"
        oninput={handleStdinInput}
      ></textarea>
    </div>

    <div class="io-pane">
      <div class="io-header">
        <h3>STDOUT</h3>
        <button type="button" class="btn-mini" onclick={onClearOutput}>비우기</button>
      </div>
      <pre bind:this={stdoutEl} class="stdout-box" aria-live="polite">{vmState?.output ?? ''}</pre>
    </div>
  </div>
</div>

<style>
  .runtime-top {
    display: flex;
    flex-direction: column;
  }

  .controls-bar {
    padding: 10px 14px;
    background: var(--bg-panel);
    border-bottom: 1px solid var(--border);
  }

  .controls-group {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .status-strip {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    background: var(--bg-editor);
    border-bottom: 1px solid var(--border);
  }

  .stat-cell {
    padding: 8px 12px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .stat-cell + .stat-cell {
    border-left: 1px solid var(--border);
  }

  .stat-k {
    font-size: 10px;
    letter-spacing: 0.06em;
    color: var(--text-muted);
  }

  .stat-v {
    font-size: 12px;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .stat-v.ok {
    color: var(--ok);
  }

  .stat-v.err {
    color: var(--danger);
  }

  .stat-v.run {
    color: var(--warn);
  }

  .io-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    border-bottom: 1px solid var(--border);
  }

  .io-pane {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .io-pane + .io-pane {
    border-left: 1px solid var(--border);
  }

  .io-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 7px 12px;
    background: var(--bg-panel);
    border-bottom: 1px solid var(--border);
  }

  .io-header h3 {
    margin: 0;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--text-muted);
  }

  .io-textarea,
  .stdout-box {
    margin: 0;
    height: 126px;
    padding: 10px 12px;
    border: 0;
    background: var(--bg-editor);
    color: var(--text-primary);
    font-size: 12.5px;
    line-height: 1.5;
    overflow: auto;
  }

  .io-textarea {
    resize: vertical;
    outline: none;
  }

  .io-textarea::placeholder {
    color: var(--text-dim);
  }

  .stdout-box {
    white-space: pre-wrap;
    word-break: break-word;
  }

  @media (max-width: 720px) {
    .status-strip {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .stat-cell:nth-child(3) {
      border-left: 0;
    }

    .stat-cell:nth-child(n + 3) {
      border-top: 1px solid var(--border);
    }

    .io-grid {
      grid-template-columns: 1fr;
    }

    .io-pane + .io-pane {
      border-left: 0;
      border-top: 1px solid var(--border);
    }
  }
</style>
