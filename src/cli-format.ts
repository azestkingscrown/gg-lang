import type { Diagnostic, TraceEvent } from './core/index.js';

export type ErrorStyle = 'meme' | 'plain';

const PLAIN_DIAGNOSTIC_MESSAGES: Record<string, string> = {
  LEX_INCOMPLETE_AH: "Incomplete '아 예?' keyword (missing '예?')",
  LEX_INCOMPLETE_NEON: "Incomplete '넌 나가라' keyword (missing '나가라' or '나가라!')",
  LEX_ORPHAN_NAGARA: "Unexpected '나가라' without preceding '넌'",
  LEX_MIXED_NUMBER_MARKS: "Cannot mix '.' and ',' in a number literal",
  LEX_MISSING_NUMBER_VALUE: "Number literal with '어' prefix requires at least one '.' or ','",
  LEX_NUMBER_TOO_LARGE: 'Exponent in number literal exceeds maximum limit',
  LEX_TOO_MANY_TILDES: "Too many '~' modifiers (max 4 for arithmetic/stack, max 2 for comparison/print)",
  LEX_INVALID_MEMORY_OP: "Invalid memory operator (expected '쥐랄!' or '쥐~랄!')",
  LEX_INVALID_STACK_OP: 'Invalid stack operator',
  LEX_UNKNOWN_TOKEN: 'Unknown token',

  SYNTAX_EMPTY: 'Empty program',
  SYNTAX_MISSING_START: "Program must begin with '요이~'",
  SYNTAX_MISSING_HALT: "Program must end with '줴줴이야'",
  SYNTAX_DUPLICATE_START: "Duplicate '요이~' start token",
  SYNTAX_UNEXPECTED_ELSE: "Unexpected 'ELSE' ('아뇨아뇨') without matching 'IF'",
  SYNTAX_DUPLICATE_ELSE: "Duplicate 'ELSE' ('아뇨아뇨') in 'IF' block",
  SYNTAX_UNEXPECTED_END: "Unexpected 'END' ('아뇨아뇨!') without open block",
  SYNTAX_CONTINUE_OUTSIDE_LOOP: "'CONTINUE' ('아뇨아뇨아뇨') used outside loop",
  SYNTAX_BREAK_OUTSIDE_LOOP: "'BREAK' ('넌 나가라!') used outside loop",
  SYNTAX_UNKNOWN_TOKEN: 'Unknown token type in parser',
  SYNTAX_UNCLOSED_BLOCK: 'Unclosed control flow block',

  RUNTIME_STEP_LIMIT: 'Execution step limit exceeded',
  RUNTIME_BIGINT_OVERFLOW: 'Integer bit limit exceeded',
  RUNTIME_STACK_OVERFLOW: 'Stack size limit exceeded',
  RUNTIME_MEMORY_OVERFLOW: 'Heap memory limit exceeded',
  RUNTIME_STACK_UNDERFLOW: 'Stack underflow',
  RUNTIME_OUTPUT_LIMIT: 'Output length limit exceeded',
  RUNTIME_INVALID_JUMP: 'Invalid jump target',
  RUNTIME_STDIN_EOF: 'Unexpected EOF while reading integer from stdin',
  RUNTIME_INVALID_INT: 'Invalid integer in stdin',
  RUNTIME_DIV_ZERO: 'Division by zero',
  RUNTIME_INVALID_CODEPOINT: 'Invalid Unicode code point for character output',
  RUNTIME_INVALID_OPCODE: 'Invalid VM instruction opcode',
};

export function formatDiagnostic(diag: Diagnostic, style: ErrorStyle = 'meme'): string {
  if (style === 'plain') {
    const plain = PLAIN_DIAGNOSTIC_MESSAGES[diag.code] ?? diag.message;
    return `[${diag.kind}] ${diag.line}:${diag.column} (${diag.code}) ${plain}`;
  }

  const label = diag.kind === 'syntax' ? '문법 에러' : '런타임 에러';
  const lines = [`[${label}] ${diag.line}:${diag.column} (${diag.code}) ${diag.message}`];
  if (diag.hint) {
    lines.push(`  힌트: ${diag.hint}`);
  }
  return lines.join('\n');
}

function formatTraceValue(value: bigint): string {
  const s = value.toString();
  if (s.length <= 32) {
    return s;
  }
  return `${s.slice(0, 14)}...${s.slice(-10)}`;
}

function formatTraceStack(stack: bigint[]): string {
  const maxItems = 12;
  if (stack.length <= maxItems) {
    return `[${stack.map(formatTraceValue).join(', ')}]`;
  }
  const omitted = stack.length - maxItems;
  const tail = stack.slice(-maxItems).map(formatTraceValue).join(', ');
  return `[...(${omitted} more), ${tail}]`;
}

export function formatTraceEvent(
  event: TraceEvent,
  sourceLabel: string,
  errorStyle: ErrorStyle = 'meme',
): string {
  const base = `[trace] ${sourceLabel}:${event.token.line}:${event.token.column} #${event.step} ${event.phase} ${event.op} (${event.token.raw}) stack=${formatTraceStack(event.stack)}`;
  if (event.phase === 'error' && event.error) {
    return `${base} error=${formatDiagnostic(event.error, errorStyle)}`;
  }
  return base;
}
