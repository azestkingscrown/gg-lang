# Changelog

All notable changes to `gg-lang` (줴줴랭) are documented in this file.

## [v1.2] - 2026-11-27

### Added
- **100% Rust 코어 & 네이티브 CLI / WebAssembly 엔진 전환**:
  - [`Cargo.toml`](Cargo.toml) 워크스페이스 및 크레이트 3종([`crates/gg-core/`](crates/gg-core/), [`crates/gg-cli/`](crates/gg-cli/), [`crates/gg-wasm/`](crates/gg-wasm/)) 신설
  - `crates/gg-core`: 렉서(UTF-16 열 좌표, BOM/`//` 주석, 오타 힌트), 파서(REPL 조각 모드 포함), 임의 정밀도 `BigInt`(`num-bigint`) 스택 + `BTreeMap` 힙 `JjeJjeVM`, 문자열 트랜스파일러, JavaScript/ISO C11 코드 생성기 구현
  - `crates/gg-cli`: 네이티브 `gg` 바이너리 — 파일 실행, `run`, 파이프 `stdin`, `--check`, 대화형 `repl`(`:stack`, `:mem`, `:reset`, `:trace`, `:q`, 멀티라인 이어쓰기), `--trace`, `--error-style <meme|plain>`, `--emit js|c`, `--encode`, `-v/--version`
  - `crates/gg-wasm` & [`src/lib/engine.ts`](src/lib/engine.ts): `wasm32-unknown-unknown` + `wasm-bindgen 0.2.130` 기반 브라우저 WASM 엔진 브리지(`SteppingVM`, Web Worker 비동기 실행, 실시간 문법 검사, JS/C 컴파일 탭, 문자열 변환기 연동) 및 [`src/__tests__/wasm-engine.test.ts`](src/__tests__/wasm-engine.test.ts) 검증 추가
- **JavaScript / ISO C11 컴파일러 (`--emit js|c`) & 플레이그라운드 `COMPILE` 탭**:
  - 임의 정밀도 `BigInt` 기반 독립 실행 JS(`.mjs`) 및 `cc -std=c11 -O2 -Wall -Wextra -Werror` 무경고 ISO C11(`.c`) 코드 생성 지원
  - 웹 플레이그라운드 [`InspectorTabs.svelte`](src/lib/components/InspectorTabs.svelte) 내 `COMPILE (JS / C)` 탭(복사·다운로드·경고 표시) 추가
- **대표 알고리즘 · 문자열 예제 10종 확충 (6종 → 16종)**:
  - `truth_machine.gg`, `factorial.gg`, `gcd.gg`, `is_prime.gg`, `gugudan.gg`, `99bottles.gg`, `palindrome.gg`, `caesar_cipher.gg`, `sort.gg`, `rpn_calc.gg` 및 [`examples/README.md`](examples/README.md) 추가
  - [`TopBar.svelte`](src/lib/components/TopBar.svelte) 예제 드롭다운을 `기초` / `알고리즘` / `문자열 · 파서` / `진단` `<optgroup>`으로 분류
- **공식 설계 명세 & 언어 중립 적합성 테스트 규격**:
  - [`DESIGN.md`](DESIGN.md), [`README_EN.md`](README_EN.md), [`spec/README.md`](spec/README.md), [`spec/conformance.json`](spec/conformance.json) (34개 어휘·파서·VM 테스트 벡터) 및 [`crates/gg-core/tests/conformance_tests.rs`](crates/gg-core/tests/conformance_tests.rs) 추가
- **VS Code 구문 강조 및 스니펫 확장**:
  - [`editors/vscode/`](editors/vscode/) (`package.json`, `language-configuration.json`, `gg.tmLanguage.json`, `gg.code-snippets`, `README.md`) 및 정규식 검증 테스트([`src/__tests__/vscode-ext.test.ts`](src/__tests__/vscode-ext.test.ts)) 추가

### Changed / Removed / Fixed
- 기존 TypeScript 코어(`src/core/`), Node CLI(`src/cli*.ts`, `src/repl.ts`, `tsconfig.pkg.json`), 구 TS 테스트(`src/__tests__/{lexer,parser,vm,transpiler,cli,repl,codegen,conformance,examples}.test.ts`)를 제거하고 단일 Rust/WASM 코어로 통합했습니다.
- 패키지 버전(`1.2.0`), 웹 플레이그라운드 헤더(`v1.2 // RUST + WASM`), [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)(Rust `wasm32-unknown-unknown` + `wasm-bindgen 0.2.130` + Vitest + SvelteKit 정적 빌드 CI + PR 검증), [`README.md`](README.md) 문서를 v1.2 기준으로 갱신했습니다.
- 전환 후 정밀 점검 반영: C11 `gg_read_int` 공백 `ungetc` 보존·`NUL` 바이트 출력 보존·0 상한 `-Werror=type-limits` 제거, `TokenType::GT` `"GT"` 직렬화, REPL `--stdin` 커서 유지·멀티라인 메타 명령·`rustyline` TTY 편집, WASM release LTO/단일 URL 번들 및 UI 엣지 케이스를 보완했습니다.

## [v1.1] - 2026-11-26

### Changed
- **출력 키워드 개편**: 기존 출력 키워드를 **`야~르` / `야~~르` / `야~르!`** 로 전면 교체했습니다.
  - 코어 렉서(`lexer`) 토큰 매핑 및 오타 힌트 반영
  - 트랜스파일러(`transpiler`), CLI(`cli`), 예제 6종([`examples/`](examples/)), 웹 팔레트/치트시트, 테스트 및 [`README.md`](README.md) 일괄 업데이트
- **버전 표기 업데이트**: 패키지 버전(`1.1.0`), 웹 플레이그라운드 헤더 및 문법 명세 버전을 `v1.1`로 갱신했습니다.

### Added / Fixed
- **라이선스 및 문서 정리**: MIT [`LICENSE`](LICENSE) 파일을 추가하고 문서 내 타사 브랜드 언급을 제거했습니다.
- **CI/CD 빌드 안정화**: `tsconfig.json`이 SvelteKit 3 내장 `$app/tsconfig`를 상속하도록 수정하고 `npm test` 실행 전 `svelte-kit sync`를 수행해 클린 CI 환경 테스트·빌드를 안정화했습니다.

### Contributors
- **[투명고양이](https://chzzk.naver.com/39beba96a36c6a595cedb1bf2b769c7e)** ([@clearcat99](https://github.com/clearcat99) · 치지직 코딩 방송) — 출력 키워드(`야~르`) 개편 조언

## [v1.0] - 2026-11-25

### Added
- **줴줴랭 (`.gg`) 코어 인터프리터 & CLI**:
  - `BigInt` 스택 + 힙 메모리 가상 머신(`JjeJjeVM`), DoS/보안 가드(`maxBigIntBits`, `maxOutputLength`, `Object.prototype` 키 우회 차단), 엄격한 정적 문법 진단, `"터져서 없어짐 수고하세요"` 런타임 에러 메시지
  - 비동기 파이프 `stdin`, `--check`, `-e/--eval`, `--max-steps`, `--stdin`, `--encode` 지원 CLI
- **SvelteKit 3 + Svelte 5 웹 플레이그라운드**:
  - 웜 다크 터미널 스타일 UI, Web Worker 비동기 실행/중지, 스텝/자동 재생 디버거, 스택·힙 메모리 인스펙터, 문자열→`.gg` 변환기, `.gg` 파일 열기/드롭/저장, `localStorage` 자동 저장, `#code=...` URL 공유 링크
  - GitHub Pages 정적 배포 파이프라인 구성 (`https://azestkingscrown.github.io/gg-lang/`)
