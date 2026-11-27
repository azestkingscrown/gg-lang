use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::{SystemTime, UNIX_EPOCH};

fn gg_bin() -> &'static str {
    env!("CARGO_BIN_EXE_gg")
}

fn root_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn run_gg(args: &[&str], stdin_data: Option<&str>) -> (i32, String, String) {
    let mut cmd = Command::new(gg_bin());
    cmd.current_dir(root_dir())
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = cmd.spawn().unwrap();
    if let Some(input) = stdin_data {
        child.stdin.as_mut().unwrap().write_all(input.as_bytes()).unwrap();
    }
    drop(child.stdin.take());
    let out = child.wait_with_output().unwrap();
    (
        out.status.code().unwrap_or(-1),
        String::from_utf8_lossy(&out.stdout).into_owned(),
        String::from_utf8_lossy(&out.stderr).into_owned(),
    )
}

#[test]
fn cli_runs_files_piped_stdin_eval_check_and_encode() {
    let (code, stdout, _) = run_gg(&["examples/hello.gg"], None);
    assert_eq!(code, 0);
    assert_eq!(stdout, "Hello, World!\n");

    let (code, stdout, _) = run_gg(&["run", "examples/add.gg"], Some("12 30\n"));
    assert_eq!(code, 0);
    assert_eq!(stdout, "42\n");

    let (code, stdout, _) = run_gg(&["--encode", "-h"], None);
    assert_eq!(code, 0);
    assert!(stdout.contains("야~르! // '-'"));
    assert!(stdout.contains("야~르! // 'h'"));

    let (code, stdout, _) = run_gg(&["--encode"], Some("안녕"));
    assert_eq!(code, 0);
    assert!(stdout.contains("야~르! // '안'"));
    assert!(stdout.contains("야~르! // '녕'"));

    let (code, stdout, _) = run_gg(&["examples/fibonacci.gg", "--check"], None);
    assert_eq!(code, 0);
    assert!(stdout.contains("문법 검사 통과"));

    let (code, stdout, _) = run_gg(
        &["-e", "요이~ 예? 예? 지랄 야~~르 줴줴이야", "--stdin", "15 27"],
        None,
    );
    assert_eq!(code, 0);
    assert_eq!(stdout, "42\n");
}

#[test]
fn cli_supports_trace_error_style_version_emit_and_errors() {
    let (code, stdout, _) = run_gg(&["--version"], None);
    assert_eq!(code, 0);
    assert!(stdout.starts_with("gg-lang v1.2.0"));

    let (code, stdout, stderr) = run_gg(
        &["-e", "요이~ 엄... 엄.. 지랄 야~~르 줴줴이야", "--trace"],
        None,
    );
    assert_eq!(code, 0);
    assert_eq!(stdout, "5\n");
    assert!(stderr.contains("[trace] <eval>:1:5 #1 before PUSH (엄...) stack=[]"));
    assert!(stderr.contains("#3 after ADD (지랄) stack=[5]"));

    let (code, stdout, stderr) = run_gg(
        &[
            "-e",
            "요이~ 엄..... 야~르 엄. 엄 지~~~랄 줴줴이야",
            "--trace",
            "--error-style",
            "plain",
        ],
        None,
    );
    assert_eq!(code, 1);
    assert_eq!(stdout, "5\n");
    assert!(stderr.contains("error DIV"));
    assert!(stderr.contains("[runtime] 1:21 (RUNTIME_DIV_ZERO) Division by zero"));

    let (code, _, stderr) = run_gg(&["-e", "요이~ 어엄 줴줴이야", "--error-style=plain"], None);
    assert_eq!(code, 1);
    assert!(stderr.contains("[syntax] 1:5 (LEX_MISSING_NUMBER_VALUE)"));
    assert!(!stderr.contains("힌트:"));

    let (code, _, stderr) = run_gg(&["examples"], None);
    assert_eq!(code, 1);
    assert!(stderr.contains("일반 파일이 아닙니다"));

    // Emit JS and C to temp output file
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let tmp_dir = std::env::temp_dir().join(format!("gg-cli-emit-{}-{nanos}", std::process::id()));
    fs::create_dir_all(&tmp_dir).unwrap();
    let out_c = tmp_dir.join("hello.c");
    let out_c_str = out_c.to_string_lossy().into_owned();
    let (code, _, _) = run_gg(&["examples/hello.gg", "--emit", "c", "-o", &out_c_str], None);
    assert_eq!(code, 0);
    assert!(fs::read_to_string(&out_c).unwrap().contains("int main(void)"));
    let _ = fs::remove_dir_all(&tmp_dir);
}

#[test]
fn cli_repl_preserves_state_and_handles_multiline_and_errors() {
    let script = [
        "엄... 엄..",
        ":stack",
        "지랄",
        ":stack",
        "엄.... 엄, 쥐랄!",
        ":mem",
        ":trace",
        "아뇨아뇨?",
        "엄.....",
        "야~~르",
        "아뇨아뇨!",
        ":reset",
        ":stack",
        ":mem",
        ":q",
        "",
    ]
    .join("\n");

    let (code, stdout, stderr) = run_gg(&["repl"], Some(&script));
    assert_eq!(code, 0);
    assert_eq!(
        stdout,
        "[3, 2]\n[5]\n{-1: 4}\ntrace: on\n5\n스택과 메모리를 초기화했습니다.\n[]\n{}\n"
    );
    assert!(stderr.contains("[trace] <repl>:"));

    // Syntax/runtime errors keep state cleanly
    let err_script = "엄..\n어엄\n:stack\n엄 지~~~랄\n:stack\n야~~르\n:q\n";
    let (code, stdout, stderr) = run_gg(&["repl", "--error-style", "plain"], Some(err_script));
    assert_eq!(code, 0);
    assert_eq!(stdout, "[2]\n[2, 0]\n0\n");
    assert!(stderr.contains("[syntax] 1:1 (LEX_MISSING_NUMBER_VALUE)"));
    assert!(stderr.contains("[runtime] 1:3 (RUNTIME_DIV_ZERO) Division by zero"));

    // Incomplete block at EOF returns exit code 1
    let (code, _, stderr) = run_gg(&["repl"], Some("아뇨아뇨~\n엄.\n"));
    assert_eq!(code, 1);
    assert!(stderr.contains("SYNTAX_UNCLOSED_BLOCK"));
}
