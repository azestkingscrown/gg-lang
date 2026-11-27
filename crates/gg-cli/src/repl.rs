use std::collections::BTreeMap;
use std::io::{self, BufRead, Write};

use gg_core::{JjeJjeVM, ParseOptions, VMOptions, compile, is_incomplete_fragment};
use num_bigint::BigInt;
use rustyline::DefaultEditor;
use rustyline::error::ReadlineError;

use crate::format::{ErrorStyle, format_diagnostic, format_trace_event};

pub struct ReplConfig {
    pub trace: bool,
    pub max_steps: Option<usize>,
    pub error_style: ErrorStyle,
    pub stdin_text: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum LineOutcome {
    Continue,
    Quit,
}

struct ReplSession {
    stack: Vec<BigInt>,
    memory: BTreeMap<BigInt, BigInt>,
    trace_enabled: bool,
    buffer: String,
    stdin_pos: usize,
    exit_code: i32,
    quit_requested: bool,
    is_tty: bool,
    cfg: ReplConfig,
}

impl ReplSession {
    fn new(is_tty: bool, cfg: ReplConfig) -> Self {
        Self {
            stack: Vec::new(),
            memory: BTreeMap::new(),
            trace_enabled: cfg.trace,
            buffer: String::new(),
            stdin_pos: 0,
            exit_code: 0,
            quit_requested: false,
            is_tty,
            cfg,
        }
    }

    fn prompt(&self) -> &'static str {
        if self.buffer.is_empty() {
            "gg> "
        } else {
            "...> "
        }
    }

    fn handle_meta_command<W: Write, E: Write>(
        &mut self,
        trimmed: &str,
        out: &mut W,
        err: &mut E,
    ) -> LineOutcome {
        match trimmed.to_lowercase().as_str() {
            ":q" | ":quit" | ":exit" => {
                self.quit_requested = true;
                LineOutcome::Quit
            }
            ":help" | ":h" => {
                write_repl_help(out);
                let _ = out.flush();
                LineOutcome::Continue
            }
            ":stack" => {
                let _ = writeln!(out, "{}", format_stack_line(&self.stack));
                let _ = out.flush();
                LineOutcome::Continue
            }
            ":mem" => {
                let _ = writeln!(out, "{}", format_memory_line(&self.memory));
                let _ = out.flush();
                LineOutcome::Continue
            }
            ":reset" => {
                self.stack.clear();
                self.memory.clear();
                self.buffer.clear();
                self.stdin_pos = 0;
                let _ = writeln!(out, "스택과 메모리를 초기화했습니다.");
                let _ = out.flush();
                LineOutcome::Continue
            }
            ":trace" => {
                self.trace_enabled = !self.trace_enabled;
                let _ = writeln!(out, "trace: {}", if self.trace_enabled { "on" } else { "off" });
                let _ = out.flush();
                LineOutcome::Continue
            }
            _ => {
                let _ = writeln!(err, "알 수 없는 REPL 명령입니다: {trimmed} (:help 참고)");
                let _ = err.flush();
                LineOutcome::Continue
            }
        }
    }

    fn process_line<W: Write, E: Write>(
        &mut self,
        raw_line: &str,
        out: &mut W,
        err: &mut E,
    ) -> LineOutcome {
        let line = raw_line.trim_end_matches(['\r', '\n']);
        let trimmed = line.trim();

        if trimmed.starts_with(':') {
            return self.handle_meta_command(trimmed, out, err);
        }

        if self.buffer.is_empty() {
            self.buffer.push_str(line);
        } else {
            self.buffer.push('\n');
            self.buffer.push_str(line);
        }

        if self.buffer.trim().is_empty() {
            self.buffer.clear();
            return LineOutcome::Continue;
        }

        if is_incomplete_fragment(&self.buffer) {
            return LineOutcome::Continue;
        }

        let source = std::mem::take(&mut self.buffer);
        let program = compile(
            &source,
            ParseOptions {
                allow_fragment: true,
            },
        );
        if !program.diagnostics.is_empty() {
            for diag in &program.diagnostics {
                let _ = writeln!(err, "{}", format_diagnostic(diag, self.cfg.error_style));
            }
            let _ = err.flush();
            return LineOutcome::Continue;
        }

        if !program.instructions.is_empty() {
            let mut vm = JjeJjeVM::new(
                &program,
                VMOptions {
                    stdin: Some(self.cfg.stdin_text.clone()),
                    initial_stdin_pos: Some(self.stdin_pos),
                    max_steps: self.cfg.max_steps,
                    initial_stack: Some(std::mem::take(&mut self.stack)),
                    initial_memory: Some(std::mem::take(&mut self.memory)),
                    ..Default::default()
                },
            );

            let state = if self.trace_enabled {
                let style = self.cfg.error_style;
                vm.run_with_trace(&mut |ev| {
                    let _ = writeln!(err, "{}", format_trace_event(&ev, "<repl>", style));
                })
            } else {
                vm.run()
            };

            self.stdin_pos = vm.stdin_pos();

            if !state.output.is_empty() {
                let _ = write!(out, "{}", state.output);
                if (self.is_tty || state.error.is_some()) && !state.output.ends_with('\n') {
                    let _ = writeln!(out);
                }
                let _ = out.flush();
            }

            self.stack = state.stack;
            self.memory = state.memory.into_iter().collect();

            if let Some(err_diag) = &state.error {
                let _ = writeln!(err, "{}", format_diagnostic(err_diag, self.cfg.error_style));
                let _ = err.flush();
            }
        }

        LineOutcome::Continue
    }

    fn finish_eof<E: Write>(&mut self, err: &mut E) -> i32 {
        if !self.quit_requested && !self.buffer.trim().is_empty() {
            let program = compile(
                &self.buffer,
                ParseOptions {
                    allow_fragment: true,
                },
            );
            for diag in &program.diagnostics {
                let _ = writeln!(err, "{}", format_diagnostic(diag, self.cfg.error_style));
            }
            let _ = err.flush();
            if !program.diagnostics.is_empty() {
                self.exit_code = 1;
            }
        }
        self.exit_code
    }
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
    let _ = write!(
        out,
        "줴줴랭 REPL 명령어:
  :help, :h        도움말 표시
  :stack           현재 스택 표시 (bottom -> top)
  :mem             현재 힙 메모리 표시 (주소 오름차순)
  :reset           스택, 힙 메모리, 입력 버퍼 및 stdin 커서 초기화
  :trace           실행 트레이스 출력 켜기/끄기
  :q, :quit        REPL 종료

일반 줴줴랭 조각(요이~/줴줴이야 생략 가능)을 입력하면 즉시 실행되며 스택/메모리가 유지됩니다.
열린 블록(아뇨아뇨?, 아뇨아뇨~)은 닫는 아뇨아뇨!가 나올 때까지 다음 줄로 이어집니다.
"
    );
}

pub fn run_repl<R: BufRead, W: Write, E: Write>(
    mut reader: R,
    mut out: W,
    mut err: E,
    is_tty: bool,
    cfg: ReplConfig,
) -> i32 {
    let mut session = ReplSession::new(is_tty, cfg);

    if is_tty {
        let _ = writeln!(out, "줴줴랭 (gg-lang) REPL — :help 도움말, :q 종료");
        let _ = write!(out, "{}", session.prompt());
        let _ = out.flush();
    }

    let mut raw_line = String::new();
    loop {
        raw_line.clear();
        match reader.read_line(&mut raw_line) {
            Ok(0) => {
                if is_tty {
                    let _ = writeln!(out);
                    let _ = out.flush();
                }
                break;
            }
            Ok(_) => {}
            Err(e) => {
                let _ = writeln!(err, "[입력 오류] {e}");
                session.exit_code = 1;
                break;
            }
        }

        if session.process_line(&raw_line, &mut out, &mut err) == LineOutcome::Quit {
            break;
        }

        if is_tty {
            let _ = write!(out, "{}", session.prompt());
            let _ = out.flush();
        }
    }

    session.finish_eof(&mut err)
}

pub fn run_tty_repl(cfg: ReplConfig) -> i32 {
    let mut rl = match DefaultEditor::new() {
        Ok(editor) => editor,
        Err(_) => {
            let stdin = io::stdin();
            return run_repl(stdin.lock(), io::stdout(), io::stderr(), true, cfg);
        }
    };

    let mut out = io::stdout();
    let mut err = io::stderr();
    let mut session = ReplSession::new(true, cfg);

    let _ = writeln!(out, "줴줴랭 (gg-lang) REPL — :help 도움말, :q 종료");
    let _ = out.flush();

    loop {
        match rl.readline(session.prompt()) {
            Ok(line) => {
                if !line.trim().is_empty() {
                    let _ = rl.add_history_entry(&line);
                }
                if session.process_line(&line, &mut out, &mut err) == LineOutcome::Quit {
                    break;
                }
            }
            Err(ReadlineError::Interrupted) => {
                if !session.buffer.is_empty() {
                    session.buffer.clear();
                    let _ = writeln!(out, "^C (멀티라인 입력 버퍼 초기화)");
                } else {
                    let _ = writeln!(out, "^C (:q 또는 Ctrl-D로 종료)");
                }
                let _ = out.flush();
            }
            Err(ReadlineError::Eof) => {
                let _ = out.flush();
                break;
            }
            Err(e) => {
                let _ = writeln!(err, "[입력 오류] {e}");
                session.exit_code = 1;
                break;
            }
        }
    }

    session.finish_eof(&mut err)
}
