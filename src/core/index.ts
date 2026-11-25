import { tokenize } from './lexer.js';
import { parse } from './parser.js';
import { JjeJjeVM } from './vm.js';
import type { CompiledProgram, Diagnostic, VMOptions, VMState } from './types.js';

export type {
  Span,
  TokenType,
  Token,
  Diagnostic,
  OpCode,
  Instruction,
  CompiledProgram,
  VMOptions,
  VMState,
} from './types.js';
export { MAX_EXPONENT, tokenize, truncateDisplay } from './lexer.js';
export { parse } from './parser.js';
export { JjeJjeVM } from './vm.js';
export { encodeBigInt, textToGG } from './transpiler.js';

export function compile(source: string): CompiledProgram {
  const { tokens, diagnostics } = tokenize(source);
  return parse(tokens, diagnostics);
}

export function analyze(source: string): Diagnostic[] {
  return compile(source).diagnostics;
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
