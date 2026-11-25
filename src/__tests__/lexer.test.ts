import { describe, expect, it } from 'vitest';
import { MAX_EXPONENT, tokenize } from '../core/lexer.js';

describe('Lexer (tokenize)', () => {
  it('모든 8종 키워드와 단일/복합 토큰을 정확히 인식한다', () => {
    const src = [
      '요이~',
      '엄 엄... 엄,, 어엄. 어어엄....',
      '예? 아 예?',
      '티~원 티~~원 티~원!',
      '지랄 지~랄 지~~랄 지~~~랄 지~~~~랄',
      '지랄? 지~랄? 지~~랄?',
      '쥐랄 쥐~랄 쥐~~랄 쥐~~~랄 쥐~~~~랄 쥐랄! 쥐~랄!',
      '아뇨 아뇨아뇨? 아뇨아뇨 아뇨아뇨~ 아뇨아뇨! 아뇨아뇨아뇨',
      '넌 나가라 넌 나가라!',
      '줴줴이야',
    ].join('\n');

    const { tokens, diagnostics } = tokenize(src);
    expect(diagnostics).toEqual([]);
    expect(tokens.map((t) => t.type)).toEqual([
      'START',
      'PUSH',
      'PUSH',
      'PUSH',
      'PUSH',
      'PUSH',
      'INPUT_INT',
      'INPUT_CHAR',
      'PRINT_INT',
      'PRINT_INT_LN',
      'PRINT_CHAR',
      'ADD',
      'SUB',
      'MUL',
      'DIV',
      'MOD',
      'EQ',
      'LT',
      'GT',
      'DUP',
      'SWAP',
      'OVER',
      'ROT',
      'DEPTH',
      'STORE',
      'LOAD',
      'NOT',
      'IF',
      'ELSE',
      'WHILE',
      'END',
      'CONTINUE',
      'POP',
      'BREAK',
      'HALT',
    ]);

    expect(tokens.slice(1, 6).map((t) => t.value)).toEqual([0n, 3n, -2n, 10n, 400n]);
  });

  it('순화 별칭 지(~*)롤과 지(~*)롤?를 동일하게 인식한다', () => {
    const { tokens, diagnostics } = tokenize('지롤 지~롤 지~~롤 지~~~롤 지~~~~롤 지롤? 지~롤? 지~~롤?');
    expect(diagnostics).toEqual([]);
    expect(tokens.map((t) => t.type)).toEqual([
      'ADD',
      'SUB',
      'MUL',
      'DIV',
      'MOD',
      'EQ',
      'LT',
      'GT',
    ]);
  });

  it('Object.prototype 속성 이름(toString, constructor, __proto__)을 키워드로 오인하지 않는다', () => {
    const { tokens, diagnostics } = tokenize('toString constructor valueOf __proto__');
    expect(tokens).toEqual([]);
    expect(diagnostics.map((d) => d.code)).toEqual([
      'LEX_UNKNOWN_TOKEN',
      'LEX_UNKNOWN_TOKEN',
      'LEX_UNKNOWN_TOKEN',
      'LEX_UNKNOWN_TOKEN',
    ]);
  });

  it('2단어 키워드(아 예?, 넌 나가라, 넌 나가라!)가 줄바꿈되면 문법 에러를 낸다', () => {
    const { diagnostics } = tokenize('아\n예?\n넌\n나가라\n나가라!');
    expect(diagnostics.map((d) => d.code)).toEqual([
      'LEX_INCOMPLETE_AH',
      'LEX_INCOMPLETE_NEON',
      'LEX_ORPHAN_NAGARA',
      'LEX_ORPHAN_NAGARA',
    ]);
  });

  it("'엄' 리터럴에서 점/쉼표 혼합, 값 누락, 최대 지수 초과를 잡는다", () => {
    const { diagnostics } = tokenize(`엄., 어엄 ${'어'.repeat(MAX_EXPONENT + 1)}엄.`);
    expect(diagnostics.map((d) => d.code)).toEqual([
      'LEX_MIXED_NUMBER_MARKS',
      'LEX_MISSING_NUMBER_VALUE',
      'LEX_NUMBER_TOO_LARGE',
    ]);
    expect(diagnostics[2].message.length).toBeLessThan(120);
  });

  it('UTF-8 BOM, CRLF, NBSP(\\u00A0), 전각 공백(\\u3000)과 주석을 올바르게 처리한다', () => {
    const src = '\uFEFF요이~\u00A0엄.\u3000// 주석\r\n아 예?\r\n줴줴이야';
    const { tokens, diagnostics } = tokenize(src);
    expect(diagnostics).toEqual([]);
    expect(tokens.map((t) => t.type)).toEqual(['START', 'PUSH', 'INPUT_CHAR', 'HALT']);
    expect(tokens[0]).toMatchObject({ line: 1, column: 1, endColumn: 4 });
    expect(tokens[2]).toMatchObject({ line: 2, column: 1, endColumn: 5 });
    expect(tokens[3]).toMatchObject({ line: 3, column: 1, endColumn: 5 });
  });

  it('긴 미등록 토큰 에러 메시지를 절단하고 다양한 오타 힌트를 제공한다', () => {
    const hugeUnknown = '헐'.repeat(200);
    const { diagnostics } = tokenize(
      `요이 아예? 티원 줴줴 지~~~~~랄 지~~~랄? 쥐~~랄! 쥐~~~~~랄 넌나가라 쥐롤 제제이야 예! ${hugeUnknown}`,
    );
    expect(diagnostics).toHaveLength(13);
    expect(diagnostics[0].hint).toContain('요이~');
    expect(diagnostics[1].hint).toContain('아 예?');
    expect(diagnostics[2].hint).toContain('티~원');
    expect(diagnostics[3].hint).toContain('줴줴이야');
    expect(diagnostics[4].code).toBe('LEX_TOO_MANY_TILDES');
    expect(diagnostics[5].code).toBe('LEX_TOO_MANY_TILDES');
    expect(diagnostics[6].code).toBe('LEX_INVALID_MEMORY_OP');
    expect(diagnostics[7].code).toBe('LEX_INVALID_STACK_OP');
    expect(diagnostics[8].hint).toContain('넌 나가라');
    expect(diagnostics[9].hint).toContain('쥐(~*)랄');
    expect(diagnostics[10].hint).toContain('줴줴이야');
    expect(diagnostics[11].hint).toContain('예?');
    expect(diagnostics[12].message.length).toBeLessThan(100);
    expect(diagnostics[12].message).toContain('…');
  });
});
