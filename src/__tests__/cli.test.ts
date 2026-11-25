import { spawn } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const TSX_BIN = path.resolve(process.cwd(), 'node_modules', '.bin', 'tsx');
const CLI_ENTRY = path.resolve(process.cwd(), 'src', 'cli.ts');

interface CliResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runCli(args: string[], writeStdin?: (stdin: NodeJS.WritableStream) => void): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(TSX_BIN, [CLI_ENTRY, ...args], {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });

    if (writeStdin) {
      writeStdin(child.stdin);
    } else {
      child.stdin.end();
    }
  });
}

describe('CLI (src/cli.ts)', () => {
  it('예제 파일을 실행하고 분할 지연 파이프 stdin을 손실 없이 읽는다', async () => {
    const hello = await runCli(['examples/hello.gg']);
    expect(hello.code).toBe(0);
    expect(hello.stdout).toBe('Hello, World!\n');

    const chunkedAdd = await runCli(['examples/add.gg'], (stdin) => {
      stdin.write('12 ');
      setTimeout(() => {
        stdin.write('30\n');
        stdin.end();
      }, 60);
    });
    expect(chunkedAdd.code).toBe(0);
    expect(chunkedAdd.stdout).toBe('42\n');
  });

  it('--encode -h 및 --encode 파이프 입력을 올바르게 처리한다', async () => {
    const encodedFlagText = await runCli(['--encode', '-h']);
    expect(encodedFlagText.code).toBe(0);
    expect(encodedFlagText.stdout).toContain("티~원! // '-'");
    expect(encodedFlagText.stdout).toContain("티~원! // 'h'");

    const encodedPipe = await runCli(['--encode'], (stdin) => {
      stdin.write('안녕');
      stdin.end();
    });
    expect(encodedPipe.code).toBe(0);
    expect(encodedPipe.stdout).toContain("티~원! // '안'");
    expect(encodedPipe.stdout).toContain("티~원! // '녕'");
  });

  it('--check, -e/--eval, --stdin, --max-steps 옵션을 처리한다', async () => {
    const checkOk = await runCli(['examples/fibonacci.gg', '--check']);
    expect(checkOk.code).toBe(0);
    expect(checkOk.stdout).toContain('문법 검사 통과');

    const checkFail = await runCli(['-e', '요이~ 어엄 줴줴이야', '--check']);
    expect(checkFail.code).toBe(1);
    expect(checkFail.stderr).toContain('LEX_MISSING_NUMBER_VALUE');

    const evalRes = await runCli(['-e', '요이~ 예? 예? 지랄 티~~원 줴줴이야', '--stdin', '15 27']);
    expect(evalRes.code).toBe(0);
    expect(evalRes.stdout).toBe('42\n');

    const maxStepsRes = await runCli([
      '-e',
      '요이~ 엄. 아뇨아뇨~ 아뇨아뇨! 줴줴이야',
      '--max-steps',
      '20',
    ]);
    expect(maxStepsRes.code).toBe(1);
    expect(maxStepsRes.stderr).toContain('RUNTIME_STEP_LIMIT');
    expect(maxStepsRes.stderr).toContain('터져서 없어짐 수고하세요');
  });

  it('개행 없는 출력 직후 런타임 에러 시 줄을 분리하고 디렉터리/오류 옵션을 거부한다', async () => {
    const splitErr = await runCli(['-e', '요이~ 엄..... 티~원 엄. 엄 지~~~랄 줴줴이야']);
    expect(splitErr.code).toBe(1);
    expect(splitErr.stdout).toBe('5\n');
    expect(splitErr.stderr).toContain('RUNTIME_DIV_ZERO');

    const dirErr = await runCli(['examples']);
    expect(dirErr.code).toBe(1);
    expect(dirErr.stderr).toContain('일반 파일이 아닙니다');

    const missingErr = await runCli(['examples/does-not-exist.gg']);
    expect(missingErr.code).toBe(1);

    const unknownOpt = await runCli(['--unknown-flag']);
    expect(unknownOpt.code).toBe(1);
    expect(unknownOpt.stderr).toContain('알 수 없는 옵션');
  });
});
