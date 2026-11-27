import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { compile, compileToTarget, run } from '../core/index.js';
import { EXAMPLES } from '../lib/examples.js';

function runJsCompiled(code: string, stdin: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gg-ex-js-'));
  try {
    const file = path.join(dir, 'ex.mjs');
    fs.writeFileSync(file, code, 'utf8');
    const res = spawnSync(process.execPath, [file], { input: stdin, encoding: 'utf8' });
    expect(res.status, res.stderr).toBe(0);
    return res.stdout;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function runCCompiled(code: string, stdin: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gg-ex-c-'));
  try {
    const src = path.join(dir, 'ex.c');
    const bin = path.join(dir, 'ex');
    fs.writeFileSync(src, code, 'utf8');
    execFileSync('cc', ['-std=c11', '-O2', '-Wall', '-Wextra', '-Werror', src, '-o', bin], {
      stdio: 'pipe',
    });
    const res = spawnSync(bin, [], { input: stdin, encoding: 'utf8' });
    expect(res.status, res.stderr).toBe(0);
    return res.stdout;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('Web playground EXAMPLES (16 executable + diagnostic)', () => {
  it('16개 정상 예제가 모두 문법 에러 없이 기대 출력을 생성한다', () => {
    const expectedOutputs: Record<string, string> = {
      hello: 'Hello, World!\n',
      hangul: '안녕, 줴줴!\n',
      add: '42\n',
      countdown: '5\n4\n3\n2\n1\n',
      fibonacci: '0 1 1 2 3 5 8 13 21 34\n',
      truth_machine: '0\n',
      factorial: '3628800\n',
      gcd: '6\n',
      is_prime: '1\n',
      gugudan:
        '7 x 1 = 7\n7 x 2 = 14\n7 x 3 = 21\n7 x 4 = 28\n7 x 5 = 35\n7 x 6 = 42\n7 x 7 = 49\n7 x 8 = 56\n7 x 9 = 63\n',
      sort: '-2 0 3 5 9\n',
      reverse: 'CBA🔥줴줴',
      '99bottles': [
        '3 bottles of beer on the wall, 3 bottles of beer.',
        'Take one down and pass it around, 2 bottles of beer on the wall.',
        '2 bottles of beer on the wall, 2 bottles of beer.',
        'Take one down and pass it around, 1 bottle of beer on the wall.',
        '1 bottle of beer on the wall, 1 bottle of beer.',
        'Take one down and pass it around, no more bottles of beer on the wall.',
        '',
      ].join('\n'),
      palindrome: '1\n',
      caesar_cipher: 'Khoor, 줴줴!',
      rpn_calc: '7\n',
    };

    const runnable = EXAMPLES.filter((item) => item.category !== 'diagnostic');
    expect(runnable).toHaveLength(16);

    for (const ex of runnable) {
      const compiled = compile(ex.code);
      expect(compiled.diagnostics, `${ex.id} diagnostics`).toEqual([]);
      const result = run(ex.code, { stdin: ex.defaultStdin });
      expect(result.error, `${ex.id} runtime error`).toBeNull();
      expect(result.output, `${ex.id} output`).toBe(expectedOutputs[ex.id]);
    }
  });

  it('알고리즘·텍스트 예제의 경계 입력 케이스를 검증한다', () => {
    const getCode = (id: string) => EXAMPLES.find((e) => e.id === id)!.code;

    // truth_machine: 1 -> loops and hits maxSteps cleanly
    const tm1 = run(getCode('truth_machine'), { stdin: '1', maxSteps: 50 });
    expect(tm1.error?.code).toBe('RUNTIME_STEP_LIMIT');
    expect(tm1.output.startsWith('1\n1\n')).toBe(true);

    // factorial edge cases including BigInt 30!
    const facCode = getCode('factorial');
    expect(run(facCode, { stdin: '0' }).output).toBe('1\n');
    expect(run(facCode, { stdin: '1' }).output).toBe('1\n');
    expect(run(facCode, { stdin: '20' }).output).toBe('2432902008176640000\n');
    expect(run(facCode, { stdin: '30' }).output).toBe('265252859812191058636308480000000\n');

    // gcd edge cases
    const gcdCode = getCode('gcd');
    expect(run(gcdCode, { stdin: '0 5' }).output).toBe('5\n');
    expect(run(gcdCode, { stdin: '-48 18' }).output).toBe('6\n');
    expect(run(gcdCode, { stdin: '0 0' }).output).toBe('0\n');

    // is_prime edge cases
    const primeCode = getCode('is_prime');
    for (const [n, expected] of [
      ['-1', '0\n'],
      ['0', '0\n'],
      ['1', '0\n'],
      ['2', '1\n'],
      ['3', '1\n'],
      ['4', '0\n'],
      ['9', '0\n'],
      ['97', '1\n'],
      ['100', '0\n'],
    ]) {
      expect(run(primeCode, { stdin: n }).output, `is_prime(${n})`).toBe(expected);
    }

    // palindrome edge cases
    const palCode = getCode('palindrome');
    expect(run(palCode, { stdin: 'level\n' }).output).toBe('1\n');
    expect(run(palCode, { stdin: 'racecar\r\n' }).output).toBe('1\n');
    expect(run(palCode, { stdin: '줴줴랭' }).output).toBe('0\n');
    expect(run(palCode, { stdin: '' }).output).toBe('1\n');

    // caesar_cipher shifts (+3, -3, 29)
    const caesarCode = getCode('caesar_cipher');
    expect(run(caesarCode, { stdin: '-3\nKhoor, Zruog!' }).output).toBe('Hello, World!');
    expect(run(caesarCode, { stdin: '29\nXYZ xyz 줴!' }).output).toBe('ABC abc 줴!');

    // sort edge cases
    const sortCode = getCode('sort');
    expect(run(sortCode, { stdin: '1\n42' }).output).toBe('42\n');
    expect(run(sortCode, { stdin: '0' }).output).toBe('\n');

    // rpn_calc edge cases (multi-digit, negative sign, div/mod)
    const rpnCode = getCode('rpn_calc');
    expect(run(rpnCode, { stdin: '-5 8 + 10 *' }).output).toBe('30\n');
    expect(run(rpnCode, { stdin: '100 25 / 3 -' }).output).toBe('1\n');
    expect(run(rpnCode, { stdin: '20 3 %' }).output).toBe('2\n');
  });

  it('대표 알고리즘·문자열 예제가 JS 및 C11 컴파일 후에도 동일하게 동작한다', () => {
    for (const id of ['gcd', 'is_prime', 'palindrome', 'caesar_cipher', 'sort', 'rpn_calc']) {
      const ex = EXAMPLES.find((e) => e.id === id)!;
      const expected = run(ex.code, { stdin: ex.defaultStdin }).output;

      const jsRes = compileToTarget(ex.code, 'js');
      expect(jsRes.diagnostics).toEqual([]);
      expect(runJsCompiled(jsRes.code, ex.defaultStdin), `${id} js`).toBe(expected);

      const cRes = compileToTarget(ex.code, 'c');
      expect(cRes.diagnostics).toEqual([]);
      expect(cRes.warnings).toEqual([]);
      expect(runCCompiled(cRes.code, ex.defaultStdin), `${id} c`).toBe(expected);
    }
  }, 15_000);

  it('문법 에러 체험 예제가 여러 문법 진단을 수집한다', () => {
    const errExample = EXAMPLES.find((item) => item.id === 'syntax-errors');
    expect(errExample).toBeDefined();
    const compiled = compile(errExample!.code);
    expect(compiled.diagnostics.length).toBeGreaterThanOrEqual(5);
    expect(compiled.instructions).toEqual([]);
  });
});
