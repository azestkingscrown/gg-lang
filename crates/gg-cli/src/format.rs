use gg_core::{Diagnostic, DiagnosticKind, TraceEvent, TracePhase};
use num_bigint::BigInt;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorStyle {
    Meme,
    Plain,
}

fn plain_message(code: &str) -> Option<&'static str> {
    match code {
        "LEX_INCOMPLETE_AH" => Some("Incomplete '아 예?' keyword (missing '예?')"),
        "LEX_INCOMPLETE_NEON" => Some("Incomplete '넌 나가라' keyword (missing '나가라' or '나가라!')"),
        "LEX_ORPHAN_NAGARA" => Some("Unexpected '나가라' without preceding '넌'"),
        "LEX_MIXED_NUMBER_MARKS" => Some("Cannot mix '.' and ',' in a number literal"),
        "LEX_MISSING_NUMBER_VALUE" => Some("Number literal with '어' prefix requires at least one '.' or ','"),
        "LEX_NUMBER_TOO_LARGE" => Some("Exponent in number literal exceeds maximum limit"),
        "LEX_TOO_MANY_TILDES" => Some("Too many '~' modifiers (max 4 for arithmetic/stack, max 2 for comparison/print)"),
        "LEX_INVALID_MEMORY_OP" => Some("Invalid memory operator (expected '쥐랄!' or '쥐~랄!')"),
        "LEX_INVALID_STACK_OP" => Some("Invalid stack operator"),
        "LEX_UNKNOWN_TOKEN" => Some("Unknown token"),

        "SYNTAX_EMPTY" => Some("Empty program"),
        "SYNTAX_MISSING_START" => Some("Program must begin with '요이~'"),
        "SYNTAX_MISSING_HALT" => Some("Program must end with '줴줴이야'"),
        "SYNTAX_DUPLICATE_START" => Some("Duplicate '요이~' start token"),
        "SYNTAX_UNEXPECTED_ELSE" => Some("Unexpected 'ELSE' ('아뇨아뇨') without matching 'IF'"),
        "SYNTAX_DUPLICATE_ELSE" => Some("Duplicate 'ELSE' ('아뇨아뇨') in 'IF' block"),
        "SYNTAX_UNEXPECTED_END" => Some("Unexpected 'END' ('아뇨아뇨!') without open block"),
        "SYNTAX_CONTINUE_OUTSIDE_LOOP" => Some("'CONTINUE' ('아뇨아뇨아뇨') used outside loop"),
        "SYNTAX_BREAK_OUTSIDE_LOOP" => Some("'BREAK' ('넌 나가라!') used outside loop"),
        "SYNTAX_UNKNOWN_TOKEN" => Some("Unknown token type in parser"),
        "SYNTAX_UNCLOSED_BLOCK" => Some("Unclosed control flow block"),

        "RUNTIME_STEP_LIMIT" => Some("Execution step limit exceeded"),
        "RUNTIME_BIGINT_OVERFLOW" => Some("Integer bit limit exceeded"),
        "RUNTIME_STACK_OVERFLOW" => Some("Stack size limit exceeded"),
        "RUNTIME_MEMORY_OVERFLOW" => Some("Heap memory limit exceeded"),
        "RUNTIME_STACK_UNDERFLOW" => Some("Stack underflow"),
        "RUNTIME_OUTPUT_LIMIT" => Some("Output length limit exceeded"),
        "RUNTIME_INVALID_JUMP" => Some("Invalid jump target"),
        "RUNTIME_STDIN_EOF" => Some("Unexpected EOF while reading integer from stdin"),
        "RUNTIME_INVALID_INT" => Some("Invalid integer in stdin"),
        "RUNTIME_DIV_ZERO" => Some("Division by zero"),
        "RUNTIME_INVALID_CODEPOINT" => Some("Invalid Unicode code point for character output"),
        "RUNTIME_INVALID_OPCODE" => Some("Invalid VM instruction opcode"),
        _ => None,
    }
}

pub fn format_diagnostic(diag: &Diagnostic, style: ErrorStyle) -> String {
    if style == ErrorStyle::Plain {
        let kind_label = match diag.kind {
            DiagnosticKind::Syntax => "syntax",
            DiagnosticKind::Runtime => "runtime",
        };
        let msg = plain_message(&diag.code).unwrap_or(&diag.message);
        return format!("[{kind_label}] {}:{} ({}) {}", diag.line, diag.column, diag.code, msg);
    }

    let kind_label = match diag.kind {
        DiagnosticKind::Syntax => "문법 에러",
        DiagnosticKind::Runtime => "런타임 에러",
    };
    let mut out = format!(
        "[{kind_label}] {}:{} ({}) {}",
        diag.line, diag.column, diag.code, diag.message
    );
    if let Some(hint) = &diag.hint {
        out.push_str("\n  힌트: ");
        out.push_str(hint);
    }
    out
}

fn format_trace_value(value: &BigInt) -> String {
    let s = value.to_string();
    if s.len() <= 32 {
        s
    } else {
        format!("{}...{}", &s[..14], &s[s.len() - 10..])
    }
}

fn format_trace_stack(stack: &[BigInt]) -> String {
    let max_items = 12usize;
    if stack.len() <= max_items {
        let items: Vec<String> = stack.iter().map(format_trace_value).collect();
        return format!("[{}]", items.join(", "));
    }
    let omitted = stack.len() - max_items;
    let tail: Vec<String> = stack[omitted..].iter().map(format_trace_value).collect();
    format!("[...({omitted} more), {}]", tail.join(", "))
}

pub fn format_trace_event(event: &TraceEvent, source_label: &str, style: ErrorStyle) -> String {
    let phase = match event.phase {
        TracePhase::Before => "before",
        TracePhase::After => "after",
        TracePhase::Error => "error",
    };
    let base = format!(
        "[trace] {source_label}:{}:{} #{} {phase} {} ({}) stack={}",
        event.token.line,
        event.token.column,
        event.step,
        event.op.as_str(),
        event.token.raw,
        format_trace_stack(&event.stack)
    );
    if event.phase == TracePhase::Error
        && let Some(err) = &event.error
    {
        return format!("{base} error={}", format_diagnostic(err, style));
    }
    base
}
