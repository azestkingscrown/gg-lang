# gg-esolang (줴줴랭)

> **줴줴랭 (JjeJje / .gg)** — 100% Rust core & native CLI launcher via npm / npx.

Official fast, dependency-free wrapper for the `gg` native CLI executable.

## Instant Run (No installation required)

```bash
# Run a .gg script directly with npx
npx gg-esolang script.gg

# Check version
npx gg-esolang --version

# Interactive REPL
npx gg-esolang

# Explain source execution step-by-step
npx gg-esolang --explain script.gg
```

## Global Installation (Optional)

```bash
npm install -g gg-esolang

# Run directly
gg script.gg
# or
gg-esolang script.gg
```

## Features

- **Zero npm dependencies**: Fast bootstrap with automatic native binary download and caching.
- **Strict Integrity Verification**: Releases are verified using SHA-256 before extraction.
- **Native Performance**: 100% Rust core (AST-walking interpreter, byte-exact Hangul/UTF-8 indexing, deterministic cycle limits).
- **Supported Platforms**:
  - Linux x86_64 (`linux-x64`)
  - Linux aarch64 (`linux-arm64`)
  - macOS Apple Silicon (`darwin-arm64`)
  - Windows x86_64 (`win32-x64`)

## Documentation & Repository

- **GitHub**: [https://github.com/azestkingscrown/gg-lang](https://github.com/azestkingscrown/gg-lang)
- **Web Playground**: [https://azestkingscrown.github.io/gg-lang/](https://azestkingscrown.github.io/gg-lang/)
- **Specification**: See [spec/SPEC.md](https://github.com/azestkingscrown/gg-lang/blob/main/spec/SPEC.md)

## License

MIT © azestkingscrown
