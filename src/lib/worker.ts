import { initEngineFromUrl, runProgram, type Diagnostic, type VMState } from './engine-core.js';

export interface WorkerRunRequest {
  id: number;
  source: string;
  stdin: string;
  wasmUrl: string;
  maxSteps?: number;
}

export interface WorkerRunResponse {
  id: number;
  diagnostics: Diagnostic[];
  state: VMState;
}

interface WorkerScope {
  onmessage: ((event: MessageEvent<WorkerRunRequest>) => void | Promise<void>) | null;
  postMessage(message: WorkerRunResponse): void;
}

const scope = globalThis as unknown as WorkerScope;

scope.onmessage = async (event: MessageEvent<WorkerRunRequest>) => {
  const { id, source, stdin, wasmUrl, maxSteps } = event.data;
  try {
    await initEngineFromUrl(wasmUrl);
    const { diagnostics, state } = runProgram(source, stdin, { maxSteps });
    scope.postMessage({
      id,
      diagnostics,
      state,
    });
  } catch (err) {
    setTimeout(() => {
      throw err;
    }, 0);
  }
};
