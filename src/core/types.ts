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

export interface Instruction {
  op: OpCode;
  operand?: bigint | number;
  token: Token;
}

export interface ParseOptions {
  /** Allow omitting '요이~' and '줴줴이야' (used by REPL fragments) */
  allowFragment?: boolean;
}

export interface TraceEvent {
  step: number;
  ip: number;
  op: OpCode;
  token: Token;
  phase: 'before' | 'after' | 'error';
  stack: bigint[];
  memorySize: number;
  error?: Diagnostic;
}

export interface CompiledProgram {
  instructions: Instruction[];
  tokens: Token[];
  diagnostics: Diagnostic[];
}

export interface VMOptions {
  stdin?: string;
  maxSteps?: number;
  maxStackSize?: number;
  maxMemorySize?: number;
  maxBigIntBits?: number;
  maxOutputLength?: number;
  onTrace?: (event: TraceEvent) => void;
  initialStack?: bigint[];
  initialMemory?: Map<bigint, bigint> | Array<[bigint, bigint]>;
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
