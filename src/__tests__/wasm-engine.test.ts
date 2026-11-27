import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { EXAMPLES } from '../lib/examples.js';
import {
  analyze,
  compileToTarget,
  createSteppingVM,
  encodeBigInt,
  initEngineFromBytes,
  isEngineReady,
  isIncompleteFragment,
  runProgram,
  textToGG,
} from '../lib/engine.js';

beforeAll(() => {
  const wasmPath = path.resolve(process.cwd(), 'src/lib/wasm-pkg/gg_wasm_bg.wasm');
  const bytes = fs.readFileSync(wasmPath);
  initEngineFromBytes(bytes);
});

describe('gg-wasm browser engine bridge', () => {
  it('initializes synchronously from WASM bytes and reports ready', () => {
    expect(isEngineReady()).toBe(true);
  });

  it('runs all executable playground examples cleanly and reports syntax errors', () => {
    const runnable = EXAMPLES.filter((ex) => ex.id !== 'syntax-errors');
    expect(runnable).toHaveLength(16);

    const outputs = new Map<string, string>();
    for (const ex of runnable) {
      const { diagnostics, state } = runProgram(ex.code, ex.defaultStdin);
      expect(diagnostics, `example ${ex.id} should have no syntax errors`).toEqual([]);
      expect(state.error, `example ${ex.id} should have no runtime error`).toBeNull();
      expect(state.halted, `example ${ex.id} should halt`).toBe(true);
      expect(state.output.length, `example ${ex.id} should produce output`).toBeGreaterThan(0);
      outputs.set(ex.id, state.output);
    }

    expect(outputs.get('hello')).toBe('Hello, World!\n');
    expect(outputs.get('hangul')).toBe('안녕, 줴줴!\n');
    expect(outputs.get('add')).toBe('42\n');
    expect(outputs.get('reverse')).toBe('CBA🔥줴줴');
    expect(outputs.get('rpn_calc')).toBe('7\n');

    const factorialEx = runnable.find((ex) => ex.id === 'factorial');
    expect(factorialEx).toBeDefined();
    const fac30 = runProgram(factorialEx!.code, '30');
    expect(fac30.diagnostics).toEqual([]);
    expect(fac30.state.error).toBeNull();
    expect(fac30.state.output).toBe('265252859812191058636308480000000\n');

    const broken = EXAMPLES.find((ex) => ex.id === 'syntax-errors');
    expect(broken).toBeDefined();
    const brokenDiags = analyze(broken!.code);
    expect(brokenDiags.length).toBeGreaterThan(1);
  });

  it('supports SteppingVM execution, BigInt state inspection, clearOutput, and idempotent dispose', () => {
    const vm = createSteppingVM('요이~ 엄... 엄.. 지랄 야~~르 줴줴이야', '');
    try {
      expect(vm.diagnostics).toEqual([]);
      expect(vm.isHalted).toBe(false);

      expect(vm.step()).toBe(true); // PUSH 3
      expect(vm.getState().stack).toEqual([3n]);

      expect(vm.step()).toBe(true); // PUSH 2
      expect(vm.getState().stack).toEqual([3n, 2n]);

      expect(vm.step()).toBe(true); // ADD
      expect(vm.getState().stack).toEqual([5n]);

      const finalState = vm.run();
      expect(finalState.halted).toBe(true);
      expect(finalState.output).toBe('5\n');
      expect(vm.isHalted).toBe(true);

      vm.clearOutput();
      expect(vm.getState().output).toBe('');
    } finally {
      vm.dispose();
      vm.dispose();
    }
  });

  it('compiles to JavaScript and C11 and returns diagnostics on syntax errors', () => {
    const hello = EXAMPLES.find((ex) => ex.id === 'hello')!;

    const jsRes = compileToTarget(hello.code, 'js');
    expect(jsRes.target).toBe('js');
    expect(jsRes.extension).toBe('.mjs');
    expect(jsRes.diagnostics).toEqual([]);
    expect(jsRes.code).toContain('switch (ip)');

    const cRes = compileToTarget(hello.code, 'c');
    expect(cRes.target).toBe('c');
    expect(cRes.extension).toBe('.c');
    expect(cRes.diagnostics).toEqual([]);
    expect(cRes.code).toContain('#include');

    const badRes = compileToTarget('요이~ 어엄 줴줴이야', 'js');
    expect(badRes.diagnostics.length).toBeGreaterThan(0);
    expect(badRes.code).toBe('');
  });

  it('roundtrips arbitrary Unicode text via textToGG and big integers via encodeBigInt', () => {
    const sample = '안녕, 줴줴🔥!';
    const generated = textToGG(sample);
    const { diagnostics, state } = runProgram(generated, '');
    expect(diagnostics).toEqual([]);
    expect(state.error).toBeNull();
    expect(state.output).toBe(sample);

    const huge = 123456789012345678901234567890n;
    const expr = encodeBigInt(huge);
    const numRun = runProgram(`요이~ ${expr} 야~르 줴줴이야`, '');
    expect(numRun.diagnostics).toEqual([]);
    expect(numRun.state.error).toBeNull();
    expect(numRun.state.output).toBe(huge.toString());
  });

  it('detects incomplete REPL fragments accurately', () => {
    expect(isIncompleteFragment('요이~ 엄. 아뇨아뇨~')).toBe(true);
    expect(isIncompleteFragment('엄.')).toBe(false);
  });
});
