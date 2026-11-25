<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import {
    JjeJjeVM,
    analyze,
    compile,
    type Diagnostic,
    type VMState,
  } from '../core/index.js';
  import { EXAMPLES } from '../lib/examples.js';
  import {
    AUTO_PLAY_INTERVAL_MS,
    DEBOUNCE_MS,
    DRAFT_STORAGE_KEY,
    MAX_FILE_BYTES,
    copyToClipboard,
    decodeSharePayload,
    encodeSharePayload,
  } from '../lib/utils.js';
  import type { WorkerRunRequest, WorkerRunResponse } from '../lib/worker.js';
  import CodeEditor from '../lib/components/CodeEditor.svelte';
  import CommandStrip from '../lib/components/CommandStrip.svelte';
  import DiagnosticsPanel from '../lib/components/DiagnosticsPanel.svelte';
  import InspectorTabs from '../lib/components/InspectorTabs.svelte';
  import RuntimePanel from '../lib/components/RuntimePanel.svelte';
  import TopBar from '../lib/components/TopBar.svelte';
  import TranspilerModal from '../lib/components/TranspilerModal.svelte';

  let code = $state(EXAMPLES[0].code);
  let stdin = $state(EXAMPLES[0].defaultStdin);
  let currentFileName = $state(`${EXAMPLES[0].id}.gg`);
  let selectedExampleId = $state(EXAMPLES[0].id);

  let syntaxDiagnostics = $state.raw<Diagnostic[]>(analyze(EXAMPLES[0].code));
  let runtimeDiagnostic = $state.raw<Diagnostic | null>(null);
  let vmState = $state.raw<VMState | null>(null);
  let statusOverride = $state<string | null>(null);

  let isWorkerRunning = $state(false);
  let isAutoPlaying = $state(false);
  let transpilerOpen = $state(false);
  let shareFeedback = $state(false);
  let notice = $state<{ message: string; kind: 'info' | 'warn' | 'error' } | null>(null);

  let editorRef: CodeEditor | undefined = $state();

  let activeVM: JjeJjeVM | null = null;
  let playTimer: number | null = null;
  let analysisTimer: number | null = null;
  let noticeTimer: number | null = null;
  let shareTimer: number | null = null;
  let runWorker: Worker | null = null;
  let workerRequestId = 0;

  let allDiagnostics = $derived(
    runtimeDiagnostic ? [...syntaxDiagnostics, runtimeDiagnostic] : syntaxDiagnostics,
  );
  let errorLines = $derived(new Set(allDiagnostics.map((diag) => diag.line)));
  let activeLine = $derived(vmState?.currentLine ?? null);

  function showNotice(message: string, kind: 'info' | 'warn' | 'error' = 'info') {
    if (noticeTimer !== null) {
      window.clearTimeout(noticeTimer);
    }
    notice = { message, kind };
    noticeTimer = window.setTimeout(() => {
      notice = null;
      noticeTimer = null;
    }, 4000);
  }

  function saveDraft() {
    try {
      window.localStorage.setItem(
        DRAFT_STORAGE_KEY,
        JSON.stringify({
          code,
          stdin,
          fileName: currentFileName,
        }),
      );
    } catch {
      // localStorage quota or private mode
    }
  }

  function stopAutoPlay() {
    if (playTimer !== null) {
      window.clearInterval(playTimer);
      playTimer = null;
    }
    isAutoPlaying = false;
  }

  function terminateWorker(asStopped = false) {
    if (runWorker) {
      runWorker.terminate();
      runWorker = null;
    }
    isWorkerRunning = false;
    if (asStopped) {
      statusOverride = '실행 중단됨';
    }
  }

  function flushScheduledAnalysis() {
    if (analysisTimer !== null) {
      window.clearTimeout(analysisTimer);
      analysisTimer = null;
    }
  }

  function runStaticAnalysis() {
    syntaxDiagnostics = analyze(code);
    runtimeDiagnostic = null;
  }

  function scheduleAnalysisAndSave() {
    if (analysisTimer !== null) {
      window.clearTimeout(analysisTimer);
    }
    analysisTimer = window.setTimeout(() => {
      analysisTimer = null;
      runStaticAnalysis();
      saveDraft();
    }, DEBOUNCE_MS);
  }

  function resetExecution() {
    stopAutoPlay();
    terminateWorker(false);
    activeVM = null;
    runtimeDiagnostic = null;
    vmState = null;
    statusOverride = null;
  }

  function applyLoadedCode(nextCode: string, nextStdin: string, fileName: string, exampleId = '') {
    flushScheduledAnalysis();
    code = nextCode;
    stdin = nextStdin;
    currentFileName = fileName;
    selectedExampleId = exampleId;
    resetExecution();
    runStaticAnalysis();
    editorRef?.resetScrollAndCaret();
    saveDraft();
  }

  function loadExampleById(id: string) {
    const found = EXAMPLES.find((ex) => ex.id === id);
    if (!found) return;
    applyLoadedCode(found.code, found.defaultStdin, `${found.id}.gg`, found.id);
  }

  function handleCodeChange(nextCode: string) {
    code = nextCode;
    if (selectedExampleId !== '') {
      selectedExampleId = '';
    }
    stopAutoPlay();
    terminateWorker(false);
    activeVM = null;
    runtimeDiagnostic = null;
    vmState = null;
    statusOverride = null;
    scheduleAnalysisAndSave();
  }

  function handleStdinChange(nextStdin: string) {
    stdin = nextStdin;
    resetExecution();
    saveDraft();
  }

  function ensureVMInitialized(): boolean {
    flushScheduledAnalysis();
    const program = compile(code);
    syntaxDiagnostics = program.diagnostics;
    runtimeDiagnostic = null;

    if (program.diagnostics.length > 0) {
      activeVM = null;
      vmState = null;
      return false;
    }

    activeVM = new JjeJjeVM(program, { stdin });
    return true;
  }

  function handleRunAll() {
    stopAutoPlay();
    terminateWorker(false);
    flushScheduledAnalysis();
    statusOverride = null;

    const program = compile(code);
    syntaxDiagnostics = program.diagnostics;
    runtimeDiagnostic = null;

    if (program.diagnostics.length > 0) {
      activeVM = null;
      vmState = null;
      return;
    }

    activeVM = null;
    vmState = null;
    const sourceSnapshot = code;
    const stdinSnapshot = stdin;

    try {
      const worker = new Worker(new URL('../lib/worker.ts', import.meta.url), { type: 'module' });
      runWorker = worker;
      const reqId = ++workerRequestId;
      isWorkerRunning = true;

      worker.onmessage = (event: MessageEvent<WorkerRunResponse>) => {
        const res = event.data;
        if (res.id !== reqId) return;
        terminateWorker(false);
        syntaxDiagnostics = res.diagnostics;
        runtimeDiagnostic = res.state.error;
        vmState = res.state;
      };

      worker.onerror = (err) => {
        if (runWorker !== worker) return;
        terminateWorker(false);
        showNotice(`실행 워커 오류: ${err.message || '알 수 없는 오류'}`, 'error');
      };

      const req: WorkerRunRequest = {
        id: reqId,
        source: sourceSnapshot,
        stdin: stdinSnapshot,
      };
      worker.postMessage(req);
    } catch {
      isWorkerRunning = false;
      const vm = new JjeJjeVM(program, { stdin: stdinSnapshot });
      const state = vm.run();
      runtimeDiagnostic = state.error;
      vmState = state;
    }
  }

  function handleStepOnce() {
    stopAutoPlay();
    terminateWorker(false);
    statusOverride = null;

    if (!activeVM || activeVM.isHalted) {
      if (!ensureVMInitialized() || !activeVM) {
        return;
      }
      vmState = activeVM.getState();
      return;
    }

    activeVM.step();
    const state = activeVM.getState();
    runtimeDiagnostic = state.error;
    vmState = state;
  }

  function handleTogglePlay() {
    if (playTimer !== null) {
      stopAutoPlay();
      if (activeVM) {
        vmState = activeVM.getState();
      }
      return;
    }

    terminateWorker(false);
    statusOverride = null;

    if (!activeVM || activeVM.isHalted) {
      if (!ensureVMInitialized() || !activeVM) {
        return;
      }
    }

    isAutoPlaying = true;
    playTimer = window.setInterval(() => {
      if (!activeVM) {
        stopAutoPlay();
        return;
      }
      const canContinue = activeVM.step();
      const state = activeVM.getState();
      runtimeDiagnostic = state.error;
      if (!canContinue) {
        stopAutoPlay();
      }
      vmState = state;
    }, AUTO_PLAY_INTERVAL_MS);

    if (activeVM) {
      vmState = activeVM.getState();
    }
  }

  async function handleOpenFile(file: File) {
    if (!file.name.toLowerCase().endsWith('.gg')) {
      showNotice(`'.gg' 또는 '.GG' 파일만 열 수 있습니다. (선택된 파일: ${file.name})`, 'warn');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      showNotice(
        `파일 크기가 너무 큽니다. 최대 ${MAX_FILE_BYTES / (1024 * 1024)}MB까지 지원합니다.`,
        'error',
      );
      return;
    }
    try {
      const content = await file.text();
      applyLoadedCode(content, stdin, file.name, '');
      showNotice(`'${file.name}' 파일을 불러왔습니다.`, 'info');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showNotice(`파일을 읽는 중 오류가 발생했습니다: ${msg}`, 'error');
    }
  }

  function handleSaveFile() {
    const downloadName = currentFileName.toLowerCase().endsWith('.gg')
      ? currentFileName
      : `${currentFileName}.gg`;
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = downloadName;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function handleShareLink() {
    const hash = `#code=${encodeSharePayload(code, stdin)}`;
    const shareUrl = `${window.location.origin}${window.location.pathname}${hash}`;
    window.history.replaceState(null, '', hash);
    const copied = await copyToClipboard(shareUrl);
    if (copied) {
      shareFeedback = true;
      if (shareTimer !== null) {
        window.clearTimeout(shareTimer);
      }
      shareTimer = window.setTimeout(() => {
        shareFeedback = false;
        shareTimer = null;
      }, 1300);
    } else {
      showNotice('주소창의 URL(#code=...)이 갱신되었습니다. 직접 복사해 공유하세요.', 'info');
    }
  }

  function handleClearOutput() {
    activeVM?.clearOutput();
    if (vmState) {
      vmState = { ...vmState, output: '' };
    }
  }

  onMount(() => {
    const shared = decodeSharePayload(window.location.hash);
    if (shared) {
      applyLoadedCode(shared.code, shared.stdin, 'shared.gg', '');
      showNotice('공유 링크에서 코드를 불러왔습니다.', 'info');
      return;
    }

    try {
      const savedRaw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
      if (savedRaw) {
        const saved = JSON.parse(savedRaw) as {
          code?: unknown;
          stdin?: unknown;
          fileName?: unknown;
        };
        if (typeof saved.code === 'string') {
          const savedStdin = typeof saved.stdin === 'string' ? saved.stdin : '';
          const savedFile =
            typeof saved.fileName === 'string' && saved.fileName ? saved.fileName : 'program.gg';
          const matched = EXAMPLES.find(
            (ex) => ex.code === saved.code && ex.defaultStdin === savedStdin,
          );
          applyLoadedCode(saved.code, savedStdin, savedFile, matched ? matched.id : '');
          return;
        }
      }
    } catch {
      // ignore invalid draft JSON
    }

    loadExampleById(EXAMPLES[0].id);
  });

  onDestroy(() => {
    stopAutoPlay();
    terminateWorker(false);
    flushScheduledAnalysis();
    if (noticeTimer !== null) window.clearTimeout(noticeTimer);
    if (shareTimer !== null) window.clearTimeout(shareTimer);
  });
</script>

<TopBar
  examples={EXAMPLES}
  {selectedExampleId}
  {shareFeedback}
  onSelectExample={loadExampleById}
  onOpenFile={handleOpenFile}
  onSaveFile={handleSaveFile}
  onShareLink={handleShareLink}
  onOpenTranspiler={() => {
    stopAutoPlay();
    transpilerOpen = true;
  }}
/>

<CommandStrip syntaxErrorCount={syntaxDiagnostics.length} {currentFileName} />

{#if notice}
  <div class={`notice-strip ${notice.kind}`} role="status" aria-live="polite">
    <span>{notice.message}</span>
    <button type="button" class="btn-mini" onclick={() => (notice = null)}>닫기</button>
  </div>
{/if}

<main class="workspace-grid">
  <div class="workspace-col">
    <CodeEditor
      bind:this={editorRef}
      {code}
      fileName={currentFileName}
      {errorLines}
      {activeLine}
      onCodeChange={handleCodeChange}
      onRunShortcut={handleRunAll}
      onDropFile={handleOpenFile}
    />
    <DiagnosticsPanel
      diagnostics={allDiagnostics}
      onSelect={(diag) => editorRef?.jumpToSpan(diag.line, diag.column, diag.endColumn)}
    />
  </div>

  <div class="workspace-col">
    <RuntimePanel
      {vmState}
      {statusOverride}
      {stdin}
      {isWorkerRunning}
      {isAutoPlaying}
      onRun={handleRunAll}
      onStop={() => terminateWorker(true)}
      onStep={handleStepOnce}
      onTogglePlay={handleTogglePlay}
      onReset={resetExecution}
      onStdinChange={handleStdinChange}
      onClearStdin={() => {
        stdin = '';
        resetExecution();
        saveDraft();
      }}
      onClearOutput={handleClearOutput}
    />
    <InspectorTabs {vmState} />
  </div>
</main>

<TranspilerModal
  open={transpilerOpen}
  onClose={() => (transpilerOpen = false)}
  onApply={(generatedCode) => {
    transpilerOpen = false;
    applyLoadedCode(generatedCode, stdin, 'transpiled.gg', '');
  }}
  onWarn={(msg) => showNotice(msg, 'warn')}
/>
