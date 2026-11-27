import wasmUrl from './wasm-pkg/gg_wasm_bg.wasm?url';
import { initEngineFromUrl } from './engine-core.js';

export * from './engine-core.js';

export function getWasmUrl(): string {
  return wasmUrl;
}

export function initEngine(): Promise<void> {
  return initEngineFromUrl(wasmUrl);
}
