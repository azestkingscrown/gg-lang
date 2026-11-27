use std::collections::BTreeMap;
use std::io::{BufRead, Write};

use gg_core::{JjeJjeVM, ParseOptions, VMOptions, compile, is_incomplete_fragment};
use num_bigint::BigInt;

use crate::format::{ErrorStyle, format_diagnostic, format_trace_event};

pub struct ReplConfig {
    pub trace: bool,
    pub max_steps: Option<usize>,
    pub error_style: ErrorStyle,
    pub stdin_text: String,
}

fn format_stack_line(stack: &[BigInt]) -> String {
    let items: Vec<String> = stack.iter().map(ToString::to_string).collect();
    format!("[{}]", items.join(", "))
}

fn format_memory_line(memory: &BTreeMap<BigInt, BigInt>) -> String {
    if memory.is_empty() {
        return "{}".to_string();
    }
    let pairs: Vec<String> = memory.iter().map(|(k, v)| format!("{k}: {v}")).collect();
    format!("{{{}}}", pairs.join(", "))
}

fn write_repl_help<W: Write>(out: &mut W) {
    let _ = out.write_all(
        b"\xec\xa4\xbc\xec\xa4\xbc\xeb\x9e\xad REPL \xeb\xaa\x85\xeb\xa0\xb9\xec\x96\xb4:
  :help, :h        \xeb\x8f\x84\xec\x9b\x80\xeb\xa7\x90 \xed\x91\x9c\xec\x8b\x9c
  :stack           \xed\x98\x84\xec\x9e\xac \xec\x8a\xa4\xed\x83\x9d \xed\x91\x9c\xec\x8b\x9c (bottom -> top)
  :mem             \xed\x98\x84\xec\x9e\xac \xed\x9e\x99 \xeb\xa9\x94\xeb\xaa\xa8\xeb\xa6\xac \xed\x91\x9c\xec\x8b\x9c (\xec\xa3\xbc\xec\x86\x8c \xec\x98\xa4\xeb\xa6\x84\xec\xb0\xa8\xec\x88\x9c)
  :reset           \xec\x8a\xa4\xed\x83\x9d, \xed\x9e\x99 \xeb\xa9\x94\xeb\xaa\xa8\xeb\xa6\xac, \xec\x9e\x85\xeb\xa0\xa5 \xeb\xb2\x84\xed\x8d\xbc \xec\xb4\x88\xea\xb8\xb0\xed\x99\x94
  :trace           \xec\x8b\xa4\xed\x96\x89 \xed\x8a\xb8\xeb\xa0\x88\xec\x9d\xb4\xec\x8a\xa4 \xec\xb6\x9c\xeb\xa0\xa5 \xec\xbc\x9c\xea\xb8\xb0/\xeb\x81\x84\xea\xb8\xb0
  :q, :quit        REPL \xec\xa2\x85\xeb\xa3\x8c

\xec\x9d\xbc\xeb\xb0\x98 \xec\xa4\xbc\xec\xa4\xbc\xeb\x9e\xad \xec\xa1\xb0\xea\xb0\x81(\xec\x9a\x94\xec\x9d\xb4~/\xec\xa4\xbc\xec\xa4\xbc\xec\x9d\xb4\xec\x95\xbc \xec\x83\x9d\xeb\x9e\xb5 \xea\xb0\x80\xeb\x8a\xa5)\xec\x9d\x84 \xec\x9e\x85\xeb\xa0\xa5\xed\x95\x98\xeb\xa9\xb4 \xec\xa6\x89\xec\x8b\x9c \xec\x8b\xa4\xed\x96\x89\xeb\x90\x98\xeb\xa9\xb0 \xec\x8a\xa4\xed\x83\x9d/\xeb\xa9\x94\xeb\xaa\xa8\xeb\xa6\xac\xea\xb0\x80 \xec\x9c\xa0\xec\xa7\x80\xeb\x90\xa9\xeb\x8b\x88\xeb\x8b\xa4.
\xec\x97\xb4\xeb\xa6\xb0 \xeb\xb8\x94\xeb\xa1\x9d(\xec\x95\x84\xeb\x87\xa8\xec\x95\x84\xeb\x87\xa8?, \xec\x95\x84\xeb\x87\xa8\xec\x95\x84\xeb\x87\xa8~)\xec\x9d\x80 \xeb\x8b\xab\xeb\x8a\x94 \xec\x95\x84\xeb\x87\xa8\xec\x95\x84\xeb\x87\xa8!\xea\xb0\x80 \xeb\x82\x98\xec\x98\xac \xeb\x95\x8c\xea\xb9\x8c\xec\xa7\x80 \xeb\x8b\xa4\xec\x9d\x8c \xec\xa4\x84\xeb\xa1\x9c \xec\x9d\xb4\xec\x96\xb4\xec\xa7\x91\xeb\x8b\x88\xeb\x8b\xa4.
",
    );
}

pub fn run_repl<R: BufRead, W: Write, E: Write>(
    mut reader: R,
    mut out: W,
    mut err: E,
    is_tty: bool,
    cfg: ReplConfig,
) -> i32 {
    let mut stack: Vec<BigInt> = Vec::new();
    let mut memory: BTreeMap<BigInt, BigInt> = BTreeMap::new();
    let mut trace_enabled = cfg.trace;
    let mut buffer = String::new();
    let mut exit_code = 0i32;
    let mut quit_requested = false;

    if is_tty {
        let _ = writeln!(out, "줴줴랭 (gg-lang) REPL — :help 도움말, :q 종료");
        let _ = write!(out, "gg> ");
        let _ = out.flush();
    }

    let mut raw_line = String::new();
    loop {
        raw_line.clear();
        match reader.read_line(&mut raw_line) {
            Ok(0) => break,
            Ok(_) => {}
            Err(e) => {
                let _ = writeln!(err, "[입력 오류] {e}");
                exit_code = 1;
                break;
            }
        }

        let line = raw_line.trim_end_matches(['\r', '\n']);
        let trimmed = line.trim();

        if buffer.is_empty() && trimmed.starts_with(':') {
            let cmd = trimmed.to_lowercase();
            match cmd.as_str() {
                ":q" | ":quit" | ":exit" => {
                    quit_requested = true;
                    break;
                }
                ":help" | ":h" => write_repl_help(&mut out),
                ":stack" => {
                    let _ = writeln!(out, "{}", format_stack_line(&stack));
                }
                ":mem" => {
                    let _ = writeln!(out, "{}", format_memory_line(&memory));
                }
                ":reset" => {
                    stack.clear();
                    memory.clear();
                    buffer.clear();
                    let _ = writeln!(out, "스택과 메모리를 초기화했습니다.");
                }
                ":trace" => {
                    trace_enabled = !trace_enabled;
                    let _ = writeln!(out, "trace: {}", if trace_enabled { "on" } else { "off" });
                }
                _ => {
                    let _ = writeln!(err, "알 수 없는 REPL 명령입니다: {trimmed} (:help 참고)");
                }
            }
            let _ = out.flush();
            if is_tty {
                let _ = write!(out, "gg> ");
                let _ = out.flush();
            }
            continue;
        }

        if buffer.is_empty() {
            buffer.push_str(line);
        } else {
            buffer.push('\n');
            buffer.push_str(line);
        }

        if buffer.trim().is_empty() {
            buffer.clear();
            if is_tty {
                let _ = write!(out, "gg> ");
                let _ = out.flush();
            }
            continue;
        }

        if is_incomplete_fragment(&buffer) {
            if is_tty {
                let _ = write!(out, "...> ");
                let _ = out.flush();
            }
            continue;
        }

        let source = std::mem::take(&mut buffer);
        let program = compile(
            &source,
            ParseOptions {
                allow_fragment: true,
            },
        );
        if !program.diagnostics.is_empty() {
            for diag in &program.diagnostics {
                let _ = writeln!(err, "{}", format_diagnostic(diag, cfg.error_style));
            }
            if is_tty {
                let _ = write!(out, "gg> ");
                let _ = out.flush();
            }
            continue;
        }

        if !program.instructions.is_empty() {
            let mut vm = JjeJjeVM::new(
                &program,
                VMOptions {
                    stdin: Some(cfg.stdin_text.clone()),
                    max_steps: cfg.max_steps,
                    initial_stack: Some(std::mem::take(&mut stack)),
                    initial_memory: Some(std::mem::take(&mut memory)),
                    ..Default::default()
                },
            );

            let state = if trace_enabled {
                let style = cfg.error_style;
                vm.run_with_trace(&mut |ev| {
                    let _ = writeln!(err, "{}", format_trace_event(&ev, "<repl>", style));
                })
            } else {
                vm.run()
            };

            if !state.output.is_empty() {
                let _ = write!(out, "{}", state.output);
                if (is_tty || state.error.is_some()) && !state.output.ends_with('\n') {
                    let _ = writeln!(out);
                }
                let _ = out.flush();
            }

            stack = state.stack;
            memory = state.memory.into_iter().collect();

            if let Some(err_diag) = &state.error {
                let _ = writeln!(err, "{}", format_diagnostic(err_diag, cfg.error_style));
            }
        }

        if is_tty {
            let _ = write!(out, "gg> ");
            let _ = out.flush();
        }
    }

    if !quit_requested && !buffer.trim().is_empty() {
        let program = compile(
            &buffer,
            ParseOptions {
                allow_fragment: true,
            },
        );
        for diag in &program.diagnostics {
            let _ = writeln!(err, "{}", format_diagnostic(diag, cfg.error_style));
        }
        if !program.diagnostics.is_empty() {
            exit_code = 1;
        }
    }

    exit_code
}
