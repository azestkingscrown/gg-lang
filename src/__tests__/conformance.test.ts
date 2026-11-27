import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAX_EXPONENT, compile, compileToTarget, run } from '../core/index.js';

interface ConformanceCase {
  id: string;
  category: 'lexer' | 'parser' | 'vm';
  description: string;
  code: string;
  stdin?: string;
  options?: {
    maxSteps?: number;
  };
  expected: {
    status: 'ok' | 'syntax_error' | 'runtime_error';
    output?: string;
    stack?: string[];
    errorCodes?: string[];
  };
}

interface ConformanceSuite {
  specVersion: string;
  cases: ConformanceCase[];
}

const suitePath = path.resolve(process.cwd(), 'spec', 'conformance.json');
const suite = JSON.parse(fs.readFileSync(suitePath, 'utf8')) as ConformanceSuite;

describe(`spec/conformance.json (v${suite.specVersion})`, () => {
  it('모든 적합성 테스트 케이스를 VM 에서 통과한다', () => {
    expect(suite.cases.length).toBeGreaterThanOrEqual(30);

    for (const tc of suite.cases) {
      const compiled = compile(tc.code);

      if (tc.expected.status === 'syntax_error') {
        expect(compiled.diagnostics.length, `${tc.id} syntax_error`).toBeGreaterThan(0);
        const codes = compiled.diagnostics.map((d) => d.code);
        for (const expectedCode of tc.expected.errorCodes ?? []) {
          expect(codes, `${tc.id} missing ${expectedCode}`).toContain(expectedCode);
        }
        continue;
      }

      expect(compiled.diagnostics, `${tc.id} unexpected syntax error`).toEqual([]);
      const result = run(tc.code, {
        stdin: tc.stdin ?? '',
        maxSteps: tc.options?.maxSteps,
      });

      if (tc.expected.status === 'runtime_error') {
        expect(result.error, `${tc.id} expected runtime error`).not.toBeNull();
        expect(result.error!.message).toContain('터져서 없어짐 수고하세요');
        if (tc.expected.errorCodes?.length) {
          expect(tc.expected.errorCodes).toContain(result.error!.code);
        }
      } else {
        expect(result.error, `${tc.id} unexpected runtime error`).toBeNull();
        if (tc.expected.output !== undefined) {
          expect(result.output, `${tc.id} output`).toBe(tc.expected.output);
        }
        if (tc.expected.stack !== undefined) {
          expect(
            result.stack.map((v) => v.toString()),
            `${tc.id} stack`,
          ).toEqual(tc.expected.stack);
        }
      }
    }

    // Also explicitly verify > MAX_EXPONENT literal diagnostic code dynamically
    const tooLargeLiteral = `요이~ ${'어'.repeat(MAX_EXPONENT + 1)}엄. 줴줴이야`;
    const tooLarge = compile(tooLargeLiteral);
    expect(tooLarge.diagnostics.map((d) => d.code)).toContain('LEX_NUMBER_TOO_LARGE');
  });

  it('status=ok 적합성 케이스가 JavaScript 컴파일 타깃(--emit js)에서도 동일하게 실행된다', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gg-conf-js-'));
    try {
      for (const tc of suite.cases.filter((item) => item.expected.status === 'ok')) {
        const emitted = compileToTarget(tc.code, 'js', { maxSteps: tc.options?.maxSteps });
        expect(emitted.diagnostics).toEqual([]);
        const file = path.join(dir, `${tc.id}.mjs`);
        fs.writeFileSync(file, emitted.code, 'utf8');
        const res = spawnSync(process.execPath, [file], {
          input: tc.stdin ?? '',
          encoding: 'utf8',
        });
        expect(res.status, `${tc.id} js exit`).toBe(0);
        if (tc.expected.output !== undefined) {
          expect(res.stdout, `${tc.id} js output`).toBe(tc.expected.output);
        }
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 20_000);
});
