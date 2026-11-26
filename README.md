# 줴줴랭 (`gg-lang` / `.gg`)

> **웹 플레이그라운드 바로 사용하기:** https://azestkingscrown.github.io/gg-lang/

**"예? 엄 아뇨아뇨 줴줴이야"** 밈 8종 세트에서 탄생한 **스택 기반 난해한 프로그래밍 언어(Esolang)** 와 **SvelteKit 웹 플레이그라운드**입니다.

- **파일 확장자**: `.gg`
- **실행 모델**: `BigInt` 정수 스택 + `Map<bigint, bigint>` 힙 메모리를 갖춘 스택 가상 머신(VM)
- **엄격한 문법 검사**: 미등록 키워드·오타·짝이 맞지 않는 블록을 실행 전에 모두 수집하여 밈 말투 진단 메시지로 알려줍니다. (`//` 한 줄 주석 지원)
- **웹 플레이그라운드**: SvelteKit 3 + Svelte 5 (Runes) + 웜 다크 터미널 스타일 UI, Web Worker 비동기 실행/중지, 스텝 디버거, 실시간 문법 검사, 스택/메모리 인스펙터, `localStorage` 자동 저장, URL 공유 링크(`#code=...`), 문자열 → `.gg` 변환기를 제공합니다.

---

## 빠른 시작

### 웹 플레이그라운드 실행
```bash
npm install
npm run dev
```

#### Tailscale 환경에서 안전하게 접속하기
[`vite.config.ts`](vite.config.ts)는 DNS Rebinding 방어를 위해 기본적으로 `.ts.net`(MagicDNS) 도메인과 IP 리터럴만 허용합니다.

1. **Tailscale IP에만 바인딩해서 실행 (권장)**
   ```bash
   VITE_HOST=$(tailscale ip -4) npm run dev
   ```
   필요 시 추가 호스트를 허용하려면 `VITE_ALLOWED_HOSTS=my-host.example.com`을 함께 지정하세요.
2. **Tailscale Serve로 HTTPS 프록시 사용 (클립보드 API 포함 완전 지원)**
   ```bash
   npm run dev -- --host 127.0.0.1
   tailscale serve --bg 5173
   ```

프로덕션 타입체크 & 정적 빌드:
```bash
npm run build
npm run preview
```

### GitHub Pages 자동 배포
`main` 브랜치에 push하면 [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) 워크플로우가 `npm ci` → `npm test` → `BASE_PATH=/gg-lang npm run build`를 실행해 `dist/`를 GitHub Pages로 자동 배포합니다.

### CLI 인터프리터 실행
```bash
npm run gg -- examples/hello.gg
printf "12 30" | npm run gg -- examples/add.gg
printf "줴줴🔥ABC" | npm run gg -- examples/reverse.gg
npm run gg -- -e "요이~ 예? 예? 지랄 야~~르 줴줴이야" --stdin "15 27"
npm run gg -- examples/fibonacci.gg --check
```

문자열 → `.gg` 코드 변환:
```bash
npm run gg -- --encode "안녕, 줴줴!"
printf "파이프 입력" | npm run gg -- --encode
```

주요 CLI 옵션:
- `--check`: 실행 없이 문법 검사만 수행
- `--max-steps <N>`: 최대 실행 스텝 수 지정
- `--stdin <텍스트>`: 파이프 대신 표준 입력 문자열 직접 지정
- `-e, --eval <코드>`: 인라인 `.gg` 코드 실행
- `--encode [텍스트]`: 문자열(또는 `stdin`)을 `.gg` 코드로 변환

### 테스트 & 취약점 검사
```bash
npm test
npm run typecheck
npm audit
```

---

## 정식 문법 명세 (v1.1)

### 1. 어휘 & 주석 규칙
- 모든 명령은 공백(` `, `\t`, `\r`, `\n`, `\u00A0`, `\u3000`)으로 구분하며, 파일 선두 UTF-8 BOM(`\uFEFF`)은 자동으로 무시합니다.
- `//`부터 줄 끝까지는 **한 줄 주석**으로 무시됩니다(토큰에 바로 붙여 써도 주석으로 분리됨: `엄...//주석`).
- 등록된 키워드가 아닌 단어는 **즉시 문법 에러**로 처리되며, 자주 틀리는 오타에는 교정 힌트를 제공합니다.
- 2단어 키워드(`아 예?`, `넌 나가라`, `넌 나가라!`)는 **반드시 같은 줄**에 연속으로 써야 합니다.

---

### 2. 8종 키워드 전체 표

| 카테고리 | 키워드 / 변형 | 스택 변화 / 동작 | 설명 |
| :--- | :--- | :--- | :--- |
| **시작 / 종료** | `요이~` | 프로그램 시작 | 첫 번째 토큰은 반드시 `요이~` (1회만 사용 가능) |
| | `줴줴이야` | 프로그램 종료 | 마지막 토큰은 반드시 `줴줴이야` (중간 조기 종료도 가능) |
| **정수 리터럴** | `^(어*)엄([.,]*)$` | `→ n` | `.`은 `+1`, `,`은 `-1`, 앞의 `어` 개수 `k`만큼 `× 10^k` (`엄`=`0`, `엄...`=`3`, `엄,,`=`-2`, `어엄.`=`10`, `어어엄....`=`400`, `k` 최대 `1000`) |
| **표준 입력** | `예?` | `→ int` | `stdin`에서 공백으로 구분된 정수(`BigInt`, 최대 20,000자리) 1개를 읽어 push |
| | `아 예?` | `→ codepoint` | `stdin`에서 유니코드 문자 1글자를 읽어 코드포인트로 push (EOF 시 `-1`) |
| **표준 출력** | `야~르` | `n →` | 스택 top을 정수로 pop 후 출력 (개행 없음) |
| | `야~~르` | `n →` | 스택 top을 정수로 pop 후 줄바꿈(`\n`)과 함께 출력 |
| | `야~르!` | `cp →` | 스택 top을 유니코드 문자로 pop 후 출력 |
| **산술 연산**<br>*(순화 별칭 `지~롤` 동일)* | `지랄` / `지롤` | `a b → (a + b)` | 덧셈 |
| | `지~랄` / `지~롤` | `a b → (a - b)` | 뺄셈 |
| | `지~~랄` / `지~~롤` | `a b → (a * b)` | 곱셈 |
| | `지~~~랄` / `지~~~롤` | `a b → (a / b)` | 정수 나눗셈 (0 방향 절사: `-7 / 2 = -3`, `b=0`이면 런타임 에러) |
| | `지~~~~랄` / `지~~~~롤` | `a b → (a % b)` | 나머지 연산 (`-7 % 2 = -1`, `b=0`이면 런타임 에러) |
| **비교 연산**<br>*(순화 별칭 `지~롤?` 동일)* | `지랄?` / `지롤?` | `a b → (a == b)` | 같으면 `1`, 아니면 `0` |
| | `지~랄?` / `지~롤?` | `a b → (a < b)` | 작으면 `1`, 아니면 `0` |
| | `지~~랄?` / `지~~롤?` | `a b → (a > b)` | 크면 `1`, 아니면 `0` |
| **스택 조작** | `쥐랄` | `a → a a` | `DUP`: top 복제 |
| | `쥐~랄` | `a b → b a` | `SWAP`: 상위 2개 교환 |
| | `쥐~~랄` | `a b → a b a` | `OVER`: 두 번째 값 복제해 push |
| | `쥐~~~랄` | `a b c → b c a` | `ROT`: 상위 3개 회전 |
| | `쥐~~~~랄` | `→ len` | `DEPTH`: 현재 스택 크기 push |
| **메모리 (Heap)** | `쥐랄!` | `val addr →` | `STORE`: `memory[addr] = val` 저장 (음수 주소 지원) |
| | `쥐~랄!` | `addr → val` | `LOAD`: `memory[addr]` 로드 (미초기화 주소는 `0`) |
| **논리 & 제어 흐름** | `아뇨` | `a → !a` | `NOT`: `0`이면 `1`, `0`이 아니면 `0` |
| | `아뇨아뇨?` | `cond →` | `IF`: `cond == 0`이면 `아뇨아뇨`(ELSE) 또는 `아뇨아뇨!`(END)로 점프 |
| | `아뇨아뇨` | - | `ELSE`: 직전 `IF`의 거짓 분기 시작 |
| | `아뇨아뇨~` | *(peek)* | `WHILE`: top을 **pop하지 않고** 확인, `0`이면 `아뇨아뇨!` 다음으로 탈출 |
| | `아뇨아뇨!` | - | `END`: 가장 가까운 `IF` 또는 `WHILE` 블록 닫기 |
| | `아뇨아뇨아뇨` | - | `CONTINUE`: 가장 가까운 `WHILE` 시작으로 점프 |
| **버리기 / 탈출** | `넌 나가라` | `a →` | `POP`: 스택 top 버리기 |
| | `넌 나가라!` | - | `BREAK`: 가장 가까운 `WHILE` 루프 즉시 탈출 |

### 3. `엄` 숫자 리터럴 제약 및 VM 기본 안전 제한
- `.`과 `,`를 한 토큰에 섞어 쓸 수 없습니다. (`엄.,` → 문법 에러)
- `어`가 1개 이상 붙은 경우 뒤에 `.` 또는 `,`가 반드시 하나 이상 와야 합니다. (`어엄` → 문법 에러)
- VM 기본 제한치(`VMOptions`로 조정 가능):
  - `maxSteps`: `200,000`
  - `maxStackSize`: `100,000`
  - `maxMemorySize`: `100,000`
  - `maxBigIntBits`: `65,536` 비트
  - `maxOutputLength`: `1,000,000` 자
- 런타임 에러가 발생하면 모든 오류 메시지에 `"터져서 없어짐 수고하세요"`가 포함됩니다.

---

## 프로젝트 구조

```text
vite.config.ts      # Vite + SvelteKit 3 통합 설정 & Tailscale 허용 호스트
tsconfig.json       # SvelteKit/코어/웹 TypeScript 설정
tsconfig.node.json  # CLI/테스트/설정용 Node TypeScript 설정
static/
  favicon.svg       # .gg 모노그램 파비콘
src/
  app.html          # SvelteKit HTML 템플릿 (IBM Plex Mono)
  app.css           # 웜 다크 터미널 스타일 디자인 시스템
  core/
    types.ts        # 토큰/진단/명령어/VM 상태 타입
    lexer.ts        # 토크나이저, 지수 상한, 오타 힌트 진단
    parser.ts       # 블록 검증 & 바이트코드 컴파일러
    vm.ts           # BigInt 스택 & 메모리 가상 머신 (step/run)
    transpiler.ts   # 임의 문자열 -> .gg 코드 변환기
    index.ts        # 공용 API (compile, analyze, createVM, run, textToGG)
  lib/
    examples.ts     # examples/*.gg raw import 기반 예제 7종
    worker.ts       # 비동기 실행용 Web Worker
    utils.ts        # 팔레트, 클립보드 폴백, 공유 링크 인코더
    components/     # Svelte 5 Runes UI 컴포넌트 7종
  routes/
    +layout.ts      # 정적 프리렌더링 / SPA 설정 (prerender=true, ssr=false)
    +layout.svelte  # 전역 스타일 & 1px 에디토리얼 프레임
    +page.svelte    # 플레이그라운드 상태 오케스트레이션
  cli.ts            # .gg 파일 실행, --check, -e/--eval, --encode CLI
  __tests__/        # Vitest 단위/통합/CLI/예제 테스트 스위트
examples/           # .gg 예제 파일 6종
```
