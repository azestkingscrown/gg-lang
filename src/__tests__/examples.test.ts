import { describe, expect, it } from 'vitest';
import { compile, run } from '../core/index.js';
import { EXAMPLES } from '../lib/examples.js';

describe('Web playground EXAMPLES', () => {
  it('1~6번 정상 예제가 문법 에러 없이 기대 출력을 생성한다', () => {
    const expectedOutputs: Record<string, string> = {
      hello: 'Hello, World!\n',
      hangul: '안녕, 줴줴!\n',
      add: '42\n',
      countdown: '5\n4\n3\n2\n1\n',
      fibonacci: '0 1 1 2 3 5 8 13 21 34\n',
      reverse: 'CBA🔥줴줴',
    };

    for (const ex of EXAMPLES.filter((item) => item.id !== 'syntax-errors')) {
      const compiled = compile(ex.code);
      expect(compiled.diagnostics, `${ex.id} diagnostics`).toEqual([]);
      const result = run(ex.code, { stdin: ex.defaultStdin });
      expect(result.error, `${ex.id} runtime error`).toBeNull();
      expect(result.output, `${ex.id} output`).toBe(expectedOutputs[ex.id]);
    }
  });

  it('7번 문법 에러 체험 예제가 여러 문법 진단을 수집한다', () => {
    const errExample = EXAMPLES.find((item) => item.id === 'syntax-errors');
    expect(errExample).toBeDefined();
    const compiled = compile(errExample!.code);
    expect(compiled.diagnostics.length).toBeGreaterThanOrEqual(5);
    expect(compiled.instructions).toEqual([]);
  });
});
