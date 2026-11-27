# 줴줴랭 (`gg-lang` / `.gg`)

> **Live Web Playground:** https://azestkingscrown.github.io/gg-lang/  
> **Language:** [한국어](README.md) | English

A **stack-based esoteric programming language (Esolang)** inspired by the Korean *"Wait? Um no no it's JjeJje"* meme set — implemented with a **100% Rust core engine & native CLI** (`gg-core` / `gg-cli`), **WebAssembly browser runtime** (`gg-wasm`), SvelteKit Web Playground, execution tracer, JavaScript/C11 compilers, and a language-agnostic conformance suite.

- **File Extension**: `.gg`
- **Execution Model**: Rust arbitrary-precision `BigInt` (`num-bigint`) stack + `BTreeMap<BigInt, BigInt>` heap VM (`JjeJjeVM`), compiled both to native `gg` CLI and browser `.wasm`
- **Strict Static Diagnostics**: Collects unknown tokens, typos with fix hints, mixed number signs, and unmatched control blocks before execution (`//` single-line comments supported)
- **Web Playground**: SvelteKit 3 + Svelte 5 warm dark terminal UI powered by `gg-wasm`, Web Worker async run/stop, step & autoplay debugger, stack/heap inspector, live **Compile (JS / C11)** tab, URL sharing (`#code=...`), `.gg` import/export, and text → `.gg` encoder

---

## Quick Start

### 1. Build & Run Native Rust CLI (`gg`)

Requires a recent Rust toolchain (`cargo`):

```bash
cargo build --release -p gg-cli
# or: npm run build:cli
```

Run programs, inspect syntax, trace steps, start the REPL, or compile to JS/C:

```bash
# Run a .gg file
./target/release/gg examples/hello.gg
printf "48 18" | ./target/release/gg examples/gcd.gg

# Or via npm script during development
npm run gg -- examples/fibonacci.gg

# Interactive REPL (keeps stack & heap across lines, :stack, :mem, :reset, :trace, :q)
./target/release/gg repl

# Step-by-step trace & plain English error style
./target/release/gg -e "요이~ 엄... 엄.. 지랄 야~~르 줴줴이야" --trace
./target/release/gg -e "요이~ 어엄 줴줴이야" --error-style plain

# Syntax check only / inline eval / text -> .gg encoder
./target/release/gg examples/sort.gg --check
./target/release/gg -e "요이~ 예? 예? 지랄 야~~르 줴줴이야" --stdin "15 27"
./target/release/gg --encode "Hello!"

# Compile .gg -> standalone JavaScript (.mjs) or ISO C11 (.c)
./target/release/gg examples/rpn_calc.gg --emit js -o /tmp/rpn.mjs && printf "3 4 + 2 * 7 -" | node /tmp/rpn.mjs
./target/release/gg examples/sort.gg --emit c -o /tmp/sort.c && cc -std=c11 -O2 /tmp/sort.c -o /tmp/sort
printf "5\n5 3 -2 9 0" | /tmp/sort
```

### 2. Rust Crate API (`gg-core`)

```rust
use gg_core::{EmitOptions, EmitTarget, VMOptions, compile_to_target, run};

let state = run(
    "요이~ 예? 예? 지랄 야~~르 줴줴이야",
    VMOptions {
        stdin: Some("15 27".to_string()),
        ..Default::default()
    },
);
println!("{}", state.output); // "42\n"

let c_res = compile_to_target("요이~ 엄..... 야~~르 줴줴이야", EmitTarget::C, EmitOptions::default());
println!("{}", c_res.code);
```

### 3. Build WASM Engine, Run Tests & Static Web Playground

Requires Node.js 20+, `rustup target add wasm32-unknown-unknown`, and `wasm-bindgen-cli 0.2.130`:

```bash
npm install
cargo test --workspace   # Rust unit, 34 conformance vectors & 16 examples across VM/JS/C11
npm run build:wasm       # Build crates/gg-wasm -> src/lib/wasm-pkg/
npm test                 # svelte-kit sync + Vitest (WASM browser bridge + VS Code grammar)
npm run typecheck        # svelte-check + tsconfig.node.json
npm run build            # Full typecheck + static site output to dist/
```

---

## Syntax Summary (v1.2)

Whitespace (` `, `\t`, `\v`, `\f`, `\u00A0`, `\u3000`, newlines) separates tokens; `//` starts a single-line comment. Two-word commands (`아 예?`, `넌 나가라`, `넌 나가라!`) must remain on the same line.

| Category | Keyword / Pattern | Stack Effect | Description |
| --- | --- | --- | --- |
| **Boundaries** | `요이~` | - | Program start (required once as first token) |
| | `줴줴이야` | - | Program halt (required at end; early halt allowed) |
| **Integers** | `^(어*)엄([.,]*)$` | `→ n` | `.` = `+1`, `,` = `-1`, each `어` scales by `× 10^k` (`MAX_EXPONENT = 1000`) |
| **Input** | `예?` | `→ int` | Read whitespace-delimited `BigInt` from `stdin` |
| | `아 예?` | `→ cp` | Read one Unicode code point from `stdin` (`-1` on EOF) |
| **Output** | `야~르` / `야~~르` / `야~르!` | `n →` | Print int / int + `\n` / Unicode character |
| **Arithmetic**<br>*(alias `지~롤`)* | `지랄`, `지~랄`, `지~~랄`, `지~~~랄`, `지~~~~랄` | `a b → a op b` | `+`, `-`, `*`, truncating `/`, `%` (`0` divisor triggers runtime error) |
| **Compare**<br>*(alias `지~롤?`)* | `지랄?`, `지~랄?`, `지~~랄?` | `a b → 0\|1` | `==`, `<`, `>` |
| **Stack** | `쥐랄`, `쥐~랄`, `쥐~~랄`, `쥐~~~랄`, `쥐~~~~랄` | various | `DUP`, `SWAP`, `OVER`, `ROT`, `DEPTH` |
| **Heap Memory** | `쥐랄!` / `쥐~랄!` | `val addr →` / `addr → val` | `STORE` / `LOAD` (`BigInt` keys, defaults to `0`) |
| **Logic & Control** | `아뇨` | `a → !a` | Logical `NOT` |
| | `아뇨아뇨?` / `아뇨아뇨` / `아뇨아뇨!` | `cond →` | `IF` / `ELSE` / `END` |
| | `아뇨아뇨~` ... `아뇨아뇨!` | *(peek)* | `WHILE` loop (peeks stack top without popping) |
| | `아뇨아뇨아뇨` / `넌 나가라!` | - | `CONTINUE` / `BREAK` nearest `WHILE` |
| | `넌 나가라` | `a →` | `POP` top value |

Detailed formal rules live in [`DESIGN.md`](DESIGN.md).

---

## Examples, Conformance Suite & Editor Support

- **16 Executable Examples ([`examples/README.md`](examples/README.md))**: `hello`, `hangul`, `add`, `countdown`, `fibonacci`, `truth_machine`, `factorial`, `gcd`, `is_prime`, `gugudan`, `sort`, `reverse`, `99bottles`, `palindrome`, `caesar_cipher`, and `rpn_calc`.
- **Language-Agnostic Conformance Suite ([`spec/conformance.json`](spec/conformance.json))**: JSON specification vectors covering lexer, parser, BigInt VM, and error codes (`spec/README.md` documents the schema).
- **VS Code Extension ([`editors/vscode/`](editors/vscode/))**: TextMate syntax highlighting (including invalid number highlighting) and snippets for `.gg` files.

---

## License & Contributors

- Licensed under the [MIT License](LICENSE).
- **Contributors**:
  - **[투명고양이](https://chzzk.naver.com/39beba96a36c6a595cedb1bf2b769c7e)** ([@clearcat99](https://github.com/clearcat99) · Chzzk Coding Stream) — Advised on the `야~르` output keyword redesign
