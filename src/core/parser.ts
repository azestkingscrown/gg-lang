import { tokenize, truncateDisplay } from './lexer.js';
import type {
  CompiledProgram,
  Diagnostic,
  Instruction,
  OpCode,
  ParseOptions,
  Token,
  TokenType,
} from './types.js';

type BlockFrame =
  | {
      kind: 'IF';
      openToken: Token;
      jzIndex: number;
      elseJmpIndex?: number;
    }
  | {
      kind: 'WHILE';
      openToken: Token;
      startIp: number;
      jzIndex: number;
      breakPatches: number[];
    };

const SIMPLE_OP_MAP = new Map<TokenType, OpCode>([
  ['HALT', 'HALT'],
  ['POP', 'POP'],
  ['DUP', 'DUP'],
  ['SWAP', 'SWAP'],
  ['OVER', 'OVER'],
  ['ROT', 'ROT'],
  ['DEPTH', 'DEPTH'],
  ['ADD', 'ADD'],
  ['SUB', 'SUB'],
  ['MUL', 'MUL'],
  ['DIV', 'DIV'],
  ['MOD', 'MOD'],
  ['EQ', 'EQ'],
  ['LT', 'LT'],
  ['GT', 'GT'],
  ['NOT', 'NOT'],
  ['STORE', 'STORE'],
  ['LOAD', 'LOAD'],
  ['INPUT_INT', 'INPUT_INT'],
  ['INPUT_CHAR', 'INPUT_CHAR'],
  ['PRINT_INT', 'PRINT_INT'],
  ['PRINT_INT_LN', 'PRINT_INT_LN'],
  ['PRINT_CHAR', 'PRINT_CHAR'],
]);

function findNearestWhile(stack: BlockFrame[]): Extract<BlockFrame, { kind: 'WHILE' }> | undefined {
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    const frame = stack[i];
    if (frame.kind === 'WHILE') {
      return frame;
    }
  }
  return undefined;
}

export function parse(
  tokens: Token[],
  lexDiagnostics: Diagnostic[] = [],
  options: ParseOptions = {},
): CompiledProgram {
  const diagnostics: Diagnostic[] = [...lexDiagnostics];
  const instructions: Instruction[] = [];
  const blockStack: BlockFrame[] = [];

  if (tokens.length === 0) {
    if (!options.allowFragment && diagnostics.length === 0) {
      diagnostics.push({
        kind: 'syntax',
        code: 'SYNTAX_EMPTY',
        message: "엄... 아무 코드도 없는데요? '요이~'로 시작해서 '줴줴이야'로 끝내주세요.",
        hint: '최소 프로그램: 요이~ 줴줴이야',
        line: 1,
        column: 1,
        endColumn: 1,
      });
    }
    return { instructions, tokens, diagnostics };
  }

  if (!options.allowFragment && tokens[0].type !== 'START') {
    diagnostics.push({
      kind: 'syntax',
      code: 'SYNTAX_MISSING_START',
      message: "요이~로 시작해야죠! 프로그램의 첫 번째 명령어는 반드시 '요이~'여야 해요.",
      hint: "코드 맨 앞에 '요이~'를 추가해주세요.",
      line: tokens[0].line,
      column: tokens[0].column,
      endColumn: tokens[0].endColumn,
    });
  }

  const lastToken = tokens[tokens.length - 1];
  if (!options.allowFragment && lastToken.type !== 'HALT') {
    diagnostics.push({
      kind: 'syntax',
      code: 'SYNTAX_MISSING_HALT',
      message: "줴줴이야! 프로그램 마지막은 반드시 '줴줴이야'로 끝나야 해요.",
      hint: "코드 맨 끝에 '줴줴이야'를 추가해주세요.",
      line: lastToken.line,
      column: lastToken.column,
      endColumn: lastToken.endColumn,
    });
  }

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];

    if (token.type === 'START') {
      if (i > 0) {
        diagnostics.push({
          kind: 'syntax',
          code: 'SYNTAX_DUPLICATE_START',
          message: "아뇨아뇨 '요이~'는 프로그램 맨 처음에 딱 한 번만 쓸 수 있어요.",
          line: token.line,
          column: token.column,
          endColumn: token.endColumn,
        });
      }
      continue;
    }

    if (token.type === 'PUSH') {
      instructions.push({ op: 'PUSH', operand: token.value ?? 0n, token });
      continue;
    }

    const simpleOp = SIMPLE_OP_MAP.get(token.type);
    if (simpleOp) {
      instructions.push({ op: simpleOp, token });
      continue;
    }

    if (token.type === 'IF') {
      const jzIndex = instructions.length;
      instructions.push({ op: 'JZ', operand: -1, token });
      blockStack.push({ kind: 'IF', openToken: token, jzIndex });
      continue;
    }

    if (token.type === 'ELSE') {
      const top = blockStack[blockStack.length - 1];
      if (!top || top.kind !== 'IF') {
        diagnostics.push({
          kind: 'syntax',
          code: 'SYNTAX_UNEXPECTED_ELSE',
          message: "아뇨아뇨! 짝이 맞는 '아뇨아뇨?'(IF) 없이 '아뇨아뇨'(ELSE)를 쓸 수 없어요.",
          line: token.line,
          column: token.column,
          endColumn: token.endColumn,
        });
        continue;
      }

      if (top.elseJmpIndex !== undefined) {
        diagnostics.push({
          kind: 'syntax',
          code: 'SYNTAX_DUPLICATE_ELSE',
          message: "아뇨아뇨! 하나의 '아뇨아뇨?'(IF) 블록에는 '아뇨아뇨'(ELSE)를 한 번만 쓸 수 있어요.",
          line: token.line,
          column: token.column,
          endColumn: token.endColumn,
        });
        continue;
      }

      const jmpIndex = instructions.length;
      instructions.push({ op: 'JMP', operand: -1, token });
      instructions[top.jzIndex].operand = instructions.length;
      top.elseJmpIndex = jmpIndex;
      continue;
    }

    if (token.type === 'WHILE') {
      const startIp = instructions.length;
      const jzIndex = instructions.length;
      instructions.push({ op: 'JZ_PEEK', operand: -1, token });
      blockStack.push({
        kind: 'WHILE',
        openToken: token,
        startIp,
        jzIndex,
        breakPatches: [],
      });
      continue;
    }

    if (token.type === 'END') {
      const frame = blockStack.pop();
      if (!frame) {
        diagnostics.push({
          kind: 'syntax',
          code: 'SYNTAX_UNEXPECTED_END',
          message: "아뇨아뇨아뇨 짝이 맞는 '아뇨아뇨?' 또는 '아뇨아뇨~' 없이 '아뇨아뇨!'가 나왔어요.",
          line: token.line,
          column: token.column,
          endColumn: token.endColumn,
        });
        continue;
      }

      if (frame.kind === 'IF') {
        const endIp = instructions.length;
        if (frame.elseJmpIndex !== undefined) {
          instructions[frame.elseJmpIndex].operand = endIp;
        } else {
          instructions[frame.jzIndex].operand = endIp;
        }
      } else {
        instructions.push({ op: 'JMP', operand: frame.startIp, token });
        const afterLoopIp = instructions.length;
        instructions[frame.jzIndex].operand = afterLoopIp;
        for (const breakIp of frame.breakPatches) {
          instructions[breakIp].operand = afterLoopIp;
        }
      }
      continue;
    }

    if (token.type === 'CONTINUE') {
      const whileFrame = findNearestWhile(blockStack);
      if (!whileFrame) {
        diagnostics.push({
          kind: 'syntax',
          code: 'SYNTAX_CONTINUE_OUTSIDE_LOOP',
          message: "넌 나가라! 반복문('아뇨아뇨~') 밖에서는 '아뇨아뇨아뇨'(CONTINUE)를 쓸 수 없어요.",
          line: token.line,
          column: token.column,
          endColumn: token.endColumn,
        });
        continue;
      }
      instructions.push({ op: 'JMP', operand: whileFrame.startIp, token });
      continue;
    }

    if (token.type === 'BREAK') {
      const whileFrame = findNearestWhile(blockStack);
      if (!whileFrame) {
        diagnostics.push({
          kind: 'syntax',
          code: 'SYNTAX_BREAK_OUTSIDE_LOOP',
          message: "넌 나가라! 반복문('아뇨아뇨~') 밖에서는 '넌 나가라!'(BREAK)를 쓸 수 없어요.",
          line: token.line,
          column: token.column,
          endColumn: token.endColumn,
        });
        continue;
      }
      const breakIp = instructions.length;
      instructions.push({ op: 'JMP', operand: -1, token });
      whileFrame.breakPatches.push(breakIp);
      continue;
    }

    diagnostics.push({
      kind: 'syntax',
      code: 'SYNTAX_UNKNOWN_TOKEN',
      message: `예? '${truncateDisplay(String(token.raw))}' 알 수 없는 토큰 타입이에요.`,
      line: token.line,
      column: token.column,
      endColumn: token.endColumn,
    });
  }

  for (const unclosed of blockStack) {
    diagnostics.push({
      kind: 'syntax',
      code: 'SYNTAX_UNCLOSED_BLOCK',
      message:
        unclosed.kind === 'IF'
          ? "아뇨아뇨! 열린 '아뇨아뇨?' 블록이 '아뇨아뇨!'로 닫히지 않았어요."
          : "아뇨아뇨! 열린 '아뇨아뇨~' 반복문이 '아뇨아뇨!'로 닫히지 않았어요.",
      hint: "짝이 맞는 위치에 '아뇨아뇨!'를 추가해주세요.",
      line: unclosed.openToken.line,
      column: unclosed.openToken.column,
      endColumn: unclosed.openToken.endColumn,
    });
  }

  diagnostics.sort((a, b) => a.line - b.line || a.column - b.column);

  if (diagnostics.length > 0) {
    return { instructions: [], tokens, diagnostics };
  }

  return { instructions, tokens, diagnostics };
}

export function isIncompleteFragment(source: string): boolean {
  const { tokens, diagnostics: lexDiagnostics } = tokenize(source);
  if (lexDiagnostics.length > 0) {
    return false;
  }
  const { diagnostics } = parse(tokens, lexDiagnostics, { allowFragment: true });
  return diagnostics.length > 0 && diagnostics.every((diag) => diag.code === 'SYNTAX_UNCLOSED_BLOCK');
}
