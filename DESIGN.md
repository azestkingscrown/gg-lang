# 줴줴랭 (`gg-lang`) 설계 및 형식 명세 (`DESIGN.md`)

이 문서는 **줴줴랭 (JjeJje / `.gg`)**의 언어 설계 배경, 어휘·구문 규칙, 가상 머신(VM) 실행 의미론, 그리고 JavaScript/C11 컴파일러 타깃 사양을 기술합니다.

---

## 1. 설계 철학

1. **8종 밈 세트의 1:1 직관적 대응**
   - `요이~` · `줴줴이야`(경계), `엄`(정수 리터럴), `예?`/`아 예?`(입력), `야~르`(출력), `지~랄`/`지~롤`(산술·비교), `쥐~랄`(스택·힙 메모리), `아뇨아뇨`(논리·제어 흐름), `넌 나가라`(pop·break) 여덟 축으로 튜링 완전한 언어를 구성합니다.
2. **스택 + 힙 + 구조적 제어 흐름**
   - 줄 번호 `goto` 대신 스택 기반 연산과 짝이 맞는 구조적 블록(`IF`/`ELSE`/`WHILE`/`BREAK`/`CONTINUE`)을 채택하여 코드 삽입·들여쓰기에 강하며 실행 추적이 명확합니다.
   - 보조 저장소로 `BigInt → BigInt` 키-값 힙 메모리를 두어 배열·문자열 버퍼·알고리즘 상태 관리를 지원합니다.
3. **엄격한 정적 검사 및 오타 교정**
   - 미등록 단어를 주석으로 조용히 무시하지 않고 즉시 문법 에러로 보고하며, 자주 틀리는 오타(`아예?`, `넌나가라`, `야르`, `어엄` 등)에는 교정 힌트를 제공합니다.
4. **안전한 실행 모델**
   - 브라우저 플레이그라운드 및 CLI 환경에서의 DoS를 방지하기 위해 스텝 수·스택 깊이·힙 크기·정수 비트 폭·출력 길이 상한을 기본 내장합니다.

---

## 2. 어휘 규칙 (Lexical Specification)

### 2.1 인코딩 및 전처리
- 소스 텍스트는 UTF-8로 해석하며, 파일 맨 앞의 UTF-8 BOM(`\uFEFF`)은 무시합니다. (이후 위치 계산 시 1번째 줄 1열부터 시작)
- 줄 끝 시퀀스 `\r\n`, `\n`, `\r`은 모두 동일한 줄바꿈(줄 +1, 열 1)으로 처리합니다.

### 2.2 공백 및 주석
- **수평 공백 구분자**: `' '` (U+0020), `'\t'` (U+0009), `'\v'` (U+000B), `'\f'` (U+000C), `'\u00A0'` (NBSP), `'\u3000'` (전각 공백).
- **한 줄 주석**: `//`가 등장하면 같은 줄의 끝까지 무시합니다. 공백 없이 토큰 바로 뒤에 붙여 써도 주석으로 분리됩니다 (예: `엄...//주석` → `엄...`).

### 2.3 2단어 키워드
- `아 예?`, `넌 나가라`, `넌 나가라!`는 **반드시 같은 줄에 연속된 두 단어**로 나타나야 합니다.
- 줄바꿈을 사이에 두거나 첫/둘째 단어만 단독으로 쓰면 렉서 오류가 발생합니다.

### 2.4 정수 리터럴 (`PUSH`)
- 정규식: `/^(어*)엄([.,]*)$/`
- 값 계산:
  $$\text{value} = (\text{sign} \times |marks|) \times 10^{k}$$
  - $k$: 앞의 `어` 개수 ($0 \le k \le 1000$, `MAX_EXPONENT = 1000`)
  - `.`만 사용 시 $\text{sign} = +1$, `,`만 사용 시 $\text{sign} = -1$, 비어 있으면 $0$
- 제약:
  1. `.`과 `,` 혼용 금지 → `LEX_MIXED_NUMBER_MARKS`
  2. $k \ge 1$인데 `.`/`,`가 없으면 금지 (`어엄`) → `LEX_MISSING_NUMBER_VALUE`
  3. $k > 1000$ 금지 → `LEX_NUMBER_TOO_LARGE`

### 2.5 연산자·스택·메모리 패턴
- **산술/비교**: `/^지(~*)(?:랄|롤)(\??)$/`
  - `?` 없음: `~` 개수 `0..4` → `ADD`, `SUB`, `MUL`, `DIV`, `MOD` (`~` 5개 이상 → `LEX_TOO_MANY_TILDES`)
  - `?` 있음: `~` 개수 `0..2` → `EQ`, `LT`, `GT` (`~` 3개 이상 → `LEX_TOO_MANY_TILDES`)
  - `랄`과 순화 별칭 `롤`은 100% 동일한 토큰 타입을 생성합니다.
- **스택/메모리**: `/^쥐(~*)랄(!?)$/`
  - `!` 없음: `~` 개수 `0..4` → `DUP`, `SWAP`, `OVER`, `ROT`, `DEPTH` (`~` 5개 이상 → `LEX_INVALID_STACK_OP`)
  - `!` 있음: `~` 개수 `0` → `STORE`(`쥐랄!`), `1` → `LOAD`(`쥐~랄!`), 그 외 → `LEX_INVALID_MEMORY_OP`

### 2.6 고정 키워드 표
| 원문 | 토큰 | 원문 | 토큰 |
| --- | --- | --- | --- |
| `요이~` | `START` | `줴줴이야` | `HALT` |
| `예?` | `INPUT_INT` | `아 예?` | `INPUT_CHAR` |
| `야~르` | `PRINT_INT` | `야~~르` | `PRINT_INT_LN` |
| `야~르!` | `PRINT_CHAR` | `아뇨` | `NOT` |
| `아뇨아뇨?` | `IF` | `아뇨아뇨` | `ELSE` |
| `아뇨아뇨~` | `WHILE` | `아뇨아뇨!` | `END` |
| `아뇨아뇨아뇨` | `CONTINUE` | `넌 나가라` | `POP` |
| `넌 나가라!` | `BREAK` | | |

---

## 3. 구문 분석 및 바이트코드 (Parser & Bytecode)

### 3.1 전체 프로그램 모드 vs 조각(Fragment) 모드
- **표준 프로그램 모드** (`allowFragment: false`):
  - 빈 토큰 열 → `SYNTAX_EMPTY`
  - 첫 토큰이 `START`(`요이~`)가 아님 → `SYNTAX_MISSING_START`
  - 마지막 토큰이 `HALT`(`줴줴이야`)가 아님 → `SYNTAX_MISSING_HALT`
- **REPL 조각 모드** (`allowFragment: true`):
  - 빈 입력 및 `START`/`HALT` 경계 검사를 생략하며, 블록 짝 검사·연산 매핑은 동일하게 수행합니다.

### 3.2 중복/블록 규칙
- 인덱스 `i > 0` 위치의 `요이~` → `SYNTAX_DUPLICATE_START`
- `IF` / `ELSE` / `END`:
  - `ELSE`가 열린 `IF`와 짝을 이루지 않으면 → `SYNTAX_UNEXPECTED_ELSE`
  - 동일 `IF`에 `ELSE`가 2번 나오면 → `SYNTAX_DUPLICATE_ELSE`
  - `END`에 대응하는 열린 블록이 없으면 → `SYNTAX_UNEXPECTED_END`
  - 파일 끝까지 닫히지 않은 블록이 남으면(열린 순서 기준) → `SYNTAX_UNCLOSED_BLOCK`
- `BREAK` / `CONTINUE`: 가장 안쪽의 `WHILE` 블록을 탐색하며, 바깥이면 각각 `SYNTAX_BREAK_OUTSIDE_LOOP`, `SYNTAX_CONTINUE_OUTSIDE_LOOP`.
- 진단이 1개 이상이면 line, column 오름차순으로 정렬하고 빈 명령 배열(`instructions = []`)을 반환합니다.

### 3.3 바이트코드 명령 집합 (27종 `OpCode`)
`PUSH(bigint)`, `POP`, `DUP`, `SWAP`, `OVER`, `ROT`, `DEPTH`, `ADD`, `SUB`, `MUL`, `DIV`, `MOD`, `EQ`, `LT`, `GT`, `NOT`, `STORE`, `LOAD`, `INPUT_INT`, `INPUT_CHAR`, `PRINT_INT`, `PRINT_INT_LN`, `PRINT_CHAR`, `JZ(ip)`, `JZ_PEEK(ip)`, `JMP(ip)`, `HALT`.

---

## 4. VM 실행 의미론 (`JjeJjeVM`)

### 4.1 실행 상태 및 기본 제한
- 상태: `ip` (0부터 시작), `stack: bigint[]`, `memory: Map<bigint, bigint>`, `stdinPos`, `output: string`, `steps: number`, `halted: boolean`, `error: Diagnostic | null`.
- 기본 안전 제한(`VMOptions`):
  - `maxSteps`: `200,000`
  - `maxStackSize`: `100,000`
  - `maxMemorySize`: `100,000`
  - `maxBigIntBits`: `65,536` 비트
  - `maxOutputLength`: `1,000,000` 문자(UTF-16 코드 단위)
  - `MAX_STDIN_INT_DIGITS`: `20,000` 자리

### 4.2 주요 명령 동작 규칙
- **이항 연산(`ADD`, `SUB`, `MUL`, `DIV`, `MOD`, `EQ`, `LT`, `GT`)**: 스택 `[..., a, b]`에서 `a`가 왼쪽 피연산자, `b`가 오른쪽(TOP)입니다.
- **정수 나눗셈·나머지**: JavaScript `BigInt`와 동일하게 **0 방향 절사(truncation toward zero)** 를 사용합니다 (`-7 / 2 = -3`, `-7 % 2 = -1`). `b == 0`이면 `RUNTIME_DIV_ZERO`.
- **메모리 (`STORE` / `LOAD`)**:
  - `STORE`: 스택 `[..., val, addr]` (`addr`이 TOP)를 소비해 `memory.set(addr, val)` 수행. 음수 주소 허용.
  - `LOAD`: TOP `addr`을 소비해 `memory.get(addr) ?? 0n`을 push.
- **제어 흐름**:
  - `JZ target` (`IF`): TOP을 **pop**한 값이 `0n`이면 `ip = target`, 아니면 `ip + 1`.
  - `JZ_PEEK target` (`WHILE`): TOP을 **pop하지 않고** 확인하여 `0n`이면 `ip = target`, 아니면 `ip + 1`.
- **입출력**:
  - `INPUT_INT`: 공백 스킵 후 공백 전까지 한 토큰 읽어 `/^[+-]?\d+$/` 파싱. EOF면 `RUNTIME_STDIN_EOF`, 정수가 아니면 `RUNTIME_INVALID_INT`.
  - `INPUT_CHAR`: 현재 위치의 유니코드 코드포인트 1개를 push (`> 0xFFFF` 서로게이트 쌍은 1글자로 소비). EOF 시 `-1n` push.
  - `PRINT_INT` / `PRINT_INT_LN` / `PRINT_CHAR`: **먼저 출력 길이/유효 코드포인트 검사를 통과한 뒤에만** 스택에서 값을 pop하고 `ip`를 증가시킵니다 (`PRINT_CHAR`는 `0 <= cp <= 0x10FFFF` 및 서로게이트 `0xD800..0xDFFF` 제외).

### 4.3 런타임 에러 계약
- 모든 런타임 오류 메시지는 끝에 `"터져서 없어짐 수고하세요"` 문구를 포함합니다.
- 오류 발생 시 즉시 `halted = true`가 되며, 해당 명령은 스텝 카운터(`steps`)를 증가시키지 않고, 오류 토큰 위치를 `currentLine`/`currentToken`으로 보존합니다.

---

## 5. 컴파일러 타깃 사양 (`--emit js | c`)

| 항목 | JS 타깃 (`.mjs`) | C11 타깃 (`.c`) |
| --- | --- | --- |
| 정수 타입 | `BigInt` (65,536비트 제한 포함 VM 100% 동일) | `int64_t` (부호 있는 64비트, 모든 산술 오버플로 안전 검사) |
| 힙 메모리 | JS `Map<bigint, bigint>` | 오픈 어드레싱 선형 조사 해시 테이블 (`int64_t → int64_t`) |
| UTF-8 입출력 | Node 문자열 `codePointAt` / `fromCodePoint` | ISO C11 `fgetc` / `fwrite` 기반 UTF-8 1~4바이트 코덱 |
| 외부 의존성 | Node 내장 `node:fs` (입력 사용 시만) | 없음 (`cc -std=c11 -O2 -Wall -Wextra -Werror` 무경고) |
| 대용량 리터럴 | 전 범위 실행 | `int64_t` 범위 초과 시 컴파일 경고 + 런타임 `RUNTIME_BIGINT_OVERFLOW` |

---

## 6. 타 언어 포팅 및 적합성 테스트

새로운 구현체(Rust, Python, Go 등)를 제작할 때는 [`spec/conformance.json`](spec/conformance.json)의 테스트 벡터를 기준으로 어휘·구문·실행 결과를 검증할 수 있습니다. 스키마 상세는 [`spec/README.md`](spec/README.md)를 참고하세요.
