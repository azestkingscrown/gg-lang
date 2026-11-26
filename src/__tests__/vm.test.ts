import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { JjeJjeVM, compile, createVM, run, type VMState } from '../core/index.js';

function expectRuntimeError(state: VMState, expectedCode: string): void {
  expect(state.error).not.toBeNull();
  expect(state.error?.kind).toBe('runtime');
  expect(state.error?.code).toBe(expectedCode);
  expect(state.error?.message).toContain('터져서 없어짐 수고하세요');
  expect(state.halted).toBe(true);
  expect(state.currentToken).not.toBeNull();
  expect(state.currentLine).toBe(state.error?.line ?? null);
}

describe('JjeJjeVM (execution, limits & examples)', () => {
  it('사칙연산, 음수 나눗셈/나머지(0 방향 절사), 비교 연산을 정확히 수행한다', () => {
    const state = run(`
      요이~
      엄..... 엄,, 지랄 야~~르       // 5 + (-2) = 3
      엄... 엄..... 지~랄 야~~르     // 3 - 5 = -2
      어엄. 엄... 지~~랄 야~~르      // 10 * 3 = 30
      어엄.. 엄... 지~~~랄 야~~르    // 20 / 3 = 6
      어엄.. 엄... 지~~~~랄 야~~르   // 20 % 3 = 2
      엄,,,,,,, 엄.. 지~~~랄 야~~르  // -7 / 2 = -3
      엄,,,,,,, 엄.. 지~~~~랄 야~~르 // -7 % 2 = -1
      엄... 엄... 지랄? 야~~르       // 3 == 3 -> 1
      엄.. 엄..... 지~랄? 야~~르     // 2 < 5 -> 1
      엄.. 엄..... 지~~랄? 야~~르    // 2 > 5 -> 0
      줴줴이야
    `);
    expect(state.error).toBeNull();
    expect(state.output).toBe('3\n-2\n30\n6\n2\n-3\n-1\n1\n1\n0\n');
  });

  it('0으로 나누거나 나머지 연산 시 스택 피연산자를 보존하며 런타임 에러를 낸다', () => {
    const divZero = run('요이~ 엄..... 엄 지~~~랄 줴줴이야');
    expectRuntimeError(divZero, 'RUNTIME_DIV_ZERO');
    expect(divZero.stack).toEqual([5n, 0n]);

    const modZero = run('요이~ 엄..... 엄 지~~~~롤 줴줴이야');
    expectRuntimeError(modZero, 'RUNTIME_DIV_ZERO');
    expect(modZero.stack).toEqual([5n, 0n]);
  });

  it('스택 조작 명령(DUP/SWAP/OVER/ROT/DEPTH)과 음수 주소 포함 메모리(STORE/LOAD)를 실행한다', () => {
    const state = run(`
      요이~
      엄. 엄.. 엄...     // [1, 2, 3]
      쥐~~~~랄 야~~르    // DEPTH = 3, stack [1, 2, 3]
      쥐~~~랄            // ROT -> [2, 3, 1]
      쥐~~랄             // OVER -> [2, 3, 1, 3]
      쥐~랄              // SWAP -> [2, 3, 3, 1]
      쥐랄               // DUP -> [2, 3, 3, 1, 1]
      야~~르 야~~르 야~~르 야~~르 야~~르
      어어엄. 엄....     // val = 100, addr = 4
      쥐랄!              // mem[4] = 100
      어엄. 엄,,,,,      // val = 10, addr = -5
      쥐랄!              // mem[-5] = 10
      엄.... 쥐~랄!      // load mem[4] -> 100
      엄,,,,, 쥐~랄!     // load mem[-5] -> 10
      엄..... 쥐~랄!     // load mem[5] (미초기화) -> 0
      야~~르 야~~르 야~~르
      줴줴이야
    `);
    expect(state.error).toBeNull();
    expect(state.output).toBe('3\n1\n1\n3\n3\n2\n0\n10\n100\n');
  });

  it('IF/ELSE, NOT, WHILE(0회 포함), CONTINUE, BREAK, 조기 HALT가 정확히 동작한다', () => {
    const state = run(`
      요이~
      엄            // i = 0
      엄.           // loop cond = 1
      아뇨아뇨~
        넌 나가라   // cond 제거 -> [i]
        엄. 지랄    // i += 1
        쥐랄 엄... 지랄?
        아뇨아뇨?
          엄.
          아뇨아뇨아뇨
        아뇨아뇨!
        쥐랄 엄..... 지랄?
        아뇨아뇨?
          넌 나가라! // BREAK
        아뇨아뇨!
        쥐랄 야~~르
        엄.
      아뇨아뇨!
      넌 나가라
      엄 아뇨아뇨~  // 0이므로 0회 실행
        엄......... 야~~르
      아뇨아뇨!
      넌 나가라
      엄.
      아뇨아뇨?
        엄....... 야~~르
        줴줴이야    // 조기 종료
      아뇨아뇨!
      엄......... 야~~르
      줴줴이야
    `);
    expect(state.error).toBeNull();
    expect(state.output).toBe('1\n2\n4\n7\n');

    const ifElseState = run(`
      요이~
      엄 아뇨
      아뇨아뇨?
        엄. 야~~르
      아뇨아뇨
        엄.. 야~~르
      아뇨아뇨!
      엄. 아뇨
      아뇨아뇨?
        엄... 야~~르
      아뇨아뇨
        엄.... 야~~르
      아뇨아뇨!
      줴줴이야
    `);
    expect(ifElseState.error).toBeNull();
    expect(ifElseState.output).toBe('1\n4\n');
  });

  it('입출력 및 유니코드 이모지/잘못된 코드포인트/EOF/스텝초과를 처리한다', () => {
    const emojiEcho = run('요이~ 아 예? 야~르! 아 예? 야~~르 줴줴이야', { stdin: '🔥' });
    expect(emojiEcho.error).toBeNull();
    expect(emojiEcho.output).toBe('🔥-1\n');

    const badCodepoint = run('요이~ 엄, 야~르! 줴줴이야');
    expectRuntimeError(badCodepoint, 'RUNTIME_INVALID_CODEPOINT');
    expect(badCodepoint.stack).toEqual([-1n]);

    const eofInt = run('요이~ 예? 야~~르 줴줴이야', { stdin: '  ' });
    expectRuntimeError(eofInt, 'RUNTIME_STDIN_EOF');

    const badInt = run('요이~ 예? 야~~르 줴줴이야', { stdin: 'abc' });
    expectRuntimeError(badInt, 'RUNTIME_INVALID_INT');

    const infLoop = run('요이~ 엄. 아뇨아뇨~ 아뇨아뇨! 줴줴이야', { maxSteps: 50 });
    expectRuntimeError(infLoop, 'RUNTIME_STEP_LIMIT');
  });

  it('스택 언더플로우, 스택/메모리 오버플로우, BigInt/출력 상한, NaN 옵션을 방어한다', () => {
    for (const code of [
      '요이~ 넌 나가라 줴줴이야',
      '요이~ 쥐랄 줴줴이야',
      '요이~ 쥐~랄 줴줴이야',
      '요이~ 엄. 쥐~~랄 줴줴이야',
      '요이~ 엄. 엄.. 쥐~~~랄 줴줴이야',
      '요이~ 아뇨아뇨~ 아뇨아뇨! 줴줴이야',
    ]) {
      expectRuntimeError(run(code), 'RUNTIME_STACK_UNDERFLOW');
    }

    const stackOver = run('요이~ 엄. 엄.. 엄... 줴줴이야', { maxStackSize: 2 });
    expectRuntimeError(stackOver, 'RUNTIME_STACK_OVERFLOW');
    expect(stackOver.stack).toEqual([1n, 2n]);

    const memOver = run('요이~ 엄. 엄. 쥐랄! 엄.. 엄.. 쥐랄! 줴줴이야', { maxMemorySize: 1 });
    expectRuntimeError(memOver, 'RUNTIME_MEMORY_OVERFLOW');
    expect(memOver.stack).toEqual([2n, 2n]);

    const squaringBomb = run(
      `요이~ ${'어'.repeat(500)}엄. ${'쥐랄 지~~랄 '.repeat(12)}줴줴이야`,
    );
    expectRuntimeError(squaringBomb, 'RUNTIME_BIGINT_OVERFLOW');

    const stdinBomb = run('요이~ 예? 줴줴이야', { stdin: '9'.repeat(25_000) });
    expectRuntimeError(stdinBomb, 'RUNTIME_BIGINT_OVERFLOW');
    expect(stdinBomb.error!.message.length).toBeLessThan(150);

    const outLimit = run('요이~ 엄. 아뇨아뇨~ 어엄. 야~르 아뇨아뇨! 줴줴이야', {
      maxOutputLength: 5,
    });
    expectRuntimeError(outLimit, 'RUNTIME_OUTPUT_LIMIT');

    const nanBypass = run('요이~ 엄. 아뇨아뇨~ 아뇨아뇨! 줴줴이야', { maxSteps: Number.NaN });
    expectRuntimeError(nanBypass, 'RUNTIME_STEP_LIMIT');
  });

  it('잘못된 점프 대상/오피코드를 수동 VM에서 방어하고 clearOutput()이 동작한다', () => {
    const tok = { type: 'HALT' as const, raw: '줴줴이야', line: 1, column: 1, endColumn: 5 };
    const badJumpVm = new JjeJjeVM({
      tokens: [tok],
      diagnostics: [],
      instructions: [{ op: 'JMP', operand: 999, token: tok }],
    });
    expectRuntimeError(badJumpVm.run(), 'RUNTIME_INVALID_JUMP');

    const badOpVm = new JjeJjeVM({
      tokens: [tok],
      diagnostics: [],
      instructions: [{ op: 'toString' as unknown as 'HALT', token: tok }],
    });
    expectRuntimeError(badOpVm.run(), 'RUNTIME_INVALID_OPCODE');

    const { vm } = createVM('요이~ 엄.. 엄... 지랄 야~르 줴줴이야');
    expect(vm.isHalted).toBe(false);
    expect(vm.step()).toBe(true);
    expect(vm.step()).toBe(true);
    expect(vm.step()).toBe(true);
    expect(vm.step()).toBe(true);
    expect(vm.getState().output).toBe('5');
    vm.clearOutput();
    expect(vm.getState().output).toBe('');
    expect(vm.step()).toBe(false);
    expect(vm.isHalted).toBe(true);
  });

  it('examples/*.gg 6종 예제 파일이 문법 에러 없이 기대 출력을 생성한다', () => {
    const loadExample = (name: string) =>
      fs.readFileSync(path.resolve(process.cwd(), 'examples', name), 'utf8');

    const cases: Array<{ file: string; stdin?: string; expected: string }> = [
      { file: 'hello.gg', expected: 'Hello, World!\n' },
      { file: 'hangul.gg', expected: '안녕, 줴줴!\n' },
      { file: 'add.gg', stdin: '12 30', expected: '42\n' },
      { file: 'countdown.gg', expected: '5\n4\n3\n2\n1\n' },
      { file: 'fibonacci.gg', expected: '0 1 1 2 3 5 8 13 21 34\n' },
      { file: 'reverse.gg', stdin: '줴줴🔥ABC', expected: 'CBA🔥줴줴' },
      { file: 'reverse.gg', stdin: '', expected: '' },
    ];

    for (const c of cases) {
      const src = loadExample(c.file);
      const compiled = compile(src);
      expect(compiled.diagnostics, `${c.file} syntax`).toEqual([]);
      const res = run(src, { stdin: c.stdin });
      expect(res.error, `${c.file} runtime`).toBeNull();
      expect(res.output, `${c.file} output`).toBe(c.expected);
    }
  });
});
