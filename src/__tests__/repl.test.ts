import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { isIncompleteFragment } from '../core/index.js';
import { runRepl } from '../repl.js';

async function executeReplSession(
  lines: string[],
  options: Parameters<typeof runRepl>[0] = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  const input = new PassThrough();
  const output = new PassThrough();
  const errOutput = new PassThrough();

  let stdout = '';
  let stderr = '';
  output.setEncoding('utf8');
  errOutput.setEncoding('utf8');
  output.on('data', (chunk) => {
    stdout += chunk;
  });
  errOutput.on('data', (chunk) => {
    stderr += chunk;
  });

  const promise = runRepl({
    ...options,
    input,
    output,
    errOutput,
  });

  for (const line of lines) {
    input.write(`${line}\n`);
  }
  input.end();

  const code = await promise;
  return { code, stdout, stderr };
}

describe('isIncompleteFragment & REPL', () => {
  it('미완성 제어 블록 여부를 정확히 판별한다', () => {
    expect(isIncompleteFragment('아뇨아뇨?')).toBe(true);
    expect(isIncompleteFragment('아뇨아뇨~\n엄.')).toBe(true);
    expect(isIncompleteFragment('아뇨아뇨?\n엄.\n아뇨아뇨!')).toBe(false);
    expect(isIncompleteFragment('어엄')).toBe(false);
    expect(isIncompleteFragment('엄...')).toBe(false);
  });

  it('스택·힙 상태 유지, :stack/:mem/:reset/:trace/:q 메타 명령을 처리한다', async () => {
    const res = await executeReplSession([
      '엄... 엄..',
      ':stack',
      '지랄',
      ':stack',
      '엄.... 엄, 쥐랄!',
      '엄.. 엄.. 쥐랄!',
      ':mem',
      ':trace',
      '야~~르',
      ':trace',
      ':reset',
      ':stack',
      ':mem',
      ':q',
    ]);

    expect(res.code).toBe(0);
    expect(res.stdout).toBe(
      ['[3, 2]', '[5]', '{-1: 4, 2: 2}', 'trace: on', '5', 'trace: off', '스택과 메모리를 초기화했습니다.', '[]', '{}'].join('\n') +
        '\n',
    );
    expect(res.stderr).toContain('[trace] <repl>:1:1 #1 before PRINT_INT_LN (야~~르) stack=[5]');
  });

  it('여러 줄 블록 이어쓰기, 문법/런타임 에러 복구, --error-style plain 을 지원한다', async () => {
    const res = await executeReplSession(
      [
        '엄.',
        '아뇨아뇨?',
        '엄.....',
        '야~~르',
        '아뇨아뇨!',
        '엄..',
        '어엄',
        ':stack',
        '엄 지~~~랄',
        ':stack',
        '야~~르',
        ':q',
      ],
      { errorStyle: 'plain' },
    );

    expect(res.code).toBe(0);
    expect(res.stdout).toBe('5\n[2]\n[2, 0]\n0\n');
    expect(res.stderr).toContain('[syntax] 1:1 (LEX_MISSING_NUMBER_VALUE)');
    expect(res.stderr).toContain('[runtime] 1:3 (RUNTIME_DIV_ZERO) Division by zero');
  });

  it('블록이 닫히지 않은 채 EOF에 도달하면 종료 코드 1을 반환한다', async () => {
    const res = await executeReplSession(['아뇨아뇨~', '엄.']);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('SYNTAX_UNCLOSED_BLOCK');
  });
});
