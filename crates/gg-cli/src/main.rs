mod format;
mod repl;

use std::env;
use std::fs;
use std::io::{self, IsTerminal, Read, Write};
use std::path::Path;

use gg_core::{
    EmitOptions, EmitTarget, JjeJjeVM, OpCode, ParseOptions, VMOptions, compile,
    compile_to_target, text_to_gg,
};

use format::{ErrorStyle, format_diagnostic, format_trace_event};
use repl::{ReplConfig, run_repl, run_tty_repl};

const MAX_SOURCE_BYTES: u64 = 5 * 1024 * 1024;
const MAX_STDIN_BYTES: usize = 2 * 1024 * 1024;
const VERSION: &str = env!("CARGO_PKG_VERSION");

enum CliMode {
    Help,
    Version,
    Encode {
        has_args: bool,
        text: String,
    },
    Repl,
    Emit,
    Run,
}

struct ParsedArgs {
    mode: CliMode,
    file_path: Option<String>,
    eval_code: Option<String>,
    emit_target: Option<EmitTarget>,
    output_path: Option<String>,
    check_only: bool,
    trace: bool,
    error_style: ErrorStyle,
    max_steps: Option<usize>,
    stdin_text: Option<String>,
}

fn print_usage(to_stderr: bool) {
    let usage = format!(
        "줴줴랭 (JjeJje / .gg) CLI 인터프리터 v{VERSION}

사용법:
  gg <파일경로.gg> [옵션]
  gg run <파일경로.gg> [옵션]
  gg repl [옵션]
  gg -e \"요이~ 엄..... 야~~르 줴줴이야\" [옵션]
  gg --encode \"출력할 문자열\"

옵션:
  --check                   문법 검사만 수행하고 실행하지 않음
  --emit <js|c>             독립 실행 가능한 JS(.mjs) 또는 C11(.c) 코드 생성
  -o, --output <파일>       --emit 출력 파일 경로 지정 (기본값: stdout)
  --trace                   실행 중 각 명령어와 스택 상태를 stderr로 추적
  --error-style <meme|plain> 진단 출력 형식 지정 (기본값: meme)
  --max-steps <N>           최대 실행 스텝 수 지정 (기본 200000)
  --stdin <텍스트>          표준 입력 문자열 직접 지정
  -e, --eval <코드>         인라인 줴줴랭 코드 실행
  --encode [텍스트]         문자열을 .gg 코드로 변환 (인자가 없으면 stdin 읽기)
  -v, --version             버전 정보 표시
  -h, --help                도움말 표시"
    );
    if to_stderr {
        eprintln!("{usage}");
    } else {
        println!("{usage}");
    }
}

fn parse_positive_int(raw: &str, flag_name: &str) -> Result<usize, String> {
    if raw.is_empty() || !raw.bytes().all(|b| b.is_ascii_digit()) {
        return Err(format!("{flag_name} 옵션에는 0 이상의 정수를 지정해야 합니다. (입력: {raw})"));
    }
    raw.parse::<usize>()
        .map_err(|_| format!("{flag_name} 값이 너무 큽니다. (입력: {raw})"))
}

fn parse_error_style(raw: &str) -> Result<ErrorStyle, String> {
    match raw {
        "meme" => Ok(ErrorStyle::Meme),
        "plain" => Ok(ErrorStyle::Plain),
        _ => Err(format!("--error-style 옵션은 'meme' 또는 'plain'만 사용할 수 있습니다. (입력: {raw})")),
    }
}

fn parse_emit_target(raw: &str) -> Result<EmitTarget, String> {
    match raw.to_ascii_lowercase().as_str() {
        "js" => Ok(EmitTarget::Js),
        "c" => Ok(EmitTarget::C),
        _ => Err(format!("--emit 타깃은 'js' 또는 'c'만 지원합니다. (입력: {raw})")),
    }
}

fn parse_args(argv: &[String]) -> Result<ParsedArgs, String> {
    if argv.is_empty() {
        return Err(String::new());
    }

    let mut is_repl = false;
    let mut start_index = 0usize;
    if argv[0] == "repl" {
        is_repl = true;
        start_index = 1;
    } else if argv[0] == "run" {
        start_index = 1;
    }

    let mut file_path: Option<String> = None;
    let mut eval_code: Option<String> = None;
    let mut emit_target: Option<EmitTarget> = None;
    let mut output_path: Option<String> = None;
    let mut check_only = false;
    let mut trace = false;
    let mut error_style = ErrorStyle::Meme;
    let mut has_error_style_flag = false;
    let mut max_steps: Option<usize> = None;
    let mut stdin_text: Option<String> = None;
    let mut end_of_options = false;

    let mut i = start_index;
    while i < argv.len() {
        let arg = &argv[i];

        if !end_of_options && arg == "--" {
            end_of_options = true;
            i += 1;
            continue;
        }

        if !end_of_options && (arg == "-h" || arg == "--help") {
            return Ok(ParsedArgs {
                mode: CliMode::Help,
                file_path: None,
                eval_code: None,
                emit_target: None,
                output_path: None,
                check_only: false,
                trace: false,
                error_style: ErrorStyle::Meme,
                max_steps: None,
                stdin_text: None,
            });
        }

        if !end_of_options && (arg == "-v" || arg == "--version") {
            return Ok(ParsedArgs {
                mode: CliMode::Version,
                file_path: None,
                eval_code: None,
                emit_target: None,
                output_path: None,
                check_only: false,
                trace: false,
                error_style: ErrorStyle::Meme,
                max_steps: None,
                stdin_text: None,
            });
        }

        if !end_of_options && arg == "--encode" {
            if is_repl
                || file_path.is_some()
                || eval_code.is_some()
                || emit_target.is_some()
                || output_path.is_some()
                || check_only
                || trace
                || has_error_style_flag
                || max_steps.is_some()
                || stdin_text.is_some()
            {
                return Err("--encode 옵션은 다른 실행 옵션이나 파일 경로와 함께 사용할 수 없습니다.".to_string());
            }
            let mut rest = &argv[i + 1..];
            if rest.first().map(String::as_str) == Some("--") {
                rest = &rest[1..];
            }
            return Ok(ParsedArgs {
                mode: CliMode::Encode {
                    has_args: !rest.is_empty(),
                    text: rest.join(" "),
                },
                file_path: None,
                eval_code: None,
                emit_target: None,
                output_path: None,
                check_only: false,
                trace: false,
                error_style: ErrorStyle::Meme,
                max_steps: None,
                stdin_text: None,
            });
        }

        if !end_of_options && arg == "--check" {
            check_only = true;
            i += 1;
            continue;
        }

        if !end_of_options && arg == "--trace" {
            trace = true;
            i += 1;
            continue;
        }

        if !end_of_options && (arg == "--emit" || arg.starts_with("--emit=")) {
            let val = if let Some(rest) = arg.strip_prefix("--emit=") {
                rest.to_string()
            } else {
                i += 1;
                argv.get(i)
                    .cloned()
                    .ok_or_else(|| "--emit 뒤에 js 또는 c를 지정해주세요.".to_string())?
            };
            emit_target = Some(parse_emit_target(&val)?);
            i += 1;
            continue;
        }

        if !end_of_options && (arg == "-o" || arg == "--output" || arg.starts_with("--output=")) {
            let val = if let Some(rest) = arg.strip_prefix("--output=") {
                rest.to_string()
            } else {
                i += 1;
                argv.get(i)
                    .cloned()
                    .ok_or_else(|| format!("{arg} 뒤에 출력 파일 경로를 지정해주세요."))?
            };
            output_path = Some(val);
            i += 1;
            continue;
        }

        if !end_of_options && (arg == "--error-style" || arg.starts_with("--error-style=")) {
            let val = if let Some(rest) = arg.strip_prefix("--error-style=") {
                rest.to_string()
            } else {
                i += 1;
                argv.get(i)
                    .cloned()
                    .ok_or_else(|| "--error-style 뒤에 meme 또는 plain을 지정해주세요.".to_string())?
            };
            error_style = parse_error_style(&val)?;
            has_error_style_flag = true;
            i += 1;
            continue;
        }

        if !end_of_options && (arg == "--max-steps" || arg.starts_with("--max-steps=")) {
            let val = if let Some(rest) = arg.strip_prefix("--max-steps=") {
                rest.to_string()
            } else {
                i += 1;
                argv.get(i)
                    .cloned()
                    .ok_or_else(|| "--max-steps 뒤에 스텝 수를 지정해주세요.".to_string())?
            };
            max_steps = Some(parse_positive_int(&val, "--max-steps")?);
            i += 1;
            continue;
        }

        if !end_of_options && (arg == "--stdin" || arg.starts_with("--stdin=")) {
            let val = if let Some(rest) = arg.strip_prefix("--stdin=") {
                rest.to_string()
            } else {
                i += 1;
                argv.get(i)
                    .cloned()
                    .ok_or_else(|| "--stdin 뒤에 입력 문자열을 지정해주세요.".to_string())?
            };
            stdin_text = Some(val);
            i += 1;
            continue;
        }

        if !end_of_options && (arg == "-e" || arg == "--eval" || arg.starts_with("--eval=")) {
            let val = if let Some(rest) = arg.strip_prefix("--eval=") {
                rest.to_string()
            } else {
                i += 1;
                argv.get(i)
                    .cloned()
                    .ok_or_else(|| format!("{arg} 뒤에 실행할 코드를 입력해주세요."))?
            };
            if eval_code.is_some() {
                return Err("-e/--eval 옵션은 한 번만 사용할 수 있습니다.".to_string());
            }
            eval_code = Some(val);
            i += 1;
            continue;
        }

        if !end_of_options && arg.starts_with('-') {
            return Err(format!("알 수 없는 옵션입니다: {arg}"));
        }

        if is_repl {
            return Err(format!("repl 모드에서는 파일 인자를 받을 수 없습니다. (입력: {arg})"));
        }

        if file_path.is_some() {
            return Err(format!("파일 경로는 하나만 지정할 수 있습니다. (추가 인자: {arg})"));
        }
        file_path = Some(arg.clone());
        i += 1;
    }

    if is_repl {
        if check_only || eval_code.is_some() || emit_target.is_some() || output_path.is_some() {
            return Err("repl 모드에서는 --check, --emit, -o, -e/--eval 옵션을 사용할 수 없습니다.".to_string());
        }
        return Ok(ParsedArgs {
            mode: CliMode::Repl,
            file_path: None,
            eval_code: None,
            emit_target: None,
            output_path: None,
            check_only: false,
            trace,
            error_style,
            max_steps,
            stdin_text,
        });
    }

    if eval_code.is_some() && file_path.is_some() {
        return Err("파일 경로와 -e/--eval은 동시에 사용할 수 없습니다.".to_string());
    }

    if output_path.is_some() && emit_target.is_none() {
        return Err("-o/--output 옵션은 --emit <js|c>와 함께 사용해야 합니다.".to_string());
    }

    if emit_target.is_some() && check_only {
        return Err("--emit 옵션과 --check 옵션은 동시에 사용할 수 없습니다.".to_string());
    }

    if emit_target.is_some() && (trace || stdin_text.is_some()) {
        return Err("--emit 옵션은 --trace 또는 --stdin과 함께 사용할 수 없습니다.".to_string());
    }

    if check_only && (trace || max_steps.is_some() || stdin_text.is_some()) {
        return Err("--check 옵션은 --trace, --max-steps, --stdin과 함께 사용할 수 없습니다.".to_string());
    }

    if eval_code.is_none() && file_path.is_none() {
        return Err("실행할 .gg 파일 경로 또는 -e/--eval 코드를 입력해주세요.".to_string());
    }

    let mode = if emit_target.is_some() {
        CliMode::Emit
    } else {
        CliMode::Run
    };

    Ok(ParsedArgs {
        mode,
        file_path,
        eval_code,
        emit_target,
        output_path,
        check_only,
        trace,
        error_style,
        max_steps,
        stdin_text,
    })
}

fn read_piped_stdin(max_bytes: usize) -> Result<String, String> {
    let stdin = io::stdin();
    if stdin.is_terminal() {
        return Ok(String::new());
    }
    let mut handle = stdin.lock().take((max_bytes + 1) as u64);
    let mut buf = Vec::new();
    handle
        .read_to_end(&mut buf)
        .map_err(|e| format!("표준 입력 읽기 실패: {e}"))?;
    if buf.len() > max_bytes {
        return Err(format!("표준 입력(stdin) 크기가 최대치({max_bytes}바이트)를 초과했습니다."));
    }
    String::from_utf8(buf).map_err(|e| format!("UTF-8 디코딩 실패: {e}"))
}

fn run_cli() -> i32 {
    let argv: Vec<String> = env::args().skip(1).collect();
    let parsed = match parse_args(&argv) {
        Ok(p) => p,
        Err(msg) => {
            if !msg.is_empty() {
                eprintln!("[옵션 오류] {msg}\n");
            }
            print_usage(true);
            return 1;
        }
    };

    match parsed.mode {
        CliMode::Help => {
            print_usage(false);
            return 0;
        }
        CliMode::Version => {
            println!("gg-lang v{VERSION}");
            return 0;
        }
        CliMode::Repl => {
            let stdin = io::stdin();
            let is_tty = stdin.is_terminal();
            let cfg = ReplConfig {
                trace: parsed.trace,
                max_steps: parsed.max_steps,
                error_style: parsed.error_style,
                stdin_text: parsed.stdin_text.unwrap_or_default(),
            };
            if is_tty {
                return run_tty_repl(cfg);
            }
            return run_repl(stdin.lock(), io::stdout(), io::stderr(), false, cfg);
        }
        CliMode::Encode { has_args, text } => {
            let input_text = if has_args {
                text
            } else {
                match read_piped_stdin(MAX_STDIN_BYTES) {
                    Ok(s) => s,
                    Err(e) => {
                        eprintln!("[입력 오류] {e}");
                        return 1;
                    }
                }
            };
            println!("{}", text_to_gg(&input_text));
            return 0;
        }
        CliMode::Emit | CliMode::Run => {}
    }

    let (source, source_label) = if let Some(code) = parsed.eval_code {
        (code, "<eval>".to_string())
    } else {
        let file_path = parsed.file_path.expect("validated file_path");
        let ext = Path::new(&file_path)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if ext != "gg" {
            eprintln!("[경고] 줴줴랭 소스 파일은 '.gg' 확장자를 권장합니다. (현재: {file_path})");
        }
        match fs::metadata(&file_path) {
            Ok(meta) => {
                if !meta.is_file() {
                    eprintln!("[파일 오류] '{file_path}'은(는) 일반 파일이 아닙니다.");
                    return 1;
                }
                if meta.len() > MAX_SOURCE_BYTES {
                    eprintln!("[파일 오류] '{file_path}' 크기가 최대 허용치({MAX_SOURCE_BYTES}바이트)를 초과했습니다.");
                    return 1;
                }
            }
            Err(e) => {
                eprintln!("[파일 오류] '{file_path}'를 읽을 수 없습니다: {e}");
                return 1;
            }
        }
        match fs::read_to_string(&file_path) {
            Ok(content) => (content, file_path),
            Err(e) => {
                eprintln!("[파일 오류] '{file_path}'를 읽을 수 없습니다: {e}");
                return 1;
            }
        }
    };

    if matches!(parsed.mode, CliMode::Emit) {
        let target = parsed.emit_target.expect("validated emit_target");
        let emitted = compile_to_target(
            &source,
            target,
            EmitOptions {
                max_steps: parsed.max_steps,
                ..Default::default()
            },
        );
        if !emitted.diagnostics.is_empty() {
            for diag in &emitted.diagnostics {
                eprintln!("{}", format_diagnostic(diag, parsed.error_style));
            }
            return 1;
        }
        for warn in &emitted.warnings {
            eprintln!("[경고] {warn}");
        }
        if let Some(out_path) = &parsed.output_path {
            if let Err(e) = fs::write(out_path, &emitted.code) {
                eprintln!("[출력 오류] '{out_path}'에 쓸 수 없습니다: {e}");
                return 1;
            }
        } else {
            print!("{}", emitted.code);
        }
        return 0;
    }

    let program = compile(&source, ParseOptions::default());
    if !program.diagnostics.is_empty() {
        for diag in &program.diagnostics {
            eprintln!("{}", format_diagnostic(diag, parsed.error_style));
        }
        return 1;
    }

    if parsed.check_only {
        println!("요이~ 문법 검사 통과 ({}개 명령어)", program.instructions.len());
        return 0;
    }

    let needs_stdin = program
        .instructions
        .iter()
        .any(|ins| matches!(ins.op, OpCode::InputInt | OpCode::InputChar));
    let used_implicit_tty_stdin =
        parsed.stdin_text.is_none() && needs_stdin && io::stdin().is_terminal();

    let stdin = if let Some(explicit) = parsed.stdin_text {
        explicit
    } else if needs_stdin {
        match read_piped_stdin(MAX_STDIN_BYTES) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("[입력 오류] {e}");
                return 1;
            }
        }
    } else {
        String::new()
    };

    let mut vm = JjeJjeVM::new(
        &program,
        VMOptions {
            stdin: Some(stdin),
            max_steps: parsed.max_steps,
            ..Default::default()
        },
    );

    let state = if parsed.trace {
        let style = parsed.error_style;
        vm.run_with_trace(&mut |ev| {
            eprintln!("{}", format_trace_event(&ev, &source_label, style));
        })
    } else {
        vm.run()
    };

    if !state.output.is_empty() {
        let mut stdout = io::stdout();
        let _ = write!(stdout, "{}", state.output);
        if state.error.is_some() && !state.output.ends_with('\n') {
            let _ = writeln!(stdout);
        }
        let _ = stdout.flush();
    }

    if let Some(err) = &state.error {
        eprintln!("{}", format_diagnostic(err, parsed.error_style));
        if used_implicit_tty_stdin && err.code == "RUNTIME_STDIN_EOF" {
            eprintln!("  힌트: 대화형 터미널에서는 --stdin \"값\" 또는 파이프(echo \"값\" | gg ...)로 입력을 전달하세요.");
        }
        return 1;
    }

    0
}

fn main() {
    std::process::exit(run_cli());
}
