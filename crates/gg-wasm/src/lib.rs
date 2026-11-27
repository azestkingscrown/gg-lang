use gg_core::{
    Diagnostic, EmitOptions, EmitTarget, JjeJjeVM, OpCode, ParseOptions, Token, TraceEvent,
    TracePhase, VMOptions, VMStateJson, analyze, compile, compile_to_target, create_vm,
    encode_bigint, is_incomplete_fragment, text_to_gg,
};
use num_bigint::BigInt;
use serde::Serialize;
use wasm_bindgen::prelude::*;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RunResponse {
    diagnostics: Vec<Diagnostic>,
    state: VMStateJson,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TraceEventJson {
    step: usize,
    ip: usize,
    op: OpCode,
    token: Token,
    phase: TracePhase,
    stack: Vec<String>,
    memory_size: usize,
    error: Option<Diagnostic>,
}

impl From<TraceEvent> for TraceEventJson {
    fn from(ev: TraceEvent) -> Self {
        Self {
            step: ev.step,
            ip: ev.ip,
            op: ev.op,
            token: ev.token,
            phase: ev.phase,
            stack: ev.stack.iter().map(ToString::to_string).collect(),
            memory_size: ev.memory_size,
            error: ev.error,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RunWithTraceResponse {
    diagnostics: Vec<Diagnostic>,
    state: VMStateJson,
    trace: Vec<TraceEventJson>,
    trace_truncated: bool,
}

fn serialize_json<T: Serialize>(value: &T) -> Result<String, JsValue> {
    serde_json::to_string(value)
        .map_err(|err| JsValue::from_str(&format!("JSON serialization error: {err}")))
}

#[wasm_bindgen]
pub fn wasm_analyze(source: &str, allow_fragment: bool) -> Result<String, JsValue> {
    let diagnostics = analyze(source, ParseOptions { allow_fragment });
    serialize_json(&diagnostics)
}

#[wasm_bindgen]
pub fn wasm_run(source: &str, stdin: &str, max_steps: Option<u32>) -> Result<String, JsValue> {
    let options = VMOptions {
        stdin: Some(stdin.to_string()),
        max_steps: max_steps.map(|s| s as usize),
        ..VMOptions::default()
    };
    let (program, mut vm) = create_vm(source, options);
    let state = vm.run().to_json();
    serialize_json(&RunResponse {
        diagnostics: program.diagnostics,
        state,
    })
}

#[wasm_bindgen]
pub fn wasm_run_with_trace(
    source: &str,
    stdin: &str,
    max_steps: Option<u32>,
    max_events: Option<u32>,
) -> Result<String, JsValue> {
    let options = VMOptions {
        stdin: Some(stdin.to_string()),
        max_steps: max_steps.map(|s| s as usize),
        ..VMOptions::default()
    };
    let (program, mut vm) = create_vm(source, options);
    let limit = max_events.unwrap_or(5_000) as usize;
    let mut trace = Vec::new();
    let mut trace_truncated = false;
    let state = vm
        .run_with_trace(&mut |ev| {
            if trace.len() < limit {
                trace.push(TraceEventJson::from(ev));
            } else {
                trace_truncated = true;
            }
        })
        .to_json();
    serialize_json(&RunWithTraceResponse {
        diagnostics: program.diagnostics,
        state,
        trace,
        trace_truncated,
    })
}

#[wasm_bindgen]
pub fn wasm_compile_to_target(
    source: &str,
    target: &str,
    max_steps: Option<u32>,
) -> Result<String, JsValue> {
    let emit_target = match target {
        "js" => EmitTarget::Js,
        "c" => EmitTarget::C,
        _ => {
            return Err(JsValue::from_str(&format!(
                "Unsupported compile target '{target}'. Expected 'js' or 'c'."
            )));
        }
    };
    let result = compile_to_target(
        source,
        emit_target,
        EmitOptions {
            max_steps: max_steps.map(|s| s as usize),
            ..EmitOptions::default()
        },
    );
    serialize_json(&result)
}

#[wasm_bindgen]
pub fn wasm_text_to_gg(text: &str) -> String {
    text_to_gg(text)
}

#[wasm_bindgen]
pub fn wasm_encode_bigint(decimal: &str) -> Result<String, JsValue> {
    let parsed = decimal.trim().parse::<BigInt>().map_err(|err| {
        JsValue::from_str(&format!("Invalid decimal integer '{decimal}': {err}"))
    })?;
    Ok(encode_bigint(&parsed))
}

#[wasm_bindgen]
pub fn wasm_is_incomplete_fragment(source: &str) -> bool {
    is_incomplete_fragment(source)
}

#[wasm_bindgen]
pub struct WasmVM {
    diagnostics: Vec<Diagnostic>,
    vm: JjeJjeVM,
}

#[wasm_bindgen]
impl WasmVM {
    #[wasm_bindgen(constructor)]
    pub fn new(source: &str, stdin: &str, max_steps: Option<u32>) -> Self {
        let program = compile(source, ParseOptions::default());
        let vm = JjeJjeVM::new(
            &program,
            VMOptions {
                stdin: Some(stdin.to_string()),
                max_steps: max_steps.map(|s| s as usize),
                ..VMOptions::default()
            },
        );
        Self {
            diagnostics: program.diagnostics,
            vm,
        }
    }

    pub fn diagnostics_json(&self) -> Result<String, JsValue> {
        serialize_json(&self.diagnostics)
    }

    pub fn step(&mut self) -> bool {
        self.vm.step()
    }

    pub fn run_json(&mut self) -> Result<String, JsValue> {
        let state = self.vm.run().to_json();
        serialize_json(&state)
    }

    pub fn state_json(&self) -> Result<String, JsValue> {
        let state = self.vm.get_state().to_json();
        serialize_json(&state)
    }

    pub fn clear_output(&mut self) {
        self.vm.clear_output();
    }

    pub fn is_halted(&self) -> bool {
        self.vm.is_halted()
    }

    pub fn has_error(&self) -> bool {
        self.vm.has_error()
    }

    pub fn current_steps(&self) -> usize {
        self.vm.current_steps()
    }
}
