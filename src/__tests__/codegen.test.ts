import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { compile, compileToTarget, emitC, emitJavaScript, run } from '../core/index.js';
import { EXAMPLES } from '../lib/examples.js';

const TSX_BIN = path.resolve(process.cwd(), 'node_modules', '.bin', 'tsx');
const CLI_ENTRY = path.resolve(process.cwd(), 'src', 'cli.ts');

function runEmittedJs(code: string, stdin = ''): { status: number | null; stdout: string; stderr: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gg-js-'));
  try {
    const file = path.join(dir, 'prog.mjs');
    fs.writeFileSync(file, code, 'utf8');
    const res = spawnSync(process.execPath, [file], {
      input: stdin,
      encoding: 'utf8',
    });
    return { status: res.status, stdout: res.stdout, stderr: res.stderr };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function runEmittedC(code: string, stdin = ''): { status: number | null; stdout: string; stderr: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gg-c-'));
  try {
    const srcFile = path.join(dir, 'prog.c');
    const binFile = path.join(dir, 'prog');
    fs.writeFileSync(srcFile, code, 'utf8');
    execFileSync('cc', ['-std=c11', '-O2', '-Wall', '-Wextra', '-Werror', srcFile, '-o', binFile], {
      stdio: 'pipe',
    });
    const res = spawnSync(binFile, [], {
      input: stdin,
      encoding: 'utf8',
    });
    return { status: res.status, stdout: res.stdout, stderr: res.stderr };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('Codegen (--emit js / c)', () => {
  it('모든 정상 예제(16종)에서 JS/C 컴파일 바이너리가 JjeJjeVM과 동일한 출력을 생성한다', () => {
    for (const ex of EXAMPLES.filter((item) => item.id !== 'syntax-errors')) {
      const vmState = run(ex.code, { stdin: ex.defaultStdin });
      expect(vmState.error).toBeNull();

      const js = compileToTarget(ex.code, 'js');
      expect(js.diagnostics).toEqual([]);
      const jsOut = runEmittedJs(js.code, ex.defaultStdin);
      expect(jsOut.status, `${ex.id} js status`).toBe(0);
      expect(jsOut.stdout, `${ex.id} js stdout`).toBe(vmState.output);

      const c = compileToTarget(ex.code, 'c');
      expect(c.diagnostics).toEqual([]);
      expect(c.warnings).toEqual([]);
      const cOut = runEmittedC(c.code, ex.defaultStdin);
      expect(cOut.status, `${ex.id} c status`).toBe(0);
      expect(cOut.stdout, `${ex.id} c stdout`).toBe(vmState.output);
    }
  }, 25_000);

  it('최소 프로그램, 모든 스택/힙 명령, 음수 나눗셈·나머지, UTF-8 이모지가 동일하게 동작한다', () => {
    const minimal = '요이~ 줴줴이야';
    expect(runEmittedJs(emitJavaScript(compile(minimal))).status).toBe(0);
    expect(runEmittedC(emitC(compile(minimal))).status).toBe(0);

    const complex = [
      '요이~',
      // 음수 나눗셈/나머지: -7 / 2 = -3, -7 % 2 = -1
      '엄,,,,,,, 엄.. 지~~~랄 야~~르',
      '엄,,,,,,, 엄.. 지~~~~랄 야~~르',
      // OVER / ROT / SWAP / DEPTH
      '엄. 엄.. 엄... 쥐~~~랄 야~~르 야~~르 야~~르',
      '엄.... 엄..... 쥐~~랄 야~~르 넌 나가라 야~~르 쥐~~~~랄 야~~르',
      // 음수 힙 주소 저장 & 미초기화 로드
      '엄......... 어엄,, 쥐랄!',
      '어엄,, 쥐~랄! 야~~르',
      '엄, 쥐~랄! 야~~르',
      // 문자 입출력 + 이모지
      '아 예? 야~르! 아 예? 야~르!',
      '줴줴이야',
    ].join('\n');

    const stdin = '🔥!';
    const vmState = run(complex, { stdin });
    expect(vmState.error).toBeNull();

    const jsOut = runEmittedJs(compileToTarget(complex, 'js').code, stdin);
    expect(jsOut.status).toBe(0);
    expect(jsOut.stdout).toBe(vmState.output);

    const cOut = runEmittedC(compileToTarget(complex, 'c').code, stdin);
    expect(cOut.status).toBe(0);
    expect(cOut.stdout).toBe(vmState.output);
  });

  it('런타임 에러, 스텝 제한, C 64비트 리터럴 경고를 올바르게 처리한다', () => {
    const divZero = '요이~ 엄..... 야~르 엄. 엄 지~~~랄 줴줴이야';
    const jsDiv = runEmittedJs(compileToTarget(divZero, 'js').code);
    expect(jsDiv.status).toBe(1);
    expect(jsDiv.stdout).toBe('5\n');
    expect(jsDiv.stderr).toContain('RUNTIME_DIV_ZERO');
    expect(jsDiv.stderr).toContain('터져서 없어짐 수고하세요');

    const cDiv = runEmittedC(compileToTarget(divZero, 'c').code);
    expect(cDiv.status).toBe(1);
    expect(cDiv.stdout).toBe('5\n');
    expect(cDiv.stderr).toContain('RUNTIME_DIV_ZERO');
    expect(cDiv.stderr).toContain('터져서 없어짐 수고하세요');

    const infinite = '요이~ 엄. 아뇨아뇨~ 아뇨아뇨! 줴줴이야';
    const jsLoop = runEmittedJs(compileToTarget(infinite, 'js', { maxSteps: 20 }).code);
    expect(jsLoop.status).toBe(1);
    expect(jsLoop.stderr).toContain('RUNTIME_STEP_LIMIT');

    const cLoop = runEmittedC(compileToTarget(infinite, 'c', { maxSteps: 20 }).code);
    expect(cLoop.status).toBe(1);
    expect(cLoop.stderr).toContain('RUNTIME_STEP_LIMIT');

    // 10^25 > INT64_MAX
    const huge = `요이~ ${'어'.repeat(25)}엄. 야~~르 줴줴이야`;
    const jsHuge = runEmittedJs(compileToTarget(huge, 'js').code);
    expect(jsHuge.status).toBe(0);
    expect(jsHuge.stdout).toBe(`${(10n ** 25n).toString()}\n`);

    const cHuge = compileToTarget(huge, 'c');
    expect(cHuge.warnings.length).toBeGreaterThan(0);
    const cHugeRun = runEmittedC(cHuge.code);
    expect(cHugeRun.status).toBe(1);
    expect(cHugeRun.stderr).toContain('RUNTIME_BIGINT_OVERFLOW');
  });

  it('CLI --emit js|c, -o 출력 파일, 오류 옵션을 검증한다', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gg-cli-emit-'));
    try {
      const outC = path.join(dir, 'hello.c');
      const resC = spawnSync(TSX_BIN, [CLI_ENTRY, 'examples/hello.gg', '--emit', 'c', '-o', outC], {
        encoding: 'utf8',
      });
      expect(resC.status).toBe(0);
      expect(fs.readFileSync(outC, 'utf8')).toContain('int main(void)');

      const resJs = spawnSync(TSX_BIN, [CLI_ENTRY, 'examples/add.gg', '--emit=js'], {
        encoding: 'utf8',
      });
      expect(resJs.status).toBe(0);
      expect(resJs.stdout).toContain('import fs from');

      const badTarget = spawnSync(TSX_BIN, [CLI_ENTRY, 'examples/hello.gg', '--emit', 'rust'], {
        encoding: 'utf8',
      });
      expect(badTarget.status).toBe(1);
      expect(badTarget.stderr).toContain('--emit 타깃');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
