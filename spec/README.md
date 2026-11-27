# 줴줴랭 (`gg-lang`) 언어 중립 적합성 테스트 규격 (`spec/`)

[`conformance.json`](conformance.json)은 레퍼런스 Rust 구현([`crates/gg-core/`](../crates/gg-core/)) 및 타 언어(Go, Python, C, TypeScript 등)로 줴줴랭 인터프리터·컴파일러를 구현할 때 사양 준수 여부를 검증하기 위한 언어 중립 테스트 벡터 모음입니다.

## JSON 스키마

```jsonc
{
  "specVersion": "1.2",
  "cases": [
    {
      "id": "고유 식별자",
      "category": "lexer" | "parser" | "vm",
      "description": "테스트 목적 설명",
      "code": "실행할 .gg 소스 코드",
      "stdin": "선택적 표준 입력 문자열 (생략 시 빈 문자열)",
      "options": {
        "maxSteps": 50
      },
      "expected": {
        "status": "ok" | "syntax_error" | "runtime_error",
        "output": "status가 ok일 때 기대 stdout (생략 가능)",
        "stack": ["status가 ok일 때 최종 스택 (bottom->top 10진수 문자열 배열, 생략 가능)"],
        "errorCodes": ["syntax_error 또는 runtime_error일 때 반드시 포함되어야 할 진단 코드"]
      }
    }
  ]
}
```

### 구현 시 주의 사항
- 큰 정수 정밀도를 잃지 않도록 `stack` 기대값은 JSON 숫자가 아니라 **10진수 문자열**로 기록합니다 (`"1208925819614629174706176"` 등).
- `runtime_error` 상태에서는 모든 오류 메시지에 `"터져서 없어짐 수고하세요"` 계약 문구가 포함되어야 합니다 (정적 구현체가 동일 계약을 따를 경우 검증).
- `code`는 표준 프로그램(`allowFragment: false`) 기준이므로 `syntax_error` 케이스가 아닌 경우 `요이~` 시작과 `줴줴이야` 종료를 포함합니다.
