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

#[test]
fn types_serialize_exact_json_schema() {
    use gg_core::OpCode;

    let token_variants = [
        (TokenType::Start, "START"),
        (TokenType::Halt, "HALT"),
        (TokenType::Push, "PUSH"),
        (TokenType::InputInt, "INPUT_INT"),
        (TokenType::InputChar, "INPUT_CHAR"),
        (TokenType::PrintInt, "PRINT_INT"),
        (TokenType::PrintIntLn, "PRINT_INT_LN"),
        (TokenType::PrintChar, "PRINT_CHAR"),
        (TokenType::Add, "ADD"),
        (TokenType::Sub, "SUB"),
        (TokenType::Mul, "MUL"),
        (TokenType::Div, "DIV"),
        (TokenType::Mod, "MOD"),
        (TokenType::Eq, "EQ"),
        (TokenType::Lt, "LT"),
        (TokenType::GT, "GT"),
        (TokenType::Dup, "DUP"),
        (TokenType::Swap, "SWAP"),
        (TokenType::Over, "OVER"),
        (TokenType::Rot, "ROT"),
        (TokenType::Depth, "DEPTH"),
        (TokenType::Store, "STORE"),
        (TokenType::Load, "LOAD"),
        (TokenType::Not, "NOT"),
        (TokenType::If, "IF"),
        (TokenType::Else, "ELSE"),
        (TokenType::While, "WHILE"),
        (TokenType::End, "END"),
        (TokenType::Continue, "CONTINUE"),
        (TokenType::Pop, "POP"),
        (TokenType::Break, "BREAK"),
    ];
    for (variant, expected) in token_variants {
        assert_eq!(serde_json::to_string(&variant).unwrap(), format!("\"{expected}\""));
        assert_eq!(variant.as_str(), expected);
    }

    let op_variants = [
        (OpCode::Push, "PUSH"),
        (OpCode::Pop, "POP"),
        (OpCode::Dup, "DUP"),
        (OpCode::Swap, "SWAP"),
        (OpCode::Over, "OVER"),
        (OpCode::Rot, "ROT"),
        (OpCode::Depth, "DEPTH"),
        (OpCode::Add, "ADD"),
        (OpCode::Sub, "SUB"),
        (OpCode::Mul, "MUL"),
        (OpCode::Div, "DIV"),
        (OpCode::Mod, "MOD"),
        (OpCode::Eq, "EQ"),
        (OpCode::Lt, "LT"),
        (OpCode::Gt, "GT"),
        (OpCode::Not, "NOT"),
        (OpCode::Store, "STORE"),
        (OpCode::Load, "LOAD"),
        (OpCode::InputInt, "INPUT_INT"),
        (OpCode::InputChar, "INPUT_CHAR"),
        (OpCode::PrintInt, "PRINT_INT"),
        (OpCode::PrintIntLn, "PRINT_INT_LN"),
        (OpCode::PrintChar, "PRINT_CHAR"),
        (OpCode::Jz, "JZ"),
        (OpCode::JzPeek, "JZ_PEEK"),
        (OpCode::Jmp, "JMP"),
        (OpCode::Halt, "HALT"),
    ];
    for (op, expected) in op_variants {
        assert_eq!(serde_json::to_string(&op).unwrap(), format!("\"{expected}\""));
        assert_eq!(op.as_str(), expected);
    }

    let (_, mut vm) = create_vm("요이~ 엄.. 엄. 지~~랄? 야~~르 줴줴이야", VMOptions::default());
    assert!(vm.step());
    assert!(vm.step());
    let state_json = serde_json::to_value(vm.get_state().to_json()).unwrap();
    assert_eq!(state_json["currentToken"]["type"], "GT");
}

#[test]
fn vm_enforces_dos_limits_and_stdin_cursor() {
    use gg_core::{CompiledProgram, Instruction, MAX_STDIN_INT_DIGITS, OpCode, Operand, Token};

    // Stack overflow
    let stack_err = run(
        "요이~ 엄. 엄.. 엄... 줴줴이야",
        VMOptions {
            max_stack_size: Some(2),
            ..Default::default()
        },
    );
    assert_eq!(stack_err.error.unwrap().code, "RUNTIME_STACK_OVERFLOW");

    // Memory overflow
    let mem_err = run(
        "요이~ 엄. 엄. 쥐랄! 엄.. 엄.. 쥐랄! 줴줴이야",
        VMOptions {
            max_memory_size: Some(1),
            ..Default::default()
        },
    );
    assert_eq!(mem_err.error.unwrap().code, "RUNTIME_MEMORY_OVERFLOW");

    // BigInt bit limit via arithmetic
    let bits_err = run(
        "요이~ 어어어엄. 쥐랄 지~~랄 쥐랄 지~~랄 줴줴이야",
        VMOptions {
            max_bigint_bits: Some(32),
            ..Default::default()
        },
    );
    assert_eq!(bits_err.error.unwrap().code, "RUNTIME_BIGINT_OVERFLOW");

    // BigInt digit limit via stdin
    let huge_stdin = "1".repeat(MAX_STDIN_INT_DIGITS + 1);
    let stdin_big_err = run(
        "요이~ 예? 야~~르 줴줴이야",
        VMOptions {
            stdin: Some(huge_stdin),
            ..Default::default()
        },
    );
    assert_eq!(stdin_big_err.error.unwrap().code, "RUNTIME_BIGINT_OVERFLOW");

    // Output length limit
    let out_err = run(
        "요이~ 엄. 엄. 엄. 엄. 야~르 야~르 야~르 야~르 줴줴이야",
        VMOptions {
            max_output_length: Some(3),
            ..Default::default()
        },
    );
    assert_eq!(out_err.error.unwrap().code, "RUNTIME_OUTPUT_LIMIT");

    // Stack underflows across operator categories
    for prog in [
        "요이~ 아뇨 줴줴이야",
        "요이~ 엄. 지랄 줴줴이야",
        "요이~ 야~르 줴줴이야",
        "요이~ 엄. 쥐랄! 줴줴이야",
        "요이~ 쥐~랄! 줴줴이야",
        "요이~ 아뇨아뇨? 아뇨아뇨! 줴줴이야",
        "요이~ 아뇨아뇨~ 아뇨아뇨! 줴줴이야",
    ] {
        let state = run(prog, VMOptions::default());
        assert_eq!(
            state.error.as_ref().unwrap().code,
            "RUNTIME_STACK_UNDERFLOW",
            "program: {prog}"
        );
    }

    // Invalid jump target guard
    let dummy_prog = CompiledProgram {
        instructions: vec![Instruction {
            op: OpCode::Jmp,
            operand: Some(Operand::Jump(99)),
            token: Token {
                token_type: TokenType::Continue,
                raw: "아뇨아뇨아뇨".to_string(),
                value: None,
                line: 1,
                column: 1,
                end_column: 7,
            },
        }],
        tokens: Vec::new(),
        diagnostics: Vec::new(),
    };
    let mut bad_jmp_vm = JjeJjeVM::new(&dummy_prog, VMOptions::default());
    assert_eq!(
        bad_jmp_vm.run().error.unwrap().code,
        "RUNTIME_INVALID_JUMP"
    );

    // Resumable stdin cursor via initial_stdin_pos & stdin_pos()
    let frag = compile(
        "예? 야~~르",
        ParseOptions {
            allow_fragment: true,
        },
    );
    assert!(frag.diagnostics.is_empty());
    let shared_stdin = "10 20".to_string();
    let mut vm1 = JjeJjeVM::new(
        &frag,
        VMOptions {
            stdin: Some(shared_stdin.clone()),
            ..Default::default()
        },
    );
    let st1 = vm1.run();
    assert_eq!(st1.output, "10\n");
    let pos_after_first = vm1.stdin_pos();
    assert_eq!(pos_after_first, 2);

    let mut vm2 = JjeJjeVM::new(
        &frag,
        VMOptions {
            stdin: Some(shared_stdin),
            initial_stdin_pos: Some(pos_after_first),
            ..Default::default()
        },
    );
    let st2 = vm2.run();
    assert_eq!(st2.output, "20\n");
}
