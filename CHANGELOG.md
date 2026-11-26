# Changelog

All notable changes to `gg-lang` (줴줴랭) are documented in this file.

## [v1.1] - 2026-11-26

### Changed
- **출력 키워드 개편**: 기존 `티~원` / `티~~원` / `티~원!` 출력 키워드를 **`야~르` / `야~~르` / `야~르!`** 로 전면 교체했습니다.
  - 코어 렉서([`src/core/lexer.ts`](src/core/lexer.ts)) 토큰 매핑 및 오타 힌트 반영
  - 트랜스파일러([`src/core/transpiler.ts`](src/core/transpiler.ts)), CLI([`src/cli.ts`](src/cli.ts)), 예제 6종([`examples/`](examples/)), 웹 팔레트/치트시트, 테스트 및 [`README.md`](README.md) 일괄 업데이트
- **버전 표기 업데이트**: 패키지 버전(`1.1.0`), 웹 플레이그라운드 헤더 및 문법 명세 버전을 `v1.1`로 갱신했습니다.

### Added / Fixed
- **라이선스 및 문서 정리**: MIT [`LICENSE`](LICENSE) 파일을 추가하고 문서 내 타사 브랜드 언급을 제거했습니다.
- **CI/CD 빌드 안정화**: `tsconfig.json`이 SvelteKit 3 내장 `$app/tsconfig`를 상속하도록 수정하고 `npm test` 실행 전 `svelte-kit sync`를 수행해 클린 CI 환경 테스트·빌드를 안정화했습니다.

## [v1.0] - 2026-11-25

### Added
- **줴줴랭 (`.gg`) 코어 인터프리터 & CLI**:
  - `BigInt` 스택 + 힙 메모리 가상 머신(`JjeJjeVM`), DoS/보안 가드(`maxBigIntBits`, `maxOutputLength`, `Object.prototype` 키 우회 차단), 엄격한 정적 문법 진단, `"터져서 없어짐 수고하세요"` 런타임 에러 메시지
  - 비동기 파이프 `stdin`, `--check`, `-e/--eval`, `--max-steps`, `--stdin`, `--encode` 지원 CLI
- **SvelteKit 3 + Svelte 5 웹 플레이그라운드**:
  - 웜 다크 터미널 스타일 UI, Web Worker 비동기 실행/중지, 스텝/자동 재생 디버거, 스택·힙 메모리 인스펙터, 문자열→`.gg` 변환기, `.gg` 파일 열기/드롭/저장, `localStorage` 자동 저장, `#code=...` URL 공유 링크
  - GitHub Pages 정적 배포 파이프라인 구성 (`https://azestkingscrown.github.io/gg-lang/`)
