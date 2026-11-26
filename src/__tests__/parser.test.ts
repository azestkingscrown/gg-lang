import { describe, expect, it } from 'vitest';
import { compile, parse, type Token, type TokenType } from '../core/index.js';

describe('Parser (compile & parse)', () => {
  it('빈 코드나 주석만 있는 코드는 SYNTAX_EMPTY 에러를 반환한다', () => {
    const empty = compile('   \n  // 주석만 있음\n');
    expect(empty.diagnostics).toHaveLength(1);
    expect(empty.diagnostics[0].code).toBe('SYNTAX_EMPTY');
    expect(empty.instructions).toEqual([]);
  });

  it('요이~ 누락, 중복, 줴줴이야 누락을 모두 수집하고 에러 시 instructions를 비운다', () => {
    const prog = compile('엄. 요이~ 야~르');
    expect(prog.diagnostics.map((d) => d.code)).toEqual([
      'SYNTAX_MISSING_START',
      'SYNTAX_DUPLICATE_START',
      'SYNTAX_MISSING_HALT',
    ]);
    expect(prog.instructions).toEqual([]);
  });

  it('Object.prototype 키 토큰이 parse()에 직접 전달되어도 안전하게 거부한다', () => {
    const tokens: Token[] = [
      { type: 'START', raw: '요이~', line: 1, column: 1, endColumn: 4 },
      { type: 'toString' as unknown as TokenType, raw: 'toString', line: 1, column: 5, endColumn: 13 },
      { type: 'HALT', raw: '줴줴이야', line: 1, column: 14, endColumn: 18 },
    ];
    const prog = parse(tokens);
    expect(prog.diagnostics.map((d) => d.code)).toEqual(['SYNTAX_UNKNOWN_TOKEN']);
    expect(prog.instructions).toEqual([]);
  });

  it('중간에 조기 종료용 줴줴이야가 들어가도 마지막이 줴줴이야면 정상 컴파일된다', () => {
    const prog = compile(`
      요이~
      엄.
      아뇨아뇨?
        엄.. 야~르
        줴줴이야
      아뇨아뇨!
      줴줴이야
    `);
    expect(prog.diagnostics).toEqual([]);
  });

  it('닫히지 않은 IF/WHILE 블록과 여분의 ELSE/END를 잡는다', () => {
    const unclosed = compile('요이~ 엄. 아뇨아뇨? 엄. 줴줴이야');
    expect(unclosed.diagnostics.some((d) => d.code === 'SYNTAX_UNCLOSED_BLOCK')).toBe(true);
    expect(unclosed.instructions).toEqual([]);

    const extra = compile('요이~ 아뇨아뇨 아뇨아뇨! 줴줴이야');
    expect(extra.diagnostics.map((d) => d.code)).toEqual([
      'SYNTAX_UNEXPECTED_ELSE',
      'SYNTAX_UNEXPECTED_END',
    ]);

    const dupElse = compile('요이~ 엄. 아뇨아뇨? 엄. 아뇨아뇨 엄.. 아뇨아뇨 엄... 아뇨아뇨! 줴줴이야');
    expect(dupElse.diagnostics.map((d) => d.code)).toEqual(['SYNTAX_DUPLICATE_ELSE']);
  });

  it('반복문 밖에서 BREAK/CONTINUE를 쓰면 에러를 낸다', () => {
    const prog = compile('요이~ 넌 나가라! 아뇨아뇨아뇨 줴줴이야');
    expect(prog.diagnostics.map((d) => d.code)).toEqual([
      'SYNTAX_BREAK_OUTSIDE_LOOP',
      'SYNTAX_CONTINUE_OUTSIDE_LOOP',
    ]);
  });

  it('중첩된 IF 내부의 BREAK와 CONTINUE는 정상 컴파일된다', () => {
    const prog = compile(`
      요이~
      엄...
      아뇨아뇨~
        엄. 지~랄
        쥐랄 엄. 지랄?
        아뇨아뇨?
          아뇨아뇨아뇨
        아뇨아뇨
          넌 나가라!
        아뇨아뇨!
      아뇨아뇨!
      넌 나가라
      줴줴이야
    `);
    expect(prog.diagnostics).toEqual([]);
  });
});
