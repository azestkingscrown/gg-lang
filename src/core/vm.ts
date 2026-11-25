import { truncateDisplay } from './lexer.js';
import type { CompiledProgram, Diagnostic, Instruction, Token, VMOptions, VMState } from './types.js';

const DEFAULT_MAX_STEPS = 200_000;
const DEFAULT_MAX_STACK_SIZE = 100_000;
const DEFAULT_MAX_MEMORY_SIZE = 100_000;
const DEFAULT_MAX_BIGINT_BITS = 65_536;
const DEFAULT_MAX_OUTPUT_LENGTH = 1_000_000;
const MAX_STDIN_INT_DIGITS = 20_000;

function normalizeLimit(value: number | undefined, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  return fallback;
}

function bigintBitLength(n: bigint): number {
  if (n === 0n) return 0;
  const hex = (n < 0n ? -n : n).toString(16);
  const firstNibbleBits = 32 - Math.clz32(parseInt(hex[0], 16));
  return (hex.length - 1) * 4 + firstNibbleBits;
}

export class JjeJjeVM {
  private readonly instructions: Instruction[];
  private readonly maxSteps: number;
  private readonly maxStackSize: number;
  private readonly maxMemorySize: number;
  private readonly maxBigIntBits: number;
  private readonly maxOutputLength: number;
  private readonly stdin: string;

  private stdinPos = 0;
  private ip = 0;
  private stack: bigint[] = [];
  private memory = new Map<bigint, bigint>();
  private output = '';
  private steps = 0;
  private halted = false;
  private error: Diagnostic | null = null;
  private errorToken: Token | null = null;

  constructor(program: CompiledProgram, options: VMOptions = {}) {
    this.instructions = program.instructions;
    this.stdin = options.stdin ?? '';
    this.maxSteps = normalizeLimit(options.maxSteps, DEFAULT_MAX_STEPS);
    this.maxStackSize = normalizeLimit(options.maxStackSize, DEFAULT_MAX_STACK_SIZE);
    this.maxMemorySize = normalizeLimit(options.maxMemorySize, DEFAULT_MAX_MEMORY_SIZE);
    this.maxBigIntBits = normalizeLimit(options.maxBigIntBits, DEFAULT_MAX_BIGINT_BITS);
    this.maxOutputLength = normalizeLimit(options.maxOutputLength, DEFAULT_MAX_OUTPUT_LENGTH);

    if (program.diagnostics.length > 0) {
      this.halted = true;
      this.error = program.diagnostics[0];
    } else if (this.instructions.length === 0) {
      this.halted = true;
    }
  }

  get isHalted(): boolean {
    return this.halted;
  }

  get hasError(): boolean {
    return this.error !== null;
  }

  get currentSteps(): number {
    return this.steps;
  }

  clearOutput(): void {
    this.output = '';
  }

  private fail(code: string, message: string, token: Token, hint?: string): false {
    const suffix = '터져서 없어짐 수고하세요';
    const fullMessage = message.includes(suffix) ? message : `${message} — ${suffix}`;
    this.error = {
      kind: 'runtime',
      code,
      message: fullMessage,
      hint,
      line: token.line,
      column: token.column,
      endColumn: token.endColumn,
    };
    this.errorToken = token;
    this.halted = true;
    return false;
  }

  private checkBigIntSize(value: bigint, token: Token): boolean {
    if (bigintBitLength(value) > this.maxBigIntBits) {
      return this.fail(
        'RUNTIME_BIGINT_OVERFLOW',
        `지~랄 정수가 너무 커졌어요 (최대 ${this.maxBigIntBits}비트)`,
        token,
      );
    }
    return true;
  }

  private pushValue(value: bigint, token: Token): boolean {
    if (this.stack.length >= this.maxStackSize) {
      return this.fail(
        'RUNTIME_STACK_OVERFLOW',
        `지~랄 스택이 너무 커졌어요 (최대 ${this.maxStackSize}개)`,
        token,
      );
    }
    this.stack.push(value);
    return true;
  }

  private peekOne(token: Token): bigint | null {
    if (this.stack.length < 1) {
      this.fail('RUNTIME_STACK_UNDERFLOW', `예? 스택에 아무것도 없는데요? (${token.raw})`, token);
      return null;
    }
    return this.stack[this.stack.length - 1];
  }

  private peekTwo(token: Token): [bigint, bigint] | null {
    if (this.stack.length < 2) {
      this.fail(
        'RUNTIME_STACK_UNDERFLOW',
        `예? 스택에 값이 최소 2개는 있어야 '${token.raw}'을(를) 할 수 있어요.`,
        token,
      );
      return null;
    }
    const len = this.stack.length;
    return [this.stack[len - 2], this.stack[len - 1]];
  }

  private popOne(token: Token): bigint | null {
    if (this.stack.length < 1) {
      this.fail('RUNTIME_STACK_UNDERFLOW', `예? 스택에 아무것도 없는데요? (${token.raw})`, token);
      return null;
    }
    return this.stack.pop()!;
  }

  private popTwo(token: Token): [bigint, bigint] | null {
    if (this.stack.length < 2) {
      this.fail(
        'RUNTIME_STACK_UNDERFLOW',
        `예? 스택에 값이 최소 2개는 있어야 '${token.raw}'을(를) 할 수 있어요.`,
        token,
      );
      return null;
    }
    const b = this.stack.pop()!;
    const a = this.stack.pop()!;
    return [a, b];
  }

  private appendOutput(chunk: string, token: Token): boolean {
    if (this.output.length + chunk.length > this.maxOutputLength) {
      return this.fail(
        'RUNTIME_OUTPUT_LIMIT',
        `지~랄 출력 길이가 최대치(${this.maxOutputLength}자)를 넘었어요.`,
        token,
      );
    }
    this.output += chunk;
    return true;
  }

  private validateJumpTarget(target: unknown, token: Token): number | null {
    if (
      typeof target !== 'number' ||
      !Number.isInteger(target) ||
      target < 0 ||
      target > this.instructions.length
    ) {
      this.fail('RUNTIME_INVALID_JUMP', `지~랄 점프 위치가 잘못되었어요 (${String(target)})`, token);
      return null;
    }
    return target;
  }

  private readIntFromStdin(token: Token): bigint | null {
    while (this.stdinPos < this.stdin.length && /\s/.test(this.stdin[this.stdinPos])) {
      this.stdinPos += 1;
    }

    if (this.stdinPos >= this.stdin.length) {
      this.fail('RUNTIME_STDIN_EOF', '예? 입력(stdin)이 비어서 정수를 읽을 수 없어요.', token);
      return null;
    }

    const start = this.stdinPos;
    while (this.stdinPos < this.stdin.length && !/\s/.test(this.stdin[this.stdinPos])) {
      this.stdinPos += 1;
    }

    const rawInt = this.stdin.slice(start, this.stdinPos);
    if (!/^[+-]?\d+$/.test(rawInt)) {
      this.fail('RUNTIME_INVALID_INT', `예? '${truncateDisplay(rawInt)}'은(는) 정수가 아닌데요?`, token);
      return null;
    }

    if (rawInt.length > MAX_STDIN_INT_DIGITS) {
      this.fail(
        'RUNTIME_BIGINT_OVERFLOW',
        `지~랄 입력 정수가 너무 커요 (${truncateDisplay(rawInt)}, 최대 ${MAX_STDIN_INT_DIGITS}자리)`,
        token,
      );
      return null;
    }

    let parsed: bigint;
    try {
      parsed = BigInt(rawInt);
    } catch {
      this.fail(
        'RUNTIME_BIGINT_OVERFLOW',
        `지~랄 입력 정수를 처리할 수 없어요 (${truncateDisplay(rawInt)})`,
        token,
      );
      return null;
    }

    if (!this.checkBigIntSize(parsed, token)) {
      return null;
    }

    return parsed;
  }

  private readCharCodePointFromStdin(): bigint {
    if (this.stdinPos >= this.stdin.length) {
      return -1n;
    }
    const cp = this.stdin.codePointAt(this.stdinPos)!;
    this.stdinPos += cp > 0xffff ? 2 : 1;
    return BigInt(cp);
  }

  step(): boolean {
    if (this.halted || this.error) {
      return false;
    }

    if (this.ip < 0 || this.ip >= this.instructions.length) {
      this.halted = true;
      return false;
    }

    const instr = this.instructions[this.ip];
    const token = instr.token;

    if (this.steps >= this.maxSteps) {
      return this.fail(
        'RUNTIME_STEP_LIMIT',
        `지~랄 실행 횟수가 최대치(${this.maxSteps}스텝)를 넘었어요! 무한 루프에 빠진 것 같네요.`,
        token,
      );
    }

    switch (instr.op) {
      case 'PUSH': {
        const val = instr.operand as bigint;
        if (!this.checkBigIntSize(val, token)) return false;
        if (!this.pushValue(val, token)) return false;
        this.ip += 1;
        break;
      }

      case 'POP': {
        if (this.popOne(token) === null) return false;
        this.ip += 1;
        break;
      }

      case 'DUP': {
        const top = this.peekOne(token);
        if (top === null) return false;
        if (!this.pushValue(top, token)) return false;
        this.ip += 1;
        break;
      }

      case 'SWAP': {
        const pair = this.popTwo(token);
        if (!pair) return false;
        this.stack.push(pair[1], pair[0]);
        this.ip += 1;
        break;
      }

      case 'OVER': {
        if (this.stack.length < 2) {
          return this.fail(
            'RUNTIME_STACK_UNDERFLOW',
            `예? '${token.raw}'(OVER)을 하려면 스택에 값이 최소 2개 있어야 해요.`,
            token,
          );
        }
        if (!this.pushValue(this.stack[this.stack.length - 2], token)) return false;
        this.ip += 1;
        break;
      }

      case 'ROT': {
        if (this.stack.length < 3) {
          return this.fail(
            'RUNTIME_STACK_UNDERFLOW',
            `예? '${token.raw}'(ROT)을 하려면 스택에 값이 최소 3개 있어야 해요.`,
            token,
          );
        }
        const c = this.stack.pop()!;
        const b = this.stack.pop()!;
        const a = this.stack.pop()!;
        this.stack.push(b, c, a);
        this.ip += 1;
        break;
      }

      case 'DEPTH': {
        if (!this.pushValue(BigInt(this.stack.length), token)) return false;
        this.ip += 1;
        break;
      }

      case 'ADD':
      case 'SUB':
      case 'MUL': {
        const pair = this.peekTwo(token);
        if (!pair) return false;
        const [a, b] = pair;

        if (
          instr.op === 'MUL' &&
          a !== 0n &&
          b !== 0n &&
          bigintBitLength(a) + bigintBitLength(b) - 1 > this.maxBigIntBits
        ) {
          return this.fail(
            'RUNTIME_BIGINT_OVERFLOW',
            `지~랄 정수가 너무 커졌어요 (최대 ${this.maxBigIntBits}비트)`,
            token,
          );
        }

        let result: bigint;
        try {
          result = instr.op === 'ADD' ? a + b : instr.op === 'SUB' ? a - b : a * b;
        } catch {
          return this.fail(
            'RUNTIME_BIGINT_OVERFLOW',
            `지~랄 정수가 너무 커졌어요 (최대 ${this.maxBigIntBits}비트)`,
            token,
          );
        }

        if (!this.checkBigIntSize(result, token)) return false;
        this.stack.length -= 2;
        this.stack.push(result);
        this.ip += 1;
        break;
      }

      case 'DIV':
      case 'MOD': {
        const pair = this.peekTwo(token);
        if (!pair) return false;
        const [a, b] = pair;
        if (b === 0n) {
          return this.fail('RUNTIME_DIV_ZERO', '지~랄 0으로 어떻게 나눠요', token);
        }
        this.stack.length -= 2;
        this.stack.push(instr.op === 'DIV' ? a / b : a % b);
        this.ip += 1;
        break;
      }

      case 'EQ': {
        const pair = this.popTwo(token);
        if (!pair) return false;
        this.stack.push(pair[0] === pair[1] ? 1n : 0n);
        this.ip += 1;
        break;
      }

      case 'LT': {
        const pair = this.popTwo(token);
        if (!pair) return false;
        this.stack.push(pair[0] < pair[1] ? 1n : 0n);
        this.ip += 1;
        break;
      }

      case 'GT': {
        const pair = this.popTwo(token);
        if (!pair) return false;
        this.stack.push(pair[0] > pair[1] ? 1n : 0n);
        this.ip += 1;
        break;
      }

      case 'NOT': {
        const a = this.popOne(token);
        if (a === null) return false;
        this.stack.push(a === 0n ? 1n : 0n);
        this.ip += 1;
        break;
      }

      case 'STORE': {
        const pair = this.peekTwo(token);
        if (!pair) return false;
        const [val, addr] = pair;
        if (!this.memory.has(addr) && this.memory.size >= this.maxMemorySize) {
          return this.fail(
            'RUNTIME_MEMORY_OVERFLOW',
            `지~랄 메모리가 너무 많이 찼어요 (최대 ${this.maxMemorySize}칸)`,
            token,
          );
        }
        this.stack.length -= 2;
        this.memory.set(addr, val);
        this.ip += 1;
        break;
      }

      case 'LOAD': {
        const addr = this.popOne(token);
        if (addr === null) return false;
        this.stack.push(this.memory.get(addr) ?? 0n);
        this.ip += 1;
        break;
      }

      case 'INPUT_INT': {
        const val = this.readIntFromStdin(token);
        if (val === null) return false;
        if (!this.pushValue(val, token)) return false;
        this.ip += 1;
        break;
      }

      case 'INPUT_CHAR': {
        const cp = this.readCharCodePointFromStdin();
        if (!this.pushValue(cp, token)) return false;
        this.ip += 1;
        break;
      }

      case 'PRINT_INT': {
        const val = this.peekOne(token);
        if (val === null) return false;
        if (!this.appendOutput(val.toString(), token)) return false;
        this.stack.pop();
        this.ip += 1;
        break;
      }

      case 'PRINT_INT_LN': {
        const val = this.peekOne(token);
        if (val === null) return false;
        if (!this.appendOutput(`${val.toString()}\n`, token)) return false;
        this.stack.pop();
        this.ip += 1;
        break;
      }

      case 'PRINT_CHAR': {
        const val = this.peekOne(token);
        if (val === null) return false;
        if (val < 0n || val > 0x10ffffn || (val >= 0xd800n && val <= 0xdfffn)) {
          return this.fail(
            'RUNTIME_INVALID_CODEPOINT',
            `지~랄 '${truncateDisplay(val.toString())}'은(는) 유효한 유니코드 문자가 아니에요.`,
            token,
          );
        }
        if (!this.appendOutput(String.fromCodePoint(Number(val)), token)) return false;
        this.stack.pop();
        this.ip += 1;
        break;
      }

      case 'JZ': {
        const cond = this.peekOne(token);
        if (cond === null) return false;
        const target = this.validateJumpTarget(instr.operand, token);
        if (target === null) return false;
        this.stack.pop();
        this.ip = cond === 0n ? target : this.ip + 1;
        break;
      }

      case 'JZ_PEEK': {
        if (this.stack.length < 1) {
          return this.fail(
            'RUNTIME_STACK_UNDERFLOW',
            "예? 반복문('아뇨아뇨~') 조건을 확인할 값이 스택에 없어요.",
            token,
          );
        }
        const target = this.validateJumpTarget(instr.operand, token);
        if (target === null) return false;
        const top = this.stack[this.stack.length - 1];
        this.ip = top === 0n ? target : this.ip + 1;
        break;
      }

      case 'JMP': {
        const target = this.validateJumpTarget(instr.operand, token);
        if (target === null) return false;
        this.ip = target;
        break;
      }

      case 'HALT': {
        this.halted = true;
        break;
      }

      default: {
        return this.fail(
          'RUNTIME_INVALID_OPCODE',
          `지~랄 알 수 없는 명령 코드예요 (${truncateDisplay(String((instr as { op: unknown }).op))})`,
          token,
        );
      }
    }

    this.steps += 1;
    return !this.halted;
  }

  run(): VMState {
    while (!this.halted && !this.error) {
      if (!this.step()) {
        break;
      }
    }
    return this.getState();
  }

  getState(): VMState {
    const activeToken = this.errorToken
      ? this.errorToken
      : !this.halted && this.ip >= 0 && this.ip < this.instructions.length
        ? this.instructions[this.ip].token
        : null;

    return {
      ip: this.ip,
      stack: [...this.stack],
      memory: Array.from(this.memory.entries()),
      output: this.output,
      steps: this.steps,
      halted: this.halted,
      error: this.error,
      currentLine: activeToken ? activeToken.line : null,
      currentToken: activeToken,
    };
  }
}
