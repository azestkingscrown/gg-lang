import initWasm, {
  initSync,
  WasmVM,
  wasm_analyze,
  wasm_compile_to_target,
  wasm_encode_bigint,
  wasm_is_incomplete_fragment,
  wasm_run,
  wasm_text_to_gg,
} from './wasm-pkg/gg_wasm.js';
import wasmUrl from './wasm-pkg/gg_wasm_bg.wasm?url';

export interface Span {
  /** 1-based line number */
  line: number;
  /** 1-based inclusive start column */
  column: number;
  /** 1-based exclusive end column */
  endColumn: number;
}

export type TokenType =
  | 'START'
  | 'HALT'
  | 'PUSH'
  | 'INPUT_INT'
  | 'INPUT_CHAR'
  | 'PRINT_INT'
  | 'PRINT_INT_LN'
  | 'PRINT_CHAR'
  | 'ADD'
  | 'SUB'
  | 'MUL'
  | 'DIV'
  | 'MOD'
  | 'EQ'
  | 'LT'
  | 'GT'
  | 'DUP'
  | 'SWAP'
  | 'OVER'
  | 'ROT'
  | 'DEPTH'
  | 'STORE'
  | 'LOAD'
  | 'NOT'
  | 'IF'
  | 'ELSE'
  | 'WHILE'
  | 'END'
  | 'CONTINUE'
  | 'POP'
  | 'BREAK';

export interface Token extends Span {
  type: TokenType;
  raw: string;
  value?: bigint;
}

export interface Diagnostic extends Span {
  kind: 'syntax' | 'runtime';
  code: string;
  message: string;
  hint?: string;
}

export type EmitTarget = 'js' | 'c';

export interface EmitResult {
  target: EmitTarget;
  code: string;
  extension: string;
  diagnostics: Diagnostic[];
  warnings: string[];
}

export interface VMState {
  ip: number;
  stack: bigint[];
  memory: Array<[bigint, bigint]>;
  output: string;
  steps: number;
  halted: boolean;
  error: Diagnostic | null;
  currentLine: number | null;
  currentToken: Token | null;
}

export interface RunProgramResult {
  diagnostics: Diagnostic[];
  state: VMState;
}

interface RawToken extends Span {
  type: TokenType;
  raw: string;
  value?: string;
}

interface RawVMState {
  ip: number;
  stack: string[];
  memory: Array<[string, string]>;
  output: string;
  steps: number;
  halted: boolean;
  error: Diagnostic | null;
  currentLine: number | null;
  currentToken: RawToken | null;
}

interface RawRunResponse {
  diagnostics: Diagnostic[];
  state: RawVMState;
}

let initialized = false;
let initPromise: Promise<void> | null = null;

function assertReady(): void {
  if (!initialized) {
    throw new Error('WASM engine is not initialized. Call initEngine() first.');
  }
}

function deserializeToken(raw: RawToken | null): Token | null {
  if (!raw) return null;
  return {
    type: raw.type,
    raw: raw.raw,
    value: raw.value !== undefined ? BigInt(raw.value) : undefined,
    line: raw.line,
    column: raw.column,
    endColumn: raw.endColumn,
  };
}

function deserializeVMState(raw: RawVMState): VMState {
  return {
    ip: raw.ip,
    stack: raw.stack.map((item) => BigInt(item)),
    memory: raw.memory.map(([addr, val]) => [BigInt(addr), BigInt(val)]),
    output: raw.output,
    steps: raw.steps,
    halted: raw.halted,
    error: raw.error ?? null,
    currentLine: raw.currentLine ?? null,
    currentToken: deserializeToken(raw.currentToken ?? null),
  };
}

export async function initEngine(): Promise<void> {
  if (initialized) return;
  if (!initPromise) {
    initPromise = initWasm({ module_or_path: wasmUrl })
      .then(() => {
        initialized = true;
      })
      .catch((err) => {
        initPromise = null;
        throw err;
      });
  }
  await initPromise;
}

export function initEngineFromBytes(bytes: BufferSource | WebAssembly.Module): void {
  if (initialized) return;
  initSync({ module: bytes });
  initialized = true;
}

export function isEngineReady(): boolean {
  return initialized;
}

export class SteppingVM {
  readonly diagnostics: Diagnostic[];
  #inner: WasmVM;
  #disposed = false;

  constructor(source: string, stdin = '') {
    assertReady();
    this.#inner = new WasmVM(source, stdin);
    this.diagnostics = JSON.parse(this.#inner.diagnostics_json()) as Diagnostic[];
  }

  #ensureAlive(): WasmVM {
    if (this.#disposed) {
      throw new Error('SteppingVM instance has already been disposed.');
    }
    return this.#inner;
  }

  step(): boolean {
    return this.#ensureAlive().step();
  }

  run(): VMState {
    const json = this.#ensureAlive().run_json();
    return deserializeVMState(JSON.parse(json) as RawVMState);
  }

  getState(): VMState {
    const json = this.#ensureAlive().state_json();
    return deserializeVMState(JSON.parse(json) as RawVMState);
  }

  clearOutput(): void {
    this.#ensureAlive().clear_output();
  }

  get isHalted(): boolean {
    return this.#ensureAlive().is_halted();
  }

  get hasError(): boolean {
    return this.#ensureAlive().has_error();
  }

  get currentSteps(): number {
    return this.#ensureAlive().current_steps();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#inner.free();
  }
}

export function createSteppingVM(source: string, stdin = ''): SteppingVM {
  return new SteppingVM(source, stdin);
}

export function analyze(source: string, allowFragment = false): Diagnostic[] {
  assertReady();
  return JSON.parse(wasm_analyze(source, allowFragment)) as Diagnostic[];
}

export function runProgram(source: string, stdin = ''): RunProgramResult {
  assertReady();
  const parsed = JSON.parse(wasm_run(source, stdin)) as RawRunResponse;
  return {
    diagnostics: parsed.diagnostics,
    state: deserializeVMState(parsed.state),
  };
}

export function compileToTarget(source: string, target: EmitTarget): EmitResult {
  assertReady();
  return JSON.parse(wasm_compile_to_target(source, target)) as EmitResult;
}

export function textToGG(text: string): string {
  assertReady();
  return wasm_text_to_gg(text);
}

export function encodeBigInt(value: bigint): string {
  assertReady();
  return wasm_encode_bigint(value.toString());
}

export function isIncompleteFragment(source: string): boolean {
  assertReady();
  return wasm_is_incomplete_fragment(source);
}
