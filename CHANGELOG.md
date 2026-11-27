# Changelog

All notable changes to `gg-lang` (줴줴랭) are documented in this file.

## [v1.2] - 2026-11-27

### Added
- **정식 CLI 패키지(`bin`/`exports`), 대화형 REPL & 실행 트레이스**:
  - [`package.json`](package.json) `bin`(`gg`, `gg-lang`), `exports`, `tsconfig.pkg.json`, `npm run build:pkg` 빌드 파이프라인 추가
  - [`src/repl.ts`](src/repl.ts): 스택·힙 상태를 유지하고 여러 줄 블록 이어쓰기와 메타 명령(`:stack`, `:mem`, `:reset`, `:trace`, `:help`, `:q`)을 지원하는 대화형 REPL 구현 (`allowFragment` 조각 파싱 및 `isIncompleteFragment` 지원)
  - [`src/cli.ts`](src/cli.ts) & [`src/cli-format.ts`](src/cli-format.ts): `repl`, `run`, `--trace`, `--error-style <meme|plain>`, `-v/--version` 추가 (`JjeJjeVM` `onTrace` 훅 연동)
- **JavaScript / ISO C11 컴파일러 (`--emit js|c`) & 플레이그라운드 `COMPILE` 탭**:
  - [`src/core/codegen.ts`](src/core/codegen.ts): 브라우저 호환 순수 TS 코드 생성기(`emitJavaScript`, `emitC`, `compileToTarget`) 추가 — 임의 정밀도 `BigInt` JS 출력 및 `cc -std=c11 -O2 -Wall -Wextra -Werror` 무경고 C11 출력 지원
  - CLI `--emit <js|c>`, `-o/--output` 옵션 및 웹 플레이그라운드 [`InspectorTabs.svelte`](src/lib/components/InspectorTabs.svelte) 내 `COMPILE (JS / C)` 탭(복사·다운로드·경고 표시) 추가
- **대표 알고리즘 · 문자열 예제 10종 확충 (6종 → 16종)**:
  - `truth_machine.gg`, `factorial.gg`, `gcd.gg`, `is_prime.gg`, `gugudan.gg`, `99bottles.gg`, `palindrome.gg`, `caesar_cipher.gg`, `sort.gg`, `rpn_calc.gg` 및 [`examples/README.md`](examples/README.md) 추가
  - [`TopBar.svelte`](src/lib/components/TopBar.svelte) 예제 드롭다운을 `기초` / `알고리즘` / `문자열 · 파서` / `진단` `<optgroup>`으로 분류
- **공식 설계 명세 & 언어 중립 적합성 테스트 규격**:
  - [`DESIGN.md`](DESIGN.md), [`README_EN.md`](README_EN.md), [`spec/README.md`](spec/README.md), [`spec/conformance.json`](spec/conformance.json) (34개 어휘·파서·VM 테스트 벡터) 및 [`src/__tests__/conformance.test.ts`](src/__tests__/conformance.test.ts) 추가
- **VS Code 구문 강조 및 스니펫 확장**:
  - [`editors/vscode/`](editors/vscode/) (`package.json`, `language-configuration.json`, `gg.tmLanguage.json`, `gg.code-snippets`, `README.md`) 및 정규식 검증 테스트([`src/__tests__/vscode-ext.test.ts`](src/__tests__/vscode-ext.test.ts)) 추가

### Changed
- 패키지 버전(`1.2.0`), 웹 플레이그라운드 헤더(`v1.2`), [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)(`build:pkg` CI 검증 단계 추가), [`README.md`](README.md) 문서를 v1.2 기준으로 갱신했습니다.

## [v1.1] - 2026-11-26

### Changed
- **출력 키워드 개편**: 기존 출력 키워드를 **`야~르` / `야~~르` / `야~르!`** 로 전면 교체했습니다.
  - 코어 렉서([`src/core/lexer.ts`](src/core/lexer.ts)) 토큰 매핑 및 오타 힌트 반영
  - 트랜스파일러([`src/core/transpiler.ts`](src/core/transpiler.ts)), CLI([`src/cli.ts`](src/cli.ts)), 예제 6종([`examples/`](examples/)), 웹 팔레트/치트시트, 테스트 및 [`README.md`](README.md) 일괄 업데이트
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
