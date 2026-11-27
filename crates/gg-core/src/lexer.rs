use num_bigint::BigInt;

use crate::types::{Diagnostic, DiagnosticKind, Token, TokenType};

pub const MAX_EXPONENT: usize = 1000;

#[derive(Debug, Clone)]
struct RawWord {
    raw: String,
    line: usize,
    column: usize,
    end_column: usize,
}

#[derive(Debug, Clone, Default)]
pub struct LexResult {
    pub tokens: Vec<Token>,
    pub diagnostics: Vec<Diagnostic>,
}

pub fn truncate_display(text: &str, max_len: usize) -> String {
    let mut chars = text.chars();
    let prefix: String = chars.by_ref().take(max_len).collect();
    if chars.next().is_some() {
        format!("{prefix}…")
    } else {
        prefix
    }
}

fn is_horizontal_whitespace(ch: char) -> bool {
    matches!(ch, ' ' | '\t' | '\x0B' | '\x0C' | '\u{00A0}' | '\u{3000}')
}

fn scan_raw_words(source: &str) -> Vec<RawWord> {
    let stripped = source.strip_prefix('\u{FEFF}').unwrap_or(source);
    let chars: Vec<char> = stripped.chars().collect();
    let mut words = Vec::new();
    let mut i = 0;
    let mut line = 1usize;
    let mut column = 1usize;

    while i < chars.len() {
        let ch = chars[i];

        if ch == '\n' {
            line += 1;
            column = 1;
            i += 1;
            continue;
        }

        if ch == '\r' {
            if i + 1 < chars.len() && chars[i + 1] == '\n' {
                i += 2;
            } else {
                i += 1;
            }
            line += 1;
            column = 1;
            continue;
        }

        if is_horizontal_whitespace(ch) {
            column += ch.len_utf16();
            i += 1;
            continue;
        }

        if ch == '/' && i + 1 < chars.len() && chars[i + 1] == '/' {
            while i < chars.len() && chars[i] != '\n' && chars[i] != '\r' {
                i += 1;
            }
            continue;
        }

        let start_col = column;
        let mut raw = String::new();
        while i < chars.len() {
            let c = chars[i];
            if is_horizontal_whitespace(c)
                || c == '\r'
                || c == '\n'
                || (c == '/' && i + 1 < chars.len() && chars[i + 1] == '/')
            {
                break;
            }
            raw.push(c);
            column += c.len_utf16();
            i += 1;
        }

        words.push(RawWord {
            raw,
            line,
            column: start_col,
            end_column: column,
        });
    }

    words
}

fn exact_keyword(raw: &str) -> Option<TokenType> {
    match raw {
        "요이~" => Some(TokenType::Start),
        "줴줴이야" => Some(TokenType::Halt),
        "예?" => Some(TokenType::InputInt),
        "야~르" => Some(TokenType::PrintInt),
        "야~~르" => Some(TokenType::PrintIntLn),
        "야~르!" => Some(TokenType::PrintChar),
        "아뇨" => Some(TokenType::Not),
        "아뇨아뇨?" => Some(TokenType::If),
        "아뇨아뇨" => Some(TokenType::Else),
        "아뇨아뇨~" => Some(TokenType::While),
        "아뇨아뇨!" => Some(TokenType::End),
        "아뇨아뇨아뇨" => Some(TokenType::Continue),
        _ => None,
    }
}

fn parse_push_literal(raw: &str) -> Option<(usize, usize, bool, bool)> {
    let mut chars = raw.chars().peekable();
    let mut eo_count = 0usize;
    while matches!(chars.peek(), Some('어')) {
        chars.next();
        eo_count += 1;
    }
    if chars.next() != Some('엄') {
        return None;
    }
    let mut has_dots = false;
    let mut has_commas = false;
    let mut marks_len = 0usize;
    for ch in chars {
        match ch {
            '.' => {
                has_dots = true;
                marks_len += 1;
            }
            ',' => {
                has_commas = true;
                marks_len += 1;
            }
            _ => return None,
        }
    }
    Some((eo_count, marks_len, has_dots, has_commas))
}

fn parse_ji_op(raw: &str) -> Option<(usize, bool)> {
    let rest = raw.strip_prefix('지')?;
    let tildes = rest.chars().take_while(|&c| c == '~').count();
    let after_tildes = &rest[tildes..];
    let after_stem = after_tildes
        .strip_prefix('랄')
        .or_else(|| after_tildes.strip_prefix('롤'))?;
    match after_stem {
        "" => Some((tildes, false)),
        "?" => Some((tildes, true)),
        _ => None,
    }
}

fn parse_jwi_op(raw: &str) -> Option<(usize, bool)> {
    let rest = raw.strip_prefix('쥐')?;
    let tildes = rest.chars().take_while(|&c| c == '~').count();
    let after_tildes = &rest[tildes..];
    let after_stem = after_tildes.strip_prefix('랄')?;
    match after_stem {
        "" => Some((tildes, false)),
        "!" => Some((tildes, true)),
        _ => None,
    }
}

fn get_typo_hint(raw: &str) -> Option<String> {
    if raw == "요이"
        || (raw.starts_with("요이") && {
            let tail = &raw["요이".len()..];
            (!tail.is_empty() && tail.chars().all(|c| c == '~') && tail.len() >= 2)
                || (!tail.is_empty() && tail.chars().all(|c| c != '~'))
        })
    {
        return Some("혹시 '요이~'를 쓰려던 건가요?".to_string());
    }
    if matches!(raw, "예" | "예!" | "아예" | "아예?") {
        return Some("혹시 '예?' 또는 '아 예?'를 쓰려던 건가요?".to_string());
    }
    if let Some(after_ya) = raw.strip_prefix('야') {
        let after_tildes = after_ya.trim_start_matches('~');
        if let Some(tail) = after_tildes.strip_prefix('르')
            && tail.chars().all(|c| matches!(c, '!' | '?' | '.' | '~'))
        {
            return Some("혹시 '야~르', '야~~르', '야~르!' 중 하나를 쓰려던 건가요?".to_string());
        }
    }
    if matches!(raw, "줴줴" | "줴줴이" | "줴줴야" | "제제이야")
        || raw
            .strip_prefix("줴줴이야")
            .is_some_and(|tail| !tail.is_empty() && tail.chars().all(|c| matches!(c, '~' | '!' | '?' | '.')))
    {
        return Some("혹시 '줴줴이야'를 쓰려던 건가요?".to_string());
    }
    if matches!(raw, "넌나가라" | "넌나가라!") {
        return Some("혹시 띄어쓰기를 넣어 '넌 나가라' 또는 '넌 나가라!'를 쓰려던 건가요?".to_string());
    }
    if let Some(rest) = raw.strip_prefix('지') {
        let after_tildes = rest.trim_start_matches('~');
        if after_tildes.starts_with('랄') || after_tildes.starts_with('롤') {
            return Some("산술/비교 연산은 '지(~*)랄' 또는 '지(~*)랄?' (순화: '롤') 형태여야 해요.".to_string());
        }
    }
    if let Some(rest) = raw.strip_prefix('쥐') {
        let after_tildes = rest.trim_start_matches('~');
        if after_tildes.starts_with('랄') || after_tildes.starts_with('롤') {
            return Some("스택/메모리 명령은 '쥐(~*)랄', '쥐랄!', '쥐~랄!' 형태만 지원합니다.".to_string());
        }
    }
    if raw.starts_with("아뇨") {
        return Some("조건/반복 키워드는 '아뇨', '아뇨아뇨?', '아뇨아뇨', '아뇨아뇨~', '아뇨아뇨!', '아뇨아뇨아뇨'만 있어요.".to_string());
    }
    if raw.trim_start_matches('어').starts_with('엄') {
        return Some("'엄' 숫자 리터럴 뒤에는 온점(.) 또는 쉼표(,)만 붙일 수 있어요.".to_string());
    }
    None
}

const ARITHMETIC_OPS: [TokenType; 5] = [
    TokenType::Add,
    TokenType::Sub,
    TokenType::Mul,
    TokenType::Div,
    TokenType::Mod,
];
const COMPARE_OPS: [TokenType; 3] = [TokenType::Eq, TokenType::Lt, TokenType::GT];
const STACK_OPS: [TokenType; 5] = [
    TokenType::Dup,
    TokenType::Swap,
    TokenType::Over,
    TokenType::Rot,
    TokenType::Depth,
];

pub fn tokenize(source: &str) -> LexResult {
    let words = scan_raw_words(source);
    let mut tokens = Vec::new();
    let mut diagnostics = Vec::new();

    let mut i = 0usize;
    while i < words.len() {
        let word = &words[i];
        let next = words.get(i + 1);

        if word.raw == "아" {
            if let Some(next_w) = next
                && next_w.line == word.line
                && next_w.raw == "예?"
            {
                tokens.push(Token {
                    token_type: TokenType::InputChar,
                    raw: "아 예?".to_string(),
                    value: None,
                    line: word.line,
                    column: word.column,
                    end_column: next_w.end_column,
                });
                i += 2;
                continue;
            }
            diagnostics.push(Diagnostic {
                kind: DiagnosticKind::Syntax,
                code: "LEX_INCOMPLETE_AH".to_string(),
                message: "예? '아' 뒤에는 '예?'가 와야 해요 (아 예?)".to_string(),
                hint: Some("문자 1글자를 입력받으려면 같은 줄에 '아 예?'라고 적어주세요.".to_string()),
                line: word.line,
                column: word.column,
                end_column: word.end_column,
            });
            i += 1;
            continue;
        }

        if word.raw == "넌" {
            if let Some(next_w) = next
                && next_w.line == word.line
                && (next_w.raw == "나가라" || next_w.raw == "나가라!")
            {
                tokens.push(Token {
                    token_type: if next_w.raw == "나가라" {
                        TokenType::Pop
                    } else {
                        TokenType::Break
                    },
                    raw: format!("넌 {}", next_w.raw),
                    value: None,
                    line: word.line,
                    column: word.column,
                    end_column: next_w.end_column,
                });
                i += 2;
                continue;
            }
            diagnostics.push(Diagnostic {
                kind: DiagnosticKind::Syntax,
                code: "LEX_INCOMPLETE_NEON".to_string(),
                message: "예? '넌' 뒤에는 '나가라' 또는 '나가라!'가 와야 해요".to_string(),
                hint: Some("스택 top 버리기는 '넌 나가라', 반복문 탈출은 '넌 나가라!'입니다.".to_string()),
                line: word.line,
                column: word.column,
                end_column: word.end_column,
            });
            i += 1;
            continue;
        }

        if word.raw == "나가라" || word.raw == "나가라!" {
            diagnostics.push(Diagnostic {
                kind: DiagnosticKind::Syntax,
                code: "LEX_ORPHAN_NAGARA".to_string(),
                message: format!("예? '{}' 앞에 '넌'을 빼먹으셨는데요? (넌 {})", word.raw, word.raw),
                hint: Some("'넌 나가라' 또는 '넌 나가라!' 형태로 두 단어를 같은 줄에 붙여 써주세요.".to_string()),
                line: word.line,
                column: word.column,
                end_column: word.end_column,
            });
            i += 1;
            continue;
        }

        if let Some(exact_type) = exact_keyword(&word.raw) {
            tokens.push(Token {
                token_type: exact_type,
                raw: word.raw.clone(),
                value: None,
                line: word.line,
                column: word.column,
                end_column: word.end_column,
            });
            i += 1;
            continue;
        }

        if let Some((eo_len, marks_len, has_dots, has_commas)) = parse_push_literal(&word.raw) {
            if has_dots && has_commas {
                diagnostics.push(Diagnostic {
                    kind: DiagnosticKind::Syntax,
                    code: "LEX_MIXED_NUMBER_MARKS".to_string(),
                    message: "아뇨아뇨아뇨 '엄' 뒤에는 온점(.)과 쉼표(,)를 섞어 쓸 수 없어요".to_string(),
                    hint: Some("양수는 '.'만, 음수는 ','만 사용해주세요.".to_string()),
                    line: word.line,
                    column: word.column,
                    end_column: word.end_column,
                });
                i += 1;
                continue;
            }

            if eo_len >= 1 && marks_len == 0 {
                diagnostics.push(Diagnostic {
                    kind: DiagnosticKind::Syntax,
                    code: "LEX_MISSING_NUMBER_VALUE".to_string(),
                    message: format!("예? '{}' 뒤에 온점(.)이나 쉼표(,)로 값을 적어주세요", truncate_display(&word.raw, 40)),
                    hint: Some("예: '어엄.'은 10, '어엄,,'은 -20을 의미합니다.".to_string()),
                    line: word.line,
                    column: word.column,
                    end_column: word.end_column,
                });
                i += 1;
                continue;
            }

            if eo_len > MAX_EXPONENT {
                diagnostics.push(Diagnostic {
                    kind: DiagnosticKind::Syntax,
                    code: "LEX_NUMBER_TOO_LARGE".to_string(),
                    message: format!(
                        "아뇨아뇨아뇨 '{}'의 '어' 개수가 너무 많아요 (최대 {}개)",
                        truncate_display(&word.raw, 40),
                        MAX_EXPONENT
                    ),
                    hint: Some("큰 수는 '지~~랄'(곱셈)을 조합해 만들어 보세요.".to_string()),
                    line: word.line,
                    column: word.column,
                    end_column: word.end_column,
                });
                i += 1;
                continue;
            }

            let magnitude = BigInt::from(marks_len);
            let signed = if has_commas { -magnitude } else { magnitude };
            let value = signed * BigInt::from(10u8).pow(eo_len as u32);

            tokens.push(Token {
                token_type: TokenType::Push,
                raw: word.raw.clone(),
                value: Some(value),
                line: word.line,
                column: word.column,
                end_column: word.end_column,
            });
            i += 1;
            continue;
        }

        if let Some((tildes, is_cmp)) = parse_ji_op(&word.raw) {
            if is_cmp {
                if let Some(&op_type) = COMPARE_OPS.get(tildes) {
                    tokens.push(Token {
                        token_type: op_type,
                        raw: word.raw.clone(),
                        value: None,
                        line: word.line,
                        column: word.column,
                        end_column: word.end_column,
                    });
                    i += 1;
                    continue;
                }
            } else if let Some(&op_type) = ARITHMETIC_OPS.get(tildes) {
                tokens.push(Token {
                    token_type: op_type,
                    raw: word.raw.clone(),
                    value: None,
                    line: word.line,
                    column: word.column,
                    end_column: word.end_column,
                });
                i += 1;
                continue;
            }

            diagnostics.push(Diagnostic {
                kind: DiagnosticKind::Syntax,
                code: "LEX_TOO_MANY_TILDES".to_string(),
                message: "물결(~) 개수가 너무 많아요! 산술은 0~4개, 비교(?)는 0~2개만 쓸 수 있어요".to_string(),
                hint: None,
                line: word.line,
                column: word.column,
                end_column: word.end_column,
            });
            i += 1;
            continue;
        }

        if let Some((tildes, is_mem)) = parse_jwi_op(&word.raw) {
            if is_mem {
                if tildes == 0 || tildes == 1 {
                    tokens.push(Token {
                        token_type: if tildes == 0 { TokenType::Store } else { TokenType::Load },
                        raw: word.raw.clone(),
                        value: None,
                        line: word.line,
                        column: word.column,
                        end_column: word.end_column,
                    });
                    i += 1;
                    continue;
                }

                diagnostics.push(Diagnostic {
                    kind: DiagnosticKind::Syntax,
                    code: "LEX_INVALID_MEMORY_OP".to_string(),
                    message: "메모리 명령('쥐~랄!')은 물결 0개('쥐랄!' 저장) 또는 1개('쥐~랄!' 불러오기)만 쓸 수 있어요.".to_string(),
                    hint: None,
                    line: word.line,
                    column: word.column,
                    end_column: word.end_column,
                });
                i += 1;
                continue;
            }

            if let Some(&op_type) = STACK_OPS.get(tildes) {
                tokens.push(Token {
                    token_type: op_type,
                    raw: word.raw.clone(),
                    value: None,
                    line: word.line,
                    column: word.column,
                    end_column: word.end_column,
                });
                i += 1;
                continue;
            }

            diagnostics.push(Diagnostic {
                kind: DiagnosticKind::Syntax,
                code: "LEX_INVALID_STACK_OP".to_string(),
                message: "스택 명령('쥐~랄')의 물결(~)은 0~4개까지만 쓸 수 있어요.".to_string(),
                hint: None,
                line: word.line,
                column: word.column,
                end_column: word.end_column,
            });
            i += 1;
            continue;
        }

        diagnostics.push(Diagnostic {
            kind: DiagnosticKind::Syntax,
            code: "LEX_UNKNOWN_TOKEN".to_string(),
            message: format!("예? '{}'이(가) 무슨 말인지 모르겠어요", truncate_display(&word.raw, 40)),
            hint: get_typo_hint(&word.raw),
            line: word.line,
            column: word.column,
            end_column: word.end_column,
        });
        i += 1;
    }

    LexResult { tokens, diagnostics }
}
