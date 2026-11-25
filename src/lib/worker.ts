import { JjeJjeVM, compile, type Diagnostic, type VMState } from '../core/index.js';

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
  onmessage: ((event: MessageEvent<WorkerRunRequest>) => void) | null;
  postMessage(message: WorkerRunResponse): void;
}

const scope = globalThis as unknown as WorkerScope;

scope.onmessage = (event: MessageEvent<WorkerRunRequest>) => {
  const { id, source, stdin } = event.data;
  const program = compile(source);
  const vm = new JjeJjeVM(program, { stdin });
  const state = vm.run();
  scope.postMessage({
    id,
    diagnostics: program.diagnostics,
    state,
  });
};
