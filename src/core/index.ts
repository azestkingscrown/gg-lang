import { tokenize } from './lexer.js';
import { parse } from './parser.js';
import { JjeJjeVM } from './vm.js';
import type { CompiledProgram, Diagnostic, ParseOptions, VMOptions, VMState } from './types.js';

export type {
  Span,
  TokenType,
  Token,
  Diagnostic,
  OpCode,
  Instruction,
  ParseOptions,
  TraceEvent,
  CompiledProgram,
  VMOptions,
  VMState,
} from './types.js';
export { MAX_EXPONENT, tokenize, truncateDisplay } from './lexer.js';
export { isIncompleteFragment, parse } from './parser.js';
export { JjeJjeVM } from './vm.js';
export { encodeBigInt, textToGG } from './transpiler.js';
export {
  compileToTarget,
  emitC,
  emitCWithWarnings,
  emitJavaScript,
  type EmitOptions,
  type EmitResult,
  type EmitTarget,
} from './codegen.js';

export function compile(source: string, options: ParseOptions = {}): CompiledProgram {
  const { tokens, diagnostics } = tokenize(source);
  return parse(tokens, diagnostics, options);
}

export function analyze(source: string, options: ParseOptions = {}): Diagnostic[] {
  return compile(source, options).diagnostics;
}

export function createVM(source: string, options: VMOptions = {}): {
  program: CompiledProgram;
  vm: JjeJjeVM;
} {
  const program = compile(source);
  const vm = new JjeJjeVM(program, options);
  return { program, vm };
}

export function run(source: string, options: VMOptions = {}): VMState {
  const { vm } = createVM(source, options);
  return vm.run();
}
