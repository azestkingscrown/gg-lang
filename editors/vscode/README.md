# 줴줴랭 (`gg-lang`) VS Code Extension

`.gg` / `.GG` 소스 파일을 위한 **구문 강조(TextMate)**, **코드 접기/들여쓰기 규칙**, 그리고 **코드 스니펫**을 제공합니다.

## 지원 기능
- `//` 한 줄 주석 (토큰에 바로 붙은 주석 포함)
- `요이~` / `줴줴이야` 프로그램 경계 및 제어 흐름(`아뇨`, `아뇨아뇨?`, `아뇨아뇨`, `아뇨아뇨~`, `아뇨아뇨!`, `아뇨아뇨아뇨`, `넌 나가라`, `넌 나가라!`) 강조
- 입출력(`예?`, `아 예?`, `야~르`, `야~~르`, `야~르!`), 산술/비교(`지~랄` 및 순화 별칭 `지~롤`), 스택/힙 메모리(`쥐~랄`, `쥐랄!`, `쥐~랄!`) 강조
- `^(어*)엄([.,]*)$` 정수 리터럴 강조 및 잘못된 토큰(`엄.,`, `어엄`, `지~~~~~랄` 등) `invalid.illegal.gg` 경고 표시
- `gg-init`, `gg-if`, `gg-ifelse`, `gg-while`, `gg-print`, `gg-println`, `gg-store`, `gg-load` 등 스니펫 제공

## 로컬 설치 방법

### 1) 심볼릭 링크로 바로 연결
```bash
ln -s "$(pwd)" ~/.vscode/extensions/gg-lang-vscode
```
VS Code 창에서 `Developer: Reload Window` 실행 후 `.gg` 파일을 열면 자동 적용됩니다.

### 2) `.vsix` 패키지로 빌드
```bash
npx --yes @vscode/vsce package
code --install-extension gg-lang-vscode-1.2.0.vsix
```
