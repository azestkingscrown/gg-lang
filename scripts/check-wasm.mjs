import fs from 'node:fs';
import path from 'node:path';

const wasmPath = path.resolve(process.cwd(), 'src/lib/wasm-pkg/gg_wasm_bg.wasm');
if (!fs.existsSync(wasmPath)) {
  console.error(
    '[gg-lang] Missing src/lib/wasm-pkg/gg_wasm_bg.wasm.\n' +
      'Run "npm run build:wasm" first to build the Rust WASM engine.',
  );
  process.exit(1);
}
