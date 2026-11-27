#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { formatDiagnostic, formatTraceEvent, type ErrorStyle } from './cli-format.js';
import { JjeJjeVM, compile, textToGG } from './core/index.js';
import { runRepl } from './repl.js';

const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
const MAX_STDIN_BYTES = 2 * 1024 * 1024;

function getPackageVersion(): string {
  try {
    const pkgRaw = fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8');
    const pkg = JSON.parse(pkgRaw) as { version?: unknown };
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

async function readPipedStdin(maxBytes = MAX_STDIN_BYTES): Promise<string> {
  if (process.stdin.isTTY) {
    return '';
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of process.stdin) {
    const buf = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : (chunk as Buffer);
    totalBytes += buf.length;
    if (totalBytes > maxBytes) {
      throw new Error(`표준 입력(stdin) 크기가 최대치(${maxBytes}바이트)를 초과했습니다.`);
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function printUsage(): void {
  console.error(`줴줴랭 (JjeJje / .gg) CLI 인터프리터 v${getPackageVersion()}

사용법:
  gg <파일경로.gg> [옵션]
  gg run <파일경로.gg> [옵션]
  gg repl [옵션]
  gg -e "요이~ 엄..... 야~~르 줴줴이야" [옵션]
  gg --encode "출력할 문자열"

옵션:
  --check                   문법 검사만 수행하고 실행하지 않음
  --trace                   실행 중 각 명령어와 스택 상태를 stderr로 추적
  --error-style <meme|plain> 진단 출력 형식 지정 (기본값: meme)
  --max-steps <N>           최대 실행 스텝 수 지정 (기본 200000)
  --stdin <텍스트>          표준 입력 문자열 직접 지정
  -e, --eval <코드>         인라인 줴줴랭 코드 실행
  --encode [텍스트]         문자열을 .gg 코드로 변환 (인자가 없으면 stdin 읽기)
  -v, --version             버전 정보 표시
  -h, --help                도움말 표시`);
}

interface ParsedArgs {
  mode: 'help' | 'version' | 'encode' | 'repl' | 'run';
  encodeText?: string;
  hasEncodeArgs?: boolean;
  filePath?: string;
  evalCode?: string;
  checkOnly: boolean;
  trace: boolean;
  errorStyle: ErrorStyle;
  maxSteps?: number;
  stdinText?: string;
}

function parsePositiveInt(raw: string, flagName: string): number | string {
  if (!/^\d+$/.test(raw)) {
    return `${flagName} 옵션에는 0 이상의 정수를 지정해야 합니다. (입력: ${raw})`;
  }
  const num = Number(raw);
  if (!Number.isSafeInteger(num)) {
    return `${flagName} 값이 너무 큽니다. (입력: ${raw})`;
  }
  return num;
}

function parseErrorStyle(raw: string): ErrorStyle | { error: string } {
  if (raw === 'meme' || raw === 'plain') {
    return raw;
  }
  return { error: `--error-style 옵션은 'meme' 또는 'plain'만 사용할 수 있습니다. (입력: ${raw})` };
}

function parseArgs(argv: string[]): ParsedArgs | { error: string } {
  if (argv.length === 0) {
    return { error: '' };
  }

  let isRepl = false;
  let startIndex = 0;

  if (argv[0] === 'repl') {
    isRepl = true;
    startIndex = 1;
  } else if (argv[0] === 'run') {
    startIndex = 1;
  }

  let filePath: string | undefined;
  let evalCode: string | undefined;
  let checkOnly = false;
  let trace = false;
  let errorStyle: ErrorStyle = 'meme';
  let hasErrorStyleFlag = false;
  let maxSteps: number | undefined;
  let stdinText: string | undefined;
  let endOfOptions = false;

  for (let i = startIndex; i < argv.length; i += 1) {
    const arg = argv[i];

    if (!endOfOptions && arg === '--') {
      endOfOptions = true;
      continue;
    }

    if (!endOfOptions && (arg === '-h' || arg === '--help')) {
      return { mode: 'help', checkOnly: false, trace: false, errorStyle: 'meme' };
    }

    if (!endOfOptions && (arg === '-v' || arg === '--version')) {
      return { mode: 'version', checkOnly: false, trace: false, errorStyle: 'meme' };
    }

    if (!endOfOptions && arg === '--encode') {
      if (
        isRepl ||
        filePath !== undefined ||
        evalCode !== undefined ||
        checkOnly ||
        trace ||
        hasErrorStyleFlag ||
        maxSteps !== undefined ||
        stdinText !== undefined
      ) {
        return { error: '--encode 옵션은 다른 실행 옵션이나 파일 경로와 함께 사용할 수 없습니다.' };
      }
      const rest = argv.slice(i + 1);
      return {
        mode: 'encode',
        hasEncodeArgs: rest.length > 0,
        encodeText: rest.join(' '),
        checkOnly: false,
        trace: false,
        errorStyle: 'meme',
      };
    }

    if (!endOfOptions && arg === '--check') {
      checkOnly = true;
      continue;
    }

    if (!endOfOptions && arg === '--trace') {
      trace = true;
      continue;
    }

    if (!endOfOptions && (arg === '--error-style' || arg.startsWith('--error-style='))) {
      const value = arg.startsWith('--error-style=') ? arg.slice('--error-style='.length) : argv[++i];
      if (value === undefined) {
        return { error: '--error-style 뒤에 meme 또는 plain을 지정해주세요.' };
      }
      const parsedStyle = parseErrorStyle(value);
      if (typeof parsedStyle === 'object') {
        return parsedStyle;
      }
      errorStyle = parsedStyle;
      hasErrorStyleFlag = true;
      continue;
    }

    if (!endOfOptions && (arg === '--max-steps' || arg.startsWith('--max-steps='))) {
      const value = arg.startsWith('--max-steps=') ? arg.slice('--max-steps='.length) : argv[++i];
      if (value === undefined) {
        return { error: '--max-steps 뒤에 스텝 수를 지정해주세요.' };
      }
      const parsed = parsePositiveInt(value, '--max-steps');
      if (typeof parsed === 'string') {
        return { error: parsed };
      }
      maxSteps = parsed;
      continue;
    }

    if (!endOfOptions && (arg === '--stdin' || arg.startsWith('--stdin='))) {
      const value = arg.startsWith('--stdin=') ? arg.slice('--stdin='.length) : argv[++i];
      if (value === undefined) {
        return { error: '--stdin 뒤에 입력 문자열을 지정해주세요.' };
      }
      stdinText = value;
      continue;
    }

    if (!endOfOptions && (arg === '-e' || arg === '--eval' || arg.startsWith('--eval='))) {
      const value = arg.startsWith('--eval=') ? arg.slice('--eval='.length) : argv[++i];
      if (value === undefined) {
        return { error: `${arg} 뒤에 실행할 코드를 입력해주세요.` };
      }
      if (evalCode !== undefined) {
        return { error: '-e/--eval 옵션은 한 번만 사용할 수 있습니다.' };
      }
      evalCode = value;
      continue;
    }

    if (!endOfOptions && arg.startsWith('-')) {
      return { error: `알 수 없는 옵션입니다: ${arg}` };
    }

    if (isRepl) {
      return { error: `repl 모드에서는 파일 인자를 받을 수 없습니다. (입력: ${arg})` };
    }

    if (filePath !== undefined) {
      return { error: `파일 경로는 하나만 지정할 수 있습니다. (추가 인자: ${arg})` };
    }
    filePath = arg;
  }

  if (isRepl) {
    if (checkOnly || evalCode !== undefined) {
      return { error: 'repl 모드에서는 --check 또는 -e/--eval 옵션을 사용할 수 없습니다.' };
    }
    return {
      mode: 'repl',
      checkOnly: false,
      trace,
      errorStyle,
      maxSteps,
      stdinText,
    };
  }

  if (evalCode !== undefined && filePath !== undefined) {
    return { error: '파일 경로와 -e/--eval은 동시에 사용할 수 없습니다.' };
  }

  if (evalCode === undefined && filePath === undefined) {
    return { error: '실행할 .gg 파일 경로 또는 -e/--eval 코드를 입력해주세요.' };
  }

  return {
    mode: 'run',
    filePath,
    evalCode,
    checkOnly,
    trace,
    errorStyle,
    maxSteps,
    stdinText,
  };
}

async function main(): Promise<number> {
  const parsed = parseArgs(process.argv.slice(2));
  if ('error' in parsed) {
    if (parsed.error) {
      console.error(`[옵션 오류] ${parsed.error}\n`);
    }
    printUsage();
    return 1;
  }

  if (parsed.mode === 'help') {
    printUsage();
    return 0;
  }

  if (parsed.mode === 'version') {
    process.stdout.write(`gg-lang v${getPackageVersion()}\n`);
    return 0;
  }

  if (parsed.mode === 'repl') {
    return runRepl({
      trace: parsed.trace,
      maxSteps: parsed.maxSteps,
      errorStyle: parsed.errorStyle,
      stdinText: parsed.stdinText,
    });
  }

  if (parsed.mode === 'encode') {
    try {
      const text = parsed.hasEncodeArgs ? parsed.encodeText! : await readPipedStdin();
      process.stdout.write(`${textToGG(text)}\n`);
      return 0;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[입력 오류] ${msg}`);
      return 1;
    }
  }

  let source: string;
  let sourceLabel: string;
  if (parsed.evalCode !== undefined) {
    source = parsed.evalCode;
    sourceLabel = '<eval>';
  } else {
    const filePath = parsed.filePath!;
    sourceLabel = filePath;
    const ext = path.extname(filePath).toLowerCase();
    if (ext !== '.gg') {
      console.error(`[경고] 줴줴랭 소스 파일은 '.gg' 확장자를 권장합니다. (현재: ${filePath})`);
    }

    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) {
        console.error(`[파일 오류] '${filePath}'은(는) 일반 파일이 아닙니다.`);
        return 1;
      }
      if (stat.size > MAX_SOURCE_BYTES) {
        console.error(`[파일 오류] '${filePath}' 크기가 최대 허용치(${MAX_SOURCE_BYTES}바이트)를 초과했습니다.`);
        return 1;
      }
      source = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[파일 오류] '${filePath}'를 읽을 수 없습니다: ${msg}`);
      return 1;
    }
  }

  const program = compile(source);
  if (program.diagnostics.length > 0) {
    for (const diag of program.diagnostics) {
      console.error(formatDiagnostic(diag, parsed.errorStyle));
    }
    return 1;
  }

  if (parsed.checkOnly) {
    process.stdout.write(`요이~ 문법 검사 통과 (${program.instructions.length}개 명령어)\n`);
    return 0;
  }

  const needsStdin = program.instructions.some(
    (instr) => instr.op === 'INPUT_INT' || instr.op === 'INPUT_CHAR',
  );

  let stdin = parsed.stdinText ?? '';
  if (parsed.stdinText === undefined && needsStdin) {
    try {
      stdin = await readPipedStdin();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[입력 오류] ${msg}`);
      return 1;
    }
  }

  const vm = new JjeJjeVM(program, {
    stdin,
    maxSteps: parsed.maxSteps,
    onTrace: parsed.trace
      ? (event) => {
          process.stderr.write(`${formatTraceEvent(event, sourceLabel, parsed.errorStyle)}\n`);
        }
      : undefined,
  });
  const state = vm.run();

  if (state.output.length > 0) {
    process.stdout.write(state.output);
    if (state.error && !state.output.endsWith('\n')) {
      process.stdout.write('\n');
    }
  }

  if (state.error) {
    console.error(formatDiagnostic(state.error, parsed.errorStyle));
    return 1;
  }

  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[치명적 오류] ${msg}`);
    process.exitCode = 1;
  });
