use std::fs;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::{SystemTime, UNIX_EPOCH};

use gg_core::{EmitOptions, EmitTarget, ParseOptions, VMOptions, compile, compile_to_target, run};
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConformanceSuite {
    cases: Vec<ConformanceCase>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConformanceCase {
    id: String,
    code: String,
    stdin: Option<String>,
    options: Option<CaseOptions>,
    expected: ExpectedResult,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CaseOptions {
    max_steps: Option<usize>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExpectedResult {
    status: String,
    output: Option<String>,
    stack: Option<Vec<String>>,
    error_codes: Option<Vec<String>>,
}

struct TempCleanup(PathBuf);
impl Drop for TempCleanup {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn run_cc_c11(code: &str, stdin: &str) -> (i32, String, String) {
    let dir = temp_dir("gg-conf-c");
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
        String::from_utf8(out.stdout).unwrap(),
        String::from_utf8_lossy(&out.stderr).into_owned(),
    )
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

#[test]
fn conformance_suite_passes_on_rust_vm_and_js_codegen() {
    let spec_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .join("spec/conformance.json");
    let raw = fs::read_to_string(spec_path).unwrap();
    let suite: ConformanceSuite = serde_json::from_str(&raw).unwrap();
    assert!(suite.cases.len() >= 30);

    let js_dir = temp_dir("gg-conf-rust");
    let _cleanup = TempCleanup(js_dir.clone());

    for tc in &suite.cases {
        let compiled = compile(&tc.code, ParseOptions::default());
        if tc.expected.status == "syntax_error" {
            assert!(
                !compiled.diagnostics.is_empty(),
                "{} expected syntax error",
                tc.id
            );
            let codes: Vec<&str> = compiled.diagnostics.iter().map(|d| d.code.as_str()).collect();
            for exp_code in tc.expected.error_codes.as_deref().unwrap_or(&[]) {
                assert!(
                    codes.contains(&exp_code.as_str()),
                    "{} missing code {}, got {:?}",
                    tc.id,
                    exp_code,
                    codes
                );
            }
            continue;
        }

        assert!(
            compiled.diagnostics.is_empty(),
            "{} unexpected syntax error: {:?}",
            tc.id,
            compiled.diagnostics
        );

        let stdin = tc.stdin.clone().unwrap_or_default();
        let max_steps = tc.options.as_ref().and_then(|o| o.max_steps);
        let state = run(
            &tc.code,
            VMOptions {
                stdin: Some(stdin.clone()),
                max_steps,
                ..Default::default()
            },
        );

        let js = compile_to_target(
            &tc.code,
            EmitTarget::Js,
            EmitOptions {
                max_steps,
                ..Default::default()
            },
        );
        let js_file = js_dir.join(format!("{}.mjs", tc.id));
        fs::write(&js_file, &js.code).unwrap();
        let mut js_child = Command::new("node")
            .arg(&js_file)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap();
        use std::io::Write;
        js_child.stdin.as_mut().unwrap().write_all(stdin.as_bytes()).unwrap();
        let js_out = js_child.wait_with_output().unwrap();
        let js_stdout = String::from_utf8(js_out.stdout).unwrap();
        let js_stderr = String::from_utf8_lossy(&js_out.stderr).into_owned();

        let c_res = compile_to_target(
            &tc.code,
            EmitTarget::C,
            EmitOptions {
                max_steps,
                ..Default::default()
            },
        );

        if tc.expected.status == "runtime_error" {
            let err = state
                .error
                .as_ref()
                .unwrap_or_else(|| panic!("{} expected runtime error", tc.id));
            assert!(err.message.contains("터져서 없어짐 수고하세요"));
            assert!(!js_out.status.success(), "{} js expected failure", tc.id);
            assert!(js_stderr.contains("터져서 없어짐 수고하세요"));

            let (c_code, _, c_err) = run_cc_c11(&c_res.code, &stdin);
            assert_ne!(c_code, 0, "{} c11 expected failure", tc.id);
            assert!(c_err.contains("터져서 없어짐 수고하세요"));

            if let Some(expected_codes) = &tc.expected.error_codes {
                assert!(
                    expected_codes.contains(&err.code),
                    "{} unexpected runtime code {}",
                    tc.id,
                    err.code
                );
                assert!(
                    expected_codes.iter().any(|code| js_stderr.contains(code)),
                    "{} js stderr missing {:?}: {}",
                    tc.id,
                    expected_codes,
                    js_stderr
                );
                assert!(
                    expected_codes.iter().any(|code| c_err.contains(code)),
                    "{} c11 stderr missing {:?}: {}",
                    tc.id,
                    expected_codes,
                    c_err
                );
            }
        } else {
            assert!(
                state.error.is_none(),
                "{} unexpected runtime error: {:?}",
                tc.id,
                state.error
            );
            if let Some(exp_out) = &tc.expected.output {
                assert_eq!(&state.output, exp_out, "{} output mismatch", tc.id);
            }
            if let Some(exp_stack) = &tc.expected.stack {
                let got_stack: Vec<String> = state.stack.iter().map(ToString::to_string).collect();
                assert_eq!(&got_stack, exp_stack, "{} stack mismatch", tc.id);
            }

            assert!(js_out.status.success(), "{} js exit failure: {js_stderr}", tc.id);
            if let Some(exp_out) = &tc.expected.output {
                assert_eq!(&js_stdout, exp_out, "{} js output mismatch", tc.id);
            }

            if c_res.warnings.is_empty() {
                let (c_code, c_stdout, c_stderr) = run_cc_c11(&c_res.code, &stdin);
                assert_eq!(c_code, 0, "{} c11 failed: {c_stderr}", tc.id);
                if let Some(exp_out) = &tc.expected.output {
                    assert_eq!(&c_stdout, exp_out, "{} c11 output mismatch", tc.id);
                }
            } else {
                let (c_code, _, c_stderr) = run_cc_c11(&c_res.code, &stdin);
                assert_ne!(c_code, 0, "{} c11 expected 64-bit overflow failure", tc.id);
                assert!(c_stderr.contains("RUNTIME_BIGINT_OVERFLOW"));
            }
        }
    }
}
