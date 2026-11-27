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

#[test]
fn conformance_suite_passes_on_rust_vm_and_js_codegen() {
    let spec_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .join("spec/conformance.json");
    let raw = fs::read_to_string(spec_path).unwrap();
    let suite: ConformanceSuite = serde_json::from_str(&raw).unwrap();
    assert!(suite.cases.len() >= 30);

    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let js_dir = std::env::temp_dir().join(format!("gg-conf-rust-{}-{nanos}", std::process::id()));
    fs::create_dir_all(&js_dir).unwrap();
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

        if tc.expected.status == "runtime_error" {
            let err = state
                .error
                .as_ref()
                .unwrap_or_else(|| panic!("{} expected runtime error", tc.id));
            assert!(err.message.contains("터져서 없어짐 수고하세요"));
            if let Some(expected_codes) = &tc.expected.error_codes {
                assert!(
                    expected_codes.contains(&err.code),
                    "{} unexpected runtime code {}",
                    tc.id,
                    err.code
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

            // Also verify --emit js produces identical stdout
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
            let mut child = Command::new("node")
                .arg(&js_file)
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .unwrap();
            use std::io::Write;
            child.stdin.as_mut().unwrap().write_all(stdin.as_bytes()).unwrap();
            let out = child.wait_with_output().unwrap();
            assert!(out.status.success(), "{} js exit failure", tc.id);
            if let Some(exp_out) = &tc.expected.output {
                assert_eq!(
                    String::from_utf8(out.stdout).unwrap(),
                    *exp_out,
                    "{} js output mismatch",
                    tc.id
                );
            }
        }
    }
}
