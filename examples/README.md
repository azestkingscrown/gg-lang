# 줴줴랭 (`.gg`) 예제 모음

`examples/` 디렉터리에는 언어 기능을 단계별로 익힐 수 있는 16개의 실행 가능한 `.gg` 예제가 들어 있습니다.

## 실행 방법

```bash
# 네이티브 Rust CLI 빌드 및 실행 (또는 `npm run gg --`)
cargo build --release -p gg-cli
./target/release/gg examples/hello.gg
printf "48 18" | ./target/release/gg examples/gcd.gg

# C11 / JavaScript 독립 실행 코드로 컴파일
./target/release/gg examples/sort.gg --emit c -o /tmp/sort.c && cc -O2 /tmp/sort.c -o /tmp/sort
printf "5\n5 3 -2 9 0" | /tmp/sort
```

## 전체 목록 (16종)

### 1. 기초 (Basic)

| 파일 | 설명 | 표준 입력 예시 | 기대 출력 |
| --- | --- | --- | --- |
| [`hello.gg`](hello.gg) | ASCII 코드포인트 조합과 `야~르!` 문자 출력 | *(없음)* | `Hello, World!` |
| [`hangul.gg`](hangul.gg) | `어` 거듭제곱 리터럴을 이용한 한글 UTF-8 출력 | *(없음)* | `안녕, 줴줴!` |
| [`add.gg`](add.gg) | `예?` 정수 2개 입력, 덧셈(`지랄`), 줄바꿈 출력(`야~~르`) | `12 30` | `42` |
| [`countdown.gg`](countdown.gg) | `아뇨아뇨~` 반복문과 `쥐랄`을 이용한 5 → 1 카운트다운 | *(없음)* | `5\n4\n3\n2\n1` |
| [`fibonacci.gg`](fibonacci.gg) | 힙 메모리(`쥐랄!`/`쥐~랄!`)를 활용한 피보나치 앞 10항 | *(없음)* | `0 1 1 2 3 5 8 13 21 34` |
| [`truth_machine.gg`](truth_machine.gg) | Esolang 대표 벤치마크 진리 기계 (`0` → 1회, `1` → 무한 출력) | `0` | `0` |

### 2. 알고리즘 (Algorithm)

| 파일 | 설명 | 표준 입력 예시 | 기대 출력 |
| --- | --- | --- | --- |
| [`factorial.gg`](factorial.gg) | `BigInt` 정밀도로 `N!` 계산 (`30!` 등 대형 정수 지원) | `10` | `3628800` |
| [`gcd.gg`](gcd.gg) | 음수 정규화 포함 유클리드 호제법 최대공약수 계산 | `48 18` | `6` |
| [`is_prime.gg`](is_prime.gg) | `d*d <= N` 시험 나눗셈 기반 소수 판별 (`1` 또는 `0`) | `97` | `1` |
| [`gugudan.gg`](gugudan.gg) | 입력 단 `N`에 대한 구구단 (`N x 1 = ...` ~ `N x 9 = ...`) | `7` | `7 x 1 = 7` ~ `7 x 9 = 63` |
| [`sort.gg`](sort.gg) | 힙 메모리 `mem[0..N-1]` 선택 정렬(Selection Sort) | `5 5 3 -2 9 0` | `-2 0 3 5 9` |

### 3. 문자열 · 파서 (Text & Parser)

| 파일 | 설명 | 표준 입력 예시 | 기대 출력 |
| --- | --- | --- | --- |
| [`reverse.gg`](reverse.gg) | `아 예?` + EOF(`-1`) 감지로 유니코드 문자열 역순 출력 | `줴줴🔥ABC` | `CBA🔥줴줴` |
| [`99bottles.gg`](99bottles.gg) | `N`병부터 `0`까지 단·복수 분기 포함 99 Bottles 가사 출력 | `2` | 2절 영문 가사 |
| [`palindrome.gg`](palindrome.gg) | `아 예?` + `CONTINUE` + 투 포인터로 유니코드 회문 판별 | `기러기` | `1` |
| [`caesar_cipher.gg`](caesar_cipher.gg) | 첫 줄 이동량 `k`만큼 영문자 시저 암호 변환 (한글/기호 유지) | `3\nHello, 줴줴!` | `Khoor, 줴줴!` |
| [`rpn_calc.gg`](rpn_calc.gg) | Lookahead 토크나이징 + 힙 스택 기반 후위 표기식(`+ - * / %`) 계산기 | `3 4 + 2 * 7 -` | `7` |
