import { initEngine, runProgram, type Diagnostic, type VMState } from './engine.js';

export interface WorkerRunRequest {
  id: number;
  source: string;
  stdin: string;
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
  const { id, source, stdin } = event.data;
  try {
    await initEngine();
    const { diagnostics, state } = runProgram(source, stdin);
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
