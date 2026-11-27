use std::fs;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::{SystemTime, UNIX_EPOCH};

use gg_core::{
    EmitOptions, EmitTarget, JjeJjeVM, MAX_EXPONENT, ParseOptions, TokenType, TracePhase, compile,
    compile_to_target, create_vm, encode_bigint, is_incomplete_fragment, run, text_to_gg, tokenize,
    VMOptions,
};
use num_bigint::BigInt;

fn temp_dir(prefix: &str) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let dir = std::env::temp_dir().join(format!("{prefix}-{}-{nanos}", std::process::id()));
    fs::create_dir_all(&dir).unwrap();
    dir
}

struct TempCleanup(PathBuf);
impl Drop for TempCleanup {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn run_node_js(code: &str, stdin: &str) -> (i32, String, String) {
    let dir = temp_dir("gg-rust-js");
    let _guard = TempCleanup(dir.clone());
    let file = dir.join("prog.mjs");
    fs::write(&file, code).unwrap();

    let mut child = Command::new("node")
        .arg(&file)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();

    use std::io::Write;
    child.stdin.as_mut().unwrap().write_all(stdin.as_bytes()).unwrap();
    let out = child.wait_with_output().unwrap();
    (
        out.status.code().unwrap_or(-1),
        String::from_utf8_lossy(&out.stdout).into_owned(),
        String::from_utf8_lossy(&out.stderr).into_owned(),
    )
}

fn run_cc_c11(code: &str, stdin: &str) -> (i32, String, String) {
    let dir = temp_dir("gg-rust-c");
    let _guard = TempCleanup(dir.clone());
    let src = dir.join("prog.c");
    let bin = dir.join("prog");
    fs::write(&src, code).unwrap();

    let cc = Command::new("cc")
        .args(["-std=c11", "-O2", "-Wall", "-Wextra", "-Werror"])
        .arg(&src)
        .arg("-o")
        .arg(&bin)
        .output()
        .unwrap();
    assert!(
        cc.status.success(),
        "C11 compilation failed:\n{}",
        String::from_utf8_lossy(&cc.stderr)
    );

    let mut child = Command::new(&bin)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();

    use std::io::Write;
    child.stdin.as_mut().unwrap().write_all(stdin.as_bytes()).unwrap();
    let out = child.wait_with_output().unwrap();
    (
        out.status.code().unwrap_or(-1),
        String::from_utf8_lossy(&out.stdout).into_owned(),
        String::from_utf8_lossy(&out.stderr).into_owned(),
    )
}

#[test]
fn lexer_handles_bom_comments_exponents_and_hints() {
    let lex = tokenize("\u{FEFF}요이~ 엄...//주석\n어어엄.... 지~롤? 줴줴이야");
    assert!(lex.diagnostics.is_empty());
    assert_eq!(lex.tokens.len(), 5);
    assert_eq!(lex.tokens[0].token_type, TokenType::Start);
    assert_eq!(lex.tokens[1].value, Some(BigInt::from(3)));
    assert_eq!(lex.tokens[2].value, Some(BigInt::from(400)));
    assert_eq!(lex.tokens[3].token_type, TokenType::Lt);

    let bad = tokenize("요이~ 아예? 야르 넌나가라 엄., 어엄 줴줴이야");
    assert_eq!(bad.diagnostics.len(), 5);
    assert!(bad.diagnostics[0].hint.is_some());

    let too_big = format!("요이~ {}엄. 줴줴이야", "어".repeat(MAX_EXPONENT + 1));
    let big_res = tokenize(&too_big);
    assert_eq!(big_res.diagnostics[0].code, "LEX_NUMBER_TOO_LARGE");
}

#[test]
fn parser_supports_fragments_and_unclosed_detection() {
    assert!(is_incomplete_fragment("아뇨아뇨?"));
    assert!(is_incomplete_fragment("아뇨아뇨~\n엄."));
    assert!(!is_incomplete_fragment("아뇨아뇨?\n엄.\n아뇨아뇨!"));
    assert!(!is_incomplete_fragment("어엄"));

    let frag = compile(
        "엄... 엄.. 지랄 야~~르",
        ParseOptions {
            allow_fragment: true,
        },
    );
    assert!(frag.diagnostics.is_empty());
    let mut vm = JjeJjeVM::new(&frag, VMOptions::default());
    let state = vm.run();
    assert_eq!(state.output, "5\n");
}

#[test]
fn vm_executes_stack_heap_bigint_and_trace() {
    let (_, mut vm) = create_vm(
        "요이~ 엄... 엄.. 지랄 야~~르 줴줴이야",
        VMOptions::default(),
    );
    let mut events = Vec::new();
    let state = vm.run_with_trace(&mut |ev| events.push(ev));
    assert!(state.error.is_none());
    assert_eq!(state.output, "5\n");
    assert!(events.iter().any(|e| e.phase == TracePhase::Before && e.step == 1));
    assert!(events.iter().any(|e| e.phase == TracePhase::After && e.step == 5));

    // BigInt > 64-bit
    let huge = format!("요이~ {}엄. 엄.. 지~~랄 야~~르 줴줴이야", "어".repeat(30));
    let huge_state = run(&huge, VMOptions::default());
    assert!(huge_state.error.is_none());
    assert_eq!(
        huge_state.output,
        format!("{}\n", BigInt::from(10u8).pow(30) * 2)
    );

    // Step limit emits runtime trace error and meme contract
    let (_, mut inf_vm) = create_vm(
        "요이~ 엄. 아뇨아뇨~ 아뇨아뇨! 줴줴이야",
        VMOptions {
            max_steps: Some(10),
            ..Default::default()
        },
    );
    let mut err_events = Vec::new();
    let err_state = inf_vm.run_with_trace(&mut |ev| err_events.push(ev));
    assert_eq!(err_state.error.as_ref().unwrap().code, "RUNTIME_STEP_LIMIT");
    assert!(err_state
        .error
        .as_ref()
        .unwrap()
        .message
        .contains("터져서 없어짐 수고하세요"));
    assert!(err_events.iter().any(|e| e.phase == TracePhase::Error));
}

#[test]
fn transpiler_roundtrips_unicode_and_large_bigints() {
    let sample = "안녕, 줴줴!\n🔥Line2";
    let code = text_to_gg(sample);
    let state = run(&code, VMOptions::default());
    assert!(state.error.is_none());
    assert_eq!(state.output, sample);

    let big = BigInt::from(10u8).pow(1005) + 42;
    let encoded = encode_bigint(&big);
    let prog = format!("요이~ {encoded} 야~~르 줴줴이야");
    let big_state = run(&prog, VMOptions::default());
    assert!(big_state.error.is_none());
    assert_eq!(big_state.output, format!("{big}\n"));
}

#[test]
fn codegen_matches_vm_on_js_and_c11() {
    let div_zero = "요이~ 엄..... 야~르 엄. 엄 지~~~랄 줴줴이야";
    let js = compile_to_target(div_zero, EmitTarget::Js, EmitOptions::default());
    let (js_code, js_out, js_err) = run_node_js(&js.code, "");
    assert_eq!(js_code, 1);
    assert_eq!(js_out, "5\n");
    assert!(js_err.contains("RUNTIME_DIV_ZERO"));
    assert!(js_err.contains("터져서 없어짐 수고하세요"));

    let c = compile_to_target(div_zero, EmitTarget::C, EmitOptions::default());
    assert!(c.warnings.is_empty());
    let (c_code, c_out, c_err) = run_cc_c11(&c.code, "");
    assert_eq!(c_code, 1);
    assert_eq!(c_out, "5\n");
    assert!(c_err.contains("RUNTIME_DIV_ZERO"));
    assert!(c_err.contains("터져서 없어짐 수고하세요"));

    // Huge literal emits C warning and runtime overflow while JS handles BigInt
    let huge = format!("요이~ {}엄. 야~~르 줴줴이야", "어".repeat(25));
    let js_h = compile_to_target(&huge, EmitTarget::Js, EmitOptions::default());
    let (jh_code, jh_out, _) = run_node_js(&js_h.code, "");
    assert_eq!(jh_code, 0);
    assert_eq!(jh_out, format!("{}\n", BigInt::from(10u8).pow(25)));

    let c_h = compile_to_target(&huge, EmitTarget::C, EmitOptions::default());
    assert!(!c_h.warnings.is_empty());
    let (ch_code, _, ch_err) = run_cc_c11(&c_h.code, "");
    assert_eq!(ch_code, 1);
    assert!(ch_err.contains("RUNTIME_BIGINT_OVERFLOW"));
}
