import readline from 'node:readline';
import { JjeJjeVM, compile, isIncompleteFragment } from './core/index.js';
import { formatDiagnostic, formatTraceEvent, type ErrorStyle } from './cli-format.js';

export interface ReplOptions {
  trace?: boolean;
  maxSteps?: number;
  errorStyle?: ErrorStyle;
  stdinText?: string;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  errOutput?: NodeJS.WritableStream;
}

function formatStackLine(stack: bigint[]): string {
  return `[${stack.map((v) => v.toString()).join(', ')}]`;
}

function formatMemoryLine(memory: Array<[bigint, bigint]>): string {
  if (memory.length === 0) {
    return '{}';
  }
  const sorted = [...memory].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const pairs = sorted.map(([addr, val]) => `${addr.toString()}: ${val.toString()}`);
  return `{${pairs.join(', ')}}`;
}

function printReplHelp(output: NodeJS.WritableStream): void {
  output.write(`줴줴랭 REPL 명령어:
  :help, :h        도움말 표시
  :stack           현재 스택 표시 (bottom -> top)
  :mem             현재 힙 메모리 표시 (주소 오름차순)
  :reset           스택, 힙 메모리, 입력 버퍼 초기화
  :trace           실행 트레이스 출력 켜기/끄기
  :q, :quit        REPL 종료

일반 줴줴랭 조각(요이~/줴줴이야 생략 가능)을 입력하면 즉시 실행되며 스택/메모리가 유지됩니다.
열린 블록(아뇨아뇨?, 아뇨아뇨~)은 닫는 아뇨아뇨!가 나올 때까지 다음 줄로 이어집니다.
`);
}

export async function runRepl(options: ReplOptions = {}): Promise<number> {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const errOutput = options.errOutput ?? process.stderr;
  const errorStyle: ErrorStyle = options.errorStyle ?? 'meme';
  const isTTY = Boolean((input as Partial<NodeJS.ReadStream>).isTTY);

  let stack: bigint[] = [];
  let memory: Array<[bigint, bigint]> = [];
  let traceEnabled = Boolean(options.trace);
  let buffer = '';
  let exitCode = 0;
  let quitRequested = false;

  const rl = readline.createInterface({
    input,
    output: isTTY ? output : undefined,
    terminal: isTTY,
    crlfDelay: Infinity,
  });

  if (isTTY) {
    output.write('줴줴랭 (gg-lang) REPL — :help 도움말, :q 종료\n');
    rl.setPrompt('gg> ');
    rl.prompt();
  }

  for await (const line of rl) {
    const trimmed = line.trim();

    if (buffer === '' && trimmed.startsWith(':')) {
      const cmd = trimmed.toLowerCase();
      if (cmd === ':q' || cmd === ':quit' || cmd === ':exit') {
        quitRequested = true;
        rl.close();
        break;
      }
      if (cmd === ':help' || cmd === ':h') {
        printReplHelp(output);
      } else if (cmd === ':stack') {
        output.write(`${formatStackLine(stack)}\n`);
      } else if (cmd === ':mem') {
        output.write(`${formatMemoryLine(memory)}\n`);
      } else if (cmd === ':reset') {
        stack = [];
        memory = [];
        buffer = '';
        output.write('스택과 메모리를 초기화했습니다.\n');
      } else if (cmd === ':trace') {
        traceEnabled = !traceEnabled;
        output.write(`trace: ${traceEnabled ? 'on' : 'off'}\n`);
      } else {
        errOutput.write(`알 수 없는 REPL 명령입니다: ${trimmed} (:help 참고)\n`);
      }

      if (isTTY) {
        rl.setPrompt('gg> ');
        rl.prompt();
      }
      continue;
    }

    buffer = buffer === '' ? line : `${buffer}\n${line}`;
    if (!buffer.trim()) {
      buffer = '';
      if (isTTY) {
        rl.setPrompt('gg> ');
        rl.prompt();
      }
      continue;
    }

    if (isIncompleteFragment(buffer)) {
      if (isTTY) {
        rl.setPrompt('...> ');
        rl.prompt();
      }
      continue;
    }

    const source = buffer;
    buffer = '';

    const program = compile(source, { allowFragment: true });
    if (program.diagnostics.length > 0) {
      for (const diag of program.diagnostics) {
        errOutput.write(`${formatDiagnostic(diag, errorStyle)}\n`);
      }
      if (isTTY) {
        rl.setPrompt('gg> ');
        rl.prompt();
      }
      continue;
    }

    if (program.instructions.length > 0) {
      const vm = new JjeJjeVM(program, {
        initialStack: stack,
        initialMemory: memory,
        stdin: options.stdinText ?? '',
        maxSteps: options.maxSteps,
        onTrace: traceEnabled
          ? (event) => {
              errOutput.write(`${formatTraceEvent(event, '<repl>', errorStyle)}\n`);
            }
          : undefined,
      });

      const state = vm.run();
      if (state.output.length > 0) {
        output.write(state.output);
        if ((isTTY || state.error) && !state.output.endsWith('\n')) {
          output.write('\n');
        }
      }

      stack = state.stack;
      memory = state.memory;

      if (state.error) {
        errOutput.write(`${formatDiagnostic(state.error, errorStyle)}\n`);
      }
    }

    if (isTTY) {
      rl.setPrompt('gg> ');
      rl.prompt();
    }
  }

  if (!quitRequested && buffer.trim().length > 0) {
    const program = compile(buffer, { allowFragment: true });
    for (const diag of program.diagnostics) {
      errOutput.write(`${formatDiagnostic(diag, errorStyle)}\n`);
    }
    if (program.diagnostics.length > 0) {
      exitCode = 1;
    }
  }

  return exitCode;
}
