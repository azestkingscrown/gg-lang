import initWasm, {
  initSync,
  WasmVM,
  wasm_analyze,
  wasm_compile_to_target,
  wasm_encode_bigint,
  wasm_is_incomplete_fragment,
  wasm_run,
  wasm_run_with_trace,
  wasm_text_to_gg,
} from './wasm-pkg/gg_wasm.js';

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

export type OpCode =
  | 'PUSH'
  | 'POP'
  | 'DUP'
  | 'SWAP'
  | 'OVER'
  | 'ROT'
  | 'DEPTH'
  | 'ADD'
  | 'SUB'
  | 'MUL'
  | 'DIV'
  | 'MOD'
  | 'EQ'
  | 'LT'
  | 'GT'
  | 'NOT'
  | 'STORE'
  | 'LOAD'
  | 'INPUT_INT'
  | 'INPUT_CHAR'
  | 'PRINT_INT'
  | 'PRINT_INT_LN'
  | 'PRINT_CHAR'
  | 'JZ'
  | 'JZ_PEEK'
  | 'JMP'
  | 'HALT';

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

export type TracePhase = 'before' | 'after' | 'error';

export interface TraceEvent {
  step: number;
  ip: number;
  op: OpCode;
  token: Token;
  phase: TracePhase;
  stack: bigint[];
  memorySize: number;
  error: Diagnostic | null;
}

export interface RunOptions {
  maxSteps?: number;
}

export interface TraceOptions extends RunOptions {
  maxEvents?: number;
}

export interface RunProgramResult {
  diagnostics: Diagnostic[];
  state: VMState;
}

export interface RunWithTraceResult extends RunProgramResult {
  trace: TraceEvent[];
  traceTruncated: boolean;
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

interface RawTraceEvent {
  step: number;
  ip: number;
  op: OpCode;
  token: RawToken;
  phase: TracePhase;
  stack: string[];
  memorySize: number;
  error: Diagnostic | null;
}

interface RawRunResponse {
  diagnostics: Diagnostic[];
  state: RawVMState;
}

interface RawRunWithTraceResponse extends RawRunResponse {
  trace: RawTraceEvent[];
  traceTruncated: boolean;
}

let initialized = false;
let initPromise: Promise<void> | null = null;

function assertReady(): void {
  if (!initialized) {
    throw new Error('WASM engine is not initialized. Call initEngine() first.');
  }
}

function normalizeOptionalU32(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  return Math.max(0, Math.min(0xffffffff, Math.floor(value)));
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

function deserializeTraceEvent(raw: RawTraceEvent): TraceEvent {
  return {
    step: raw.step,
    ip: raw.ip,
    op: raw.op,
    token: deserializeToken(raw.token)!,
    phase: raw.phase,
    stack: raw.stack.map((item) => BigInt(item)),
    memorySize: raw.memorySize,
    error: raw.error ?? null,
  };
}

export async function initEngineFromUrl(wasmUrl: string): Promise<void> {
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

  constructor(source: string, stdin = '', options?: RunOptions) {
    assertReady();
    this.#inner = new WasmVM(source, stdin, normalizeOptionalU32(options?.maxSteps));
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

export function createSteppingVM(source: string, stdin = '', options?: RunOptions): SteppingVM {
  return new SteppingVM(source, stdin, options);
}

export function analyze(source: string, allowFragment = false): Diagnostic[] {
  assertReady();
  return JSON.parse(wasm_analyze(source, allowFragment)) as Diagnostic[];
}

export function runProgram(source: string, stdin = '', options?: RunOptions): RunProgramResult {
  assertReady();
  const parsed = JSON.parse(
    wasm_run(source, stdin, normalizeOptionalU32(options?.maxSteps)),
  ) as RawRunResponse;
  return {
    diagnostics: parsed.diagnostics,
    state: deserializeVMState(parsed.state),
  };
}

export function runProgramWithTrace(
  source: string,
  stdin = '',
  options?: TraceOptions,
): RunWithTraceResult {
  assertReady();
  const parsed = JSON.parse(
    wasm_run_with_trace(
      source,
      stdin,
      normalizeOptionalU32(options?.maxSteps),
      normalizeOptionalU32(options?.maxEvents),
    ),
  ) as RawRunWithTraceResponse;
  return {
    diagnostics: parsed.diagnostics,
    state: deserializeVMState(parsed.state),
    trace: parsed.trace.map(deserializeTraceEvent),
    traceTruncated: parsed.traceTruncated,
  };
}

export function compileToTarget(
  source: string,
  target: EmitTarget,
  options?: RunOptions,
): EmitResult {
  assertReady();
  return JSON.parse(
    wasm_compile_to_target(source, target, normalizeOptionalU32(options?.maxSteps)),
  ) as EmitResult;
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
