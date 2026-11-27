use std::fs;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::{SystemTime, UNIX_EPOCH};

use gg_core::{EmitOptions, EmitTarget, ParseOptions, VMOptions, compile, compile_to_target, run};

fn examples_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .join("examples")
}

fn read_example(name: &str) -> String {
    fs::read_to_string(examples_dir().join(name)).unwrap()
}

struct TempCleanup(PathBuf);
impl Drop for TempCleanup {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn temp_dir(prefix: &str) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let dir = std::env::temp_dir().join(format!("{prefix}-{}-{nanos}", std::process::id()));
    fs::create_dir_all(&dir).unwrap();
    dir
}

fn run_node_js(code: &str, stdin: &str) -> String {
    let dir = temp_dir("gg-ex-js");
    let _guard = TempCleanup(dir.clone());
    let file = dir.join("ex.mjs");
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
    assert!(
        out.status.success(),
        "node failed: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8(out.stdout).unwrap()
}

fn run_cc_c11(code: &str, stdin: &str) -> String {
    let dir = temp_dir("gg-ex-c");
    let _guard = TempCleanup(dir.clone());
    let src = dir.join("ex.c");
    let bin = dir.join("ex");
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
        "cc failed: {}",
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
    assert!(
        out.status.success(),
        "c bin failed: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8(out.stdout).unwrap()
}

#[test]
fn all_16_examples_match_expected_outputs_on_vm_js_and_c11() {
    let cases: [(&str, &str, &str); 16] = [
        ("hello.gg", "", "Hello, World!\n"),
        ("hangul.gg", "", "안녕, 줴줴!\n"),
        ("add.gg", "12 30", "42\n"),
        ("countdown.gg", "", "5\n4\n3\n2\n1\n"),
        ("fibonacci.gg", "", "0 1 1 2 3 5 8 13 21 34\n"),
        ("truth_machine.gg", "0", "0\n"),
        ("factorial.gg", "10", "3628800\n"),
        ("gcd.gg", "48 18", "6\n"),
        ("is_prime.gg", "97", "1\n"),
        (
            "gugudan.gg",
            "7",
            "7 x 1 = 7\n7 x 2 = 14\n7 x 3 = 21\n7 x 4 = 28\n7 x 5 = 35\n7 x 6 = 42\n7 x 7 = 49\n7 x 8 = 56\n7 x 9 = 63\n",
        ),
        ("sort.gg", "5\n5 3 -2 9 0", "-2 0 3 5 9\n"),
        ("reverse.gg", "줴줴🔥ABC", "CBA🔥줴줴"),
        (
            "99bottles.gg",
            "3",
            "3 bottles of beer on the wall, 3 bottles of beer.\nTake one down and pass it around, 2 bottles of beer on the wall.\n2 bottles of beer on the wall, 2 bottles of beer.\nTake one down and pass it around, 1 bottle of beer on the wall.\n1 bottle of beer on the wall, 1 bottle of beer.\nTake one down and pass it around, no more bottles of beer on the wall.\n",
        ),
        ("palindrome.gg", "기러기", "1\n"),
        ("caesar_cipher.gg", "3\nHello, 줴줴!", "Khoor, 줴줴!"),
        ("rpn_calc.gg", "3 4 + 2 * 7 -", "7\n"),
    ];

    for (file, stdin, expected) in cases {
        let code = read_example(file);
        let compiled = compile(&code, ParseOptions::default());
        assert!(compiled.diagnostics.is_empty(), "{file} syntax error");

        let vm_state = run(
            &code,
            VMOptions {
                stdin: Some(stdin.to_string()),
                ..Default::default()
            },
        );
        assert!(vm_state.error.is_none(), "{file} vm runtime error");
        assert_eq!(vm_state.output, expected, "{file} vm output");

        let js = compile_to_target(&code, EmitTarget::Js, EmitOptions::default());
        assert!(js.diagnostics.is_empty());
        assert_eq!(run_node_js(&js.code, stdin), expected, "{file} js parity");

        let c = compile_to_target(&code, EmitTarget::C, EmitOptions::default());
        assert!(c.diagnostics.is_empty());
        assert!(c.warnings.is_empty());
        assert_eq!(run_cc_c11(&c.code, stdin), expected, "{file} c parity");
    }
}

#[test]
fn algorithm_edge_cases_pass() {
    let tm = read_example("truth_machine.gg");
    let tm1 = run(
        &tm,
        VMOptions {
            stdin: Some("1".to_string()),
            max_steps: Some(50),
            ..Default::default()
        },
    );
    assert_eq!(tm1.error.as_ref().unwrap().code, "RUNTIME_STEP_LIMIT");
    assert!(tm1.output.starts_with("1\n1\n"));

    let fac = read_example("factorial.gg");
    assert_eq!(
        run(
            &fac,
            VMOptions {
                stdin: Some("30".to_string()),
                ..Default::default()
            }
        )
        .output,
        "265252859812191058636308480000000\n"
    );

    let rpn = read_example("rpn_calc.gg");
    assert_eq!(
        run(
            &rpn,
            VMOptions {
                stdin: Some("-5 8 + 10 *".to_string()),
                ..Default::default()
            }
        )
        .output,
        "30\n"
    );
}
