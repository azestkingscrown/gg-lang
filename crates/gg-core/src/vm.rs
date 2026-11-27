use std::collections::BTreeMap;

use num_bigint::BigInt;
use num_traits::{ToPrimitive, Zero};

use crate::lexer::truncate_display;
use crate::types::{
    CompiledProgram, Diagnostic, DiagnosticKind, Instruction, OpCode, Operand, Token, TraceEvent,
    TracePhase, VMOptions, VMState,
};

pub const DEFAULT_MAX_STEPS: usize = 200_000;
pub const DEFAULT_MAX_STACK_SIZE: usize = 100_000;
pub const DEFAULT_MAX_MEMORY_SIZE: usize = 100_000;
pub const DEFAULT_MAX_BIGINT_BITS: usize = 65_536;
pub const DEFAULT_MAX_OUTPUT_LENGTH: usize = 1_000_000;
pub const MAX_STDIN_INT_DIGITS: usize = 20_000;

pub fn bigint_bit_length(n: &BigInt) -> usize {
    if n.is_zero() {
        0
    } else {
        n.bits() as usize
    }
}

pub struct JjeJjeVM {
    instructions: Vec<Instruction>,
    max_steps: usize,
    max_stack_size: usize,
    max_memory_size: usize,
    max_bigint_bits: usize,
    max_output_length: usize,
    stdin: Vec<char>,
    stdin_pos: usize,
    ip: usize,
    stack: Vec<BigInt>,
    memory: BTreeMap<BigInt, BigInt>,
    output: String,
    output_utf16_len: usize,
    steps: usize,
    halted: bool,
    error: Option<Diagnostic>,
    error_token: Option<Token>,
}

impl JjeJjeVM {
    pub fn new(program: &CompiledProgram, options: VMOptions) -> Self {
        let stdin_chars = options
            .stdin
            .as_deref()
            .unwrap_or("")
            .chars()
            .collect::<Vec<char>>();
        let mut halted = false;
        let mut error = None;

        if let Some(first_diag) = program.diagnostics.first() {
            halted = true;
            error = Some(first_diag.clone());
        } else if program.instructions.is_empty() {
            halted = true;
        }

        Self {
            instructions: program.instructions.clone(),
            max_steps: options.max_steps.unwrap_or(DEFAULT_MAX_STEPS),
            max_stack_size: options.max_stack_size.unwrap_or(DEFAULT_MAX_STACK_SIZE),
            max_memory_size: options.max_memory_size.unwrap_or(DEFAULT_MAX_MEMORY_SIZE),
            max_bigint_bits: options.max_bigint_bits.unwrap_or(DEFAULT_MAX_BIGINT_BITS),
            max_output_length: options.max_output_length.unwrap_or(DEFAULT_MAX_OUTPUT_LENGTH),
            stdin: stdin_chars,
            stdin_pos: 0,
            ip: 0,
            stack: options.initial_stack.unwrap_or_default(),
            memory: options.initial_memory.unwrap_or_default(),
            output: String::new(),
            output_utf16_len: 0,
            steps: 0,
            halted,
            error,
            error_token: None,
        }
    }

    pub fn is_halted(&self) -> bool {
        self.halted
    }

    pub fn has_error(&self) -> bool {
        self.error.is_some()
    }

    pub fn current_steps(&self) -> usize {
        self.steps
    }

    pub fn clear_output(&mut self) {
        self.output.clear();
        self.output_utf16_len = 0;
    }

    fn fail(&mut self, code: &str, message: &str, token: &Token, hint: Option<String>) -> bool {
        let suffix = "터져서 없어짐 수고하세요";
        let full_message = if message.contains(suffix) {
            message.to_string()
        } else {
            format!("{message} — {suffix}")
        };
        self.error = Some(Diagnostic {
            kind: DiagnosticKind::Runtime,
            code: code.to_string(),
            message: full_message,
            hint,
            line: token.line,
            column: token.column,
            end_column: token.end_column,
        });
        self.error_token = Some(token.clone());
        self.halted = true;
        false
    }

    fn check_bigint_size(&mut self, value: &BigInt, token: &Token) -> bool {
        if bigint_bit_length(value) > self.max_bigint_bits {
            return self.fail(
                "RUNTIME_BIGINT_OVERFLOW",
                &format!("지~랄 정수가 너무 커졌어요 (최대 {}비트)", self.max_bigint_bits),
                token,
                None,
            );
        }
        true
    }

    fn push_value(&mut self, value: BigInt, token: &Token) -> bool {
        if self.stack.len() >= self.max_stack_size {
            return self.fail(
                "RUNTIME_STACK_OVERFLOW",
                &format!("지~랄 스택이 너무 커졌어요 (최대 {}개)", self.max_stack_size),
                token,
                None,
            );
        }
        self.stack.push(value);
        true
    }

    fn require_two(&mut self, token: &Token) -> bool {
        if self.stack.len() < 2 {
            self.fail(
                "RUNTIME_STACK_UNDERFLOW",
                &format!("예? 스택에 값이 최소 2개는 있어야 '{}'을(를) 할 수 있어요.", token.raw),
                token,
                None,
            );
            return false;
        }
        true
    }

    fn append_output(&mut self, chunk: &str, token: &Token) -> bool {
        let chunk_units = chunk.encode_utf16().count();
        if self.output_utf16_len + chunk_units > self.max_output_length {
            return self.fail(
                "RUNTIME_OUTPUT_LIMIT",
                &format!("지~랄 출력 길이가 최대치({}자)를 넘었어요.", self.max_output_length),
                token,
                None,
            );
        }
        self.output.push_str(chunk);
        self.output_utf16_len += chunk_units;
        true
    }

    fn read_int_from_stdin(&mut self, token: &Token) -> Option<BigInt> {
        while self.stdin_pos < self.stdin.len() && self.stdin[self.stdin_pos].is_whitespace() {
            self.stdin_pos += 1;
        }
        if self.stdin_pos >= self.stdin.len() {
            self.fail(
                "RUNTIME_STDIN_EOF",
                "예? 입력(stdin)이 비어서 정수를 읽을 수 없어요.",
                token,
                None,
            );
            return None;
        }

        let start = self.stdin_pos;
        while self.stdin_pos < self.stdin.len() && !self.stdin[self.stdin_pos].is_whitespace() {
            self.stdin_pos += 1;
        }

        let raw: String = self.stdin[start..self.stdin_pos].iter().collect();
        let (neg, digits) = if let Some(rest) = raw.strip_prefix('-') {
            (true, rest)
        } else if let Some(rest) = raw.strip_prefix('+') {
            (false, rest)
        } else {
            (false, raw.as_str())
        };

        if digits.is_empty() || !digits.chars().all(|c| c.is_ascii_digit()) {
            self.fail(
                "RUNTIME_INVALID_INT",
                &format!("예? '{}'은(는) 정수가 아닌데요?", truncate_display(&raw, 40)),
                token,
                None,
            );
            return None;
        }

        if raw.len() > MAX_STDIN_INT_DIGITS {
            self.fail(
                "RUNTIME_BIGINT_OVERFLOW",
                &format!(
                    "지~랄 입력 정수가 너무 커요 ({}, 최대 {}자리)",
                    truncate_display(&raw, 40),
                    MAX_STDIN_INT_DIGITS
                ),
                token,
                None,
            );
            return None;
        }

        let Some(mut parsed) = BigInt::parse_bytes(digits.as_bytes(), 10) else {
            self.fail(
                "RUNTIME_BIGINT_OVERFLOW",
                &format!("지~랄 입력 정수를 처리할 수 없어요 ({})", truncate_display(&raw, 40)),
                token,
                None,
            );
            return None;
        };
        if neg {
            parsed = -parsed;
        }

        if !self.check_bigint_size(&parsed, token) {
            return None;
        }

        Some(parsed)
    }

    fn read_char_codepoint_from_stdin(&mut self) -> BigInt {
        if self.stdin_pos >= self.stdin.len() {
            return BigInt::from(-1);
        }
        let ch = self.stdin[self.stdin_pos];
        self.stdin_pos += 1;
        BigInt::from(ch as u32)
    }

    fn validate_jump_target(&mut self, operand: Option<&Operand>, token: &Token) -> Option<usize> {
        match operand {
            Some(Operand::Jump(target)) if *target <= self.instructions.len() => Some(*target),
            other => {
                self.fail(
                    "RUNTIME_INVALID_JUMP",
                    &format!("지~랄 점프 위치가 잘못되었어요 ({other:?})"),
                    token,
                    None,
                );
                None
            }
        }
    }

    pub fn step(&mut self) -> bool {
        self.step_inner::<fn(TraceEvent)>(None)
    }

    pub fn step_with_trace<F: FnMut(TraceEvent)>(&mut self, on_trace: &mut F) -> bool {
        self.step_inner(Some(on_trace))
    }

    fn step_inner<F: FnMut(TraceEvent)>(&mut self, mut on_trace: Option<&mut F>) -> bool {
        if self.halted || self.error.is_some() {
            return false;
        }
        if self.ip >= self.instructions.len() {
            self.halted = true;
            return false;
        }

        let start_ip = self.ip;
        let step_num = self.steps + 1;
        let instr = self.instructions[start_ip].clone();
        let token = &instr.token;

        if let Some(cb) = on_trace.as_deref_mut() {
            cb(TraceEvent {
                step: step_num,
                ip: start_ip,
                op: instr.op,
                token: token.clone(),
                phase: TracePhase::Before,
                stack: self.stack.clone(),
                memory_size: self.memory.len(),
                error: None,
            });
        }

        if self.steps >= self.max_steps {
            self.fail(
                "RUNTIME_STEP_LIMIT",
                &format!("지~랄 실행 횟수가 최대치({}스텝)를 넘었어요! 무한 루프에 빠진 것 같네요.", self.max_steps),
                token,
                None,
            );
            if let (Some(cb), Some(err)) = (on_trace, self.error.clone()) {
                cb(TraceEvent {
                    step: step_num,
                    ip: start_ip,
                    op: instr.op,
                    token: token.clone(),
                    phase: TracePhase::Error,
                    stack: self.stack.clone(),
                    memory_size: self.memory.len(),
                    error: Some(err),
                });
            }
            return false;
        }

        if !self.execute_instruction(&instr) {
            if let (Some(cb), Some(err)) = (on_trace, self.error.clone()) {
                cb(TraceEvent {
                    step: step_num,
                    ip: start_ip,
                    op: instr.op,
                    token: token.clone(),
                    phase: TracePhase::Error,
                    stack: self.stack.clone(),
                    memory_size: self.memory.len(),
                    error: Some(err),
                });
            }
            return false;
        }

        self.steps += 1;
        if let Some(cb) = on_trace {
            cb(TraceEvent {
                step: self.steps,
                ip: start_ip,
                op: instr.op,
                token: token.clone(),
                phase: TracePhase::After,
                stack: self.stack.clone(),
                memory_size: self.memory.len(),
                error: None,
            });
        }

        !self.halted
    }

    fn execute_instruction(&mut self, instr: &Instruction) -> bool {
        let token = &instr.token;

        match instr.op {
            OpCode::Push => {
                let val = match &instr.operand {
                    Some(Operand::BigInt(v)) => v.clone(),
                    _ => BigInt::zero(),
                };
                if !self.check_bigint_size(&val, token) || !self.push_value(val, token) {
                    return false;
                }
                self.ip += 1;
            }
            OpCode::Pop => {
                if self.stack.pop().is_none() {
                    return self.fail(
                        "RUNTIME_STACK_UNDERFLOW",
                        &format!("예? 스택에 아무것도 없는데요? ({})", token.raw),
                        token,
                        None,
                    );
                }
                self.ip += 1;
            }
            OpCode::Dup => {
                let Some(top) = self.stack.last().cloned() else {
                    return self.fail(
                        "RUNTIME_STACK_UNDERFLOW",
                        &format!("예? 스택에 아무것도 없는데요? ({})", token.raw),
                        token,
                        None,
                    );
                };
                if !self.push_value(top, token) {
                    return false;
                }
                self.ip += 1;
            }
            OpCode::Swap => {
                if !self.require_two(token) {
                    return false;
                }
                let len = self.stack.len();
                self.stack.swap(len - 2, len - 1);
                self.ip += 1;
            }
            OpCode::Over => {
                if self.stack.len() < 2 {
                    return self.fail(
                        "RUNTIME_STACK_UNDERFLOW",
                        &format!("예? '{}'(OVER)을 하려면 스택에 값이 최소 2개 있어야 해요.", token.raw),
                        token,
                        None,
                    );
                }
                let val = self.stack[self.stack.len() - 2].clone();
                if !self.push_value(val, token) {
                    return false;
                }
                self.ip += 1;
            }
            OpCode::Rot => {
                if self.stack.len() < 3 {
                    return self.fail(
                        "RUNTIME_STACK_UNDERFLOW",
                        &format!("예? '{}'(ROT)을 하려면 스택에 값이 최소 3개 있어야 해요.", token.raw),
                        token,
                        None,
                    );
                }
                let c = self.stack.pop().expect("checked len >= 3");
                let b = self.stack.pop().expect("checked len >= 3");
                let a = self.stack.pop().expect("checked len >= 3");
                self.stack.push(b);
                self.stack.push(c);
                self.stack.push(a);
                self.ip += 1;
            }
            OpCode::Depth => {
                let depth = BigInt::from(self.stack.len());
                if !self.push_value(depth, token) {
                    return false;
                }
                self.ip += 1;
            }
            OpCode::Add | OpCode::Sub | OpCode::Mul => {
                if !self.require_two(token) {
                    return false;
                }
                let len = self.stack.len();
                let a = &self.stack[len - 2];
                let b = &self.stack[len - 1];

                if instr.op == OpCode::Mul
                    && !a.is_zero()
                    && !b.is_zero()
                    && bigint_bit_length(a) + bigint_bit_length(b) - 1 > self.max_bigint_bits
                {
                    return self.fail(
                        "RUNTIME_BIGINT_OVERFLOW",
                        &format!("지~랄 정수가 너무 커졌어요 (최대 {}비트)", self.max_bigint_bits),
                        token,
                        None,
                    );
                }

                let result = match instr.op {
                    OpCode::Add => a + b,
                    OpCode::Sub => a - b,
                    OpCode::Mul => a * b,
                    _ => unreachable!(),
                };

                if !self.check_bigint_size(&result, token) {
                    return false;
                }
                self.stack.truncate(len - 2);
                self.stack.push(result);
                self.ip += 1;
            }
            OpCode::Div | OpCode::Mod => {
                if !self.require_two(token) {
                    return false;
                }
                let len = self.stack.len();
                let a = &self.stack[len - 2];
                let b = &self.stack[len - 1];
                if b.is_zero() {
                    return self.fail("RUNTIME_DIV_ZERO", "지~랄 0으로 어떻게 나눠요", token, None);
                }
                let result = if instr.op == OpCode::Div { a / b } else { a % b };
                self.stack.truncate(len - 2);
                self.stack.push(result);
                self.ip += 1;
            }
            OpCode::Eq | OpCode::Lt | OpCode::Gt => {
                if !self.require_two(token) {
                    return false;
                }
                let b = self.stack.pop().expect("checked len >= 2");
                let a = self.stack.pop().expect("checked len >= 2");
                let cond = match instr.op {
                    OpCode::Eq => a == b,
                    OpCode::Lt => a < b,
                    OpCode::Gt => a > b,
                    _ => unreachable!(),
                };
                self.stack.push(BigInt::from(if cond { 1 } else { 0 }));
                self.ip += 1;
            }
            OpCode::Not => {
                let Some(a) = self.stack.pop() else {
                    return self.fail(
                        "RUNTIME_STACK_UNDERFLOW",
                        &format!("예? 스택에 아무것도 없는데요? ({})", token.raw),
                        token,
                        None,
                    );
                };
                self.stack.push(BigInt::from(if a.is_zero() { 1 } else { 0 }));
                self.ip += 1;
            }
            OpCode::Store => {
                if !self.require_two(token) {
                    return false;
                }
                let len = self.stack.len();
                let addr_ref = &self.stack[len - 1];
                if !self.memory.contains_key(addr_ref) && self.memory.len() >= self.max_memory_size {
                    return self.fail(
                        "RUNTIME_MEMORY_OVERFLOW",
                        &format!("지~랄 메모리가 너무 많이 찼어요 (최대 {}칸)", self.max_memory_size),
                        token,
                        None,
                    );
                }
                let addr = self.stack.pop().expect("checked len >= 2");
                let val = self.stack.pop().expect("checked len >= 2");
                self.memory.insert(addr, val);
                self.ip += 1;
            }
            OpCode::Load => {
                let Some(addr) = self.stack.pop() else {
                    return self.fail(
                        "RUNTIME_STACK_UNDERFLOW",
                        &format!("예? 스택에 아무것도 없는데요? ({})", token.raw),
                        token,
                        None,
                    );
                };
                let val = self.memory.get(&addr).cloned().unwrap_or_else(BigInt::zero);
                self.stack.push(val);
                self.ip += 1;
            }
            OpCode::InputInt => {
                let Some(val) = self.read_int_from_stdin(token) else {
                    return false;
                };
                if !self.push_value(val, token) {
                    return false;
                }
                self.ip += 1;
            }
            OpCode::InputChar => {
                let cp = self.read_char_codepoint_from_stdin();
                if !self.push_value(cp, token) {
                    return false;
                }
                self.ip += 1;
            }
            OpCode::PrintInt => {
                let Some(val) = self.stack.last().cloned() else {
                    return self.fail(
                        "RUNTIME_STACK_UNDERFLOW",
                        &format!("예? 스택에 아무것도 없는데요? ({})", token.raw),
                        token,
                        None,
                    );
                };
                let formatted = val.to_string();
                if !self.append_output(&formatted, token) {
                    return false;
                }
                self.stack.pop();
                self.ip += 1;
            }
            OpCode::PrintIntLn => {
                let Some(val) = self.stack.last().cloned() else {
                    return self.fail(
                        "RUNTIME_STACK_UNDERFLOW",
                        &format!("예? 스택에 아무것도 없는데요? ({})", token.raw),
                        token,
                        None,
                    );
                };
                let formatted = format!("{val}\n");
                if !self.append_output(&formatted, token) {
                    return false;
                }
                self.stack.pop();
                self.ip += 1;
            }
            OpCode::PrintChar => {
                let Some(val) = self.stack.last().cloned() else {
                    return self.fail(
                        "RUNTIME_STACK_UNDERFLOW",
                        &format!("예? 스택에 아무것도 없는데요? ({})", token.raw),
                        token,
                        None,
                    );
                };
                let Some(ch) = val.to_u32().and_then(char::from_u32) else {
                    return self.fail(
                        "RUNTIME_INVALID_CODEPOINT",
                        &format!(
                            "지~랄 '{}'은(는) 유효한 유니코드 문자가 아니에요.",
                            truncate_display(&val.to_string(), 40)
                        ),
                        token,
                        None,
                    );
                };
                let mut buf = [0u8; 4];
                let encoded = ch.encode_utf8(&mut buf);
                if !self.append_output(encoded, token) {
                    return false;
                }
                self.stack.pop();
                self.ip += 1;
            }
            OpCode::Jz => {
                if self.stack.is_empty() {
                    return self.fail(
                        "RUNTIME_STACK_UNDERFLOW",
                        &format!("예? 스택에 아무것도 없는데요? ({})", token.raw),
                        token,
                        None,
                    );
                }
                let Some(target) = self.validate_jump_target(instr.operand.as_ref(), token) else {
                    return false;
                };
                let cond = self.stack.pop().expect("checked non-empty");
                self.ip = if cond.is_zero() { target } else { self.ip + 1 };
            }
            OpCode::JzPeek => {
                if self.stack.is_empty() {
                    return self.fail(
                        "RUNTIME_STACK_UNDERFLOW",
                        "예? 반복문('아뇨아뇨~') 조건을 확인할 값이 스택에 없어요.",
                        token,
                        None,
                    );
                }
                let Some(target) = self.validate_jump_target(instr.operand.as_ref(), token) else {
                    return false;
                };
                let is_zero = self.stack.last().expect("checked non-empty").is_zero();
                self.ip = if is_zero { target } else { self.ip + 1 };
            }
            OpCode::Jmp => {
                let Some(target) = self.validate_jump_target(instr.operand.as_ref(), token) else {
                    return false;
                };
                self.ip = target;
            }
            OpCode::Halt => {
                self.halted = true;
            }
        }

        true
    }

    pub fn run(&mut self) -> VMState {
        while !self.halted && self.error.is_none() {
            if !self.step() {
                break;
            }
        }
        self.get_state()
    }

    pub fn run_with_trace<F: FnMut(TraceEvent)>(&mut self, on_trace: &mut F) -> VMState {
        while !self.halted && self.error.is_none() {
            if !self.step_inner(Some(on_trace)) {
                break;
            }
        }
        self.get_state()
    }

    pub fn get_state(&self) -> VMState {
        let active_token = if let Some(tok) = &self.error_token {
            Some(tok.clone())
        } else if !self.halted && self.ip < self.instructions.len() {
            Some(self.instructions[self.ip].token.clone())
        } else {
            None
        };

        VMState {
            ip: self.ip,
            stack: self.stack.clone(),
            memory: self
                .memory
                .iter()
                .map(|(k, v)| (k.clone(), v.clone()))
                .collect(),
            output: self.output.clone(),
            steps: self.steps,
            halted: self.halted,
            error: self.error.clone(),
            current_line: active_token.as_ref().map(|t| t.line),
            current_token: active_token,
        }
    }
}
