import { describe, expect, it } from 'vitest';
import { compile, encodeBigInt, run, textToGG } from '../core/index.js';

describe('Transpiler (textToGG & encodeBigInt)', () => {
  it('임의의 정수, 음수, MAX_EXPONENT 초과 초대형 BigInt를 올바르게 인코딩한다', () => {
    const huge = 10n ** 1205n + 42n;
    const hugeNeg = -(10n ** 1205n + 7n);
    for (const n of [0n, 1n, -7n, 10n, 42n, 1005n, -4032n, 128293n, huge, hugeNeg]) {
      const src = `요이~ ${encodeBigInt(n)} 티~원 줴줴이야`;
      const state = run(src);
      expect(state.error).toBeNull();
      expect(state.output).toBe(n.toString());
    }
  });

  it('영문, 한글, 이모지, 줄바꿈, 빈 문자열을 변환 후 실행하면 원본과 100% 일치한다', () => {
    const samples = [
      '',
      'Hello, World!',
      '안녕, 줴줴랭!\n두 번째 줄\t탭',
      '이모지 테스트 🔥🎉✨🚀',
    ];

    for (const text of samples) {
      const ggCode = textToGG(text);
      const compiled = compile(ggCode);
      expect(compiled.diagnostics).toEqual([]);
      const state = run(ggCode);
      expect(state.error).toBeNull();
      expect(state.output).toBe(text);
    }
  });

  it('주석에 코드포인트 숫자 없이 문자만 남기고, 외로운 서로게이트와 Bidi/제어문자를 안전 처리한다', () => {
    const ggSample = textToGG('줴A');
    const lines = ggSample.split('\n');
    expect(lines[1]).toMatch(/티~원! \/\/ '줴'$/);
    expect(lines[2]).toMatch(/티~원! \/\/ 'A'$/);

    const loneSurrogate = textToGG('\uD800');
    expect(compile(loneSurrogate).diagnostics).toEqual([]);
    const surrogateRun = run(loneSurrogate);
    expect(surrogateRun.error).toBeNull();
    expect(surrogateRun.output).toBe('\uFFFD');

    const bidiAndSep = textToGG('\u202E\u2028\u0085');
    expect(bidiAndSep).toContain("U+202E");
    expect(bidiAndSep).toContain("U+2028");
    expect(bidiAndSep).toContain("U+0085");
    const bidiRun = run(bidiAndSep);
    expect(bidiRun.error).toBeNull();
    expect(bidiRun.output).toBe('\u202E\u2028\u0085');
  });
});
