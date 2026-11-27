use std::collections::BTreeMap;

use num_bigint::BigInt;
use serde::{Deserialize, Deserializer, Serialize, Serializer};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Span {
    pub line: usize,
    pub column: usize,
    pub end_column: usize,
}

fn serialize_opt_bigint<S>(val: &Option<BigInt>, serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    match val {
        Some(n) => serializer.serialize_some(&n.to_string()),
        None => serializer.serialize_none(),
    }
}

fn deserialize_opt_bigint<'de, D>(deserializer: D) -> Result<Option<BigInt>, D::Error>
where
    D: Deserializer<'de>,
{
    let opt = Option::<String>::deserialize(deserializer)?;
    match opt {
        Some(s) => s
            .parse::<BigInt>()
            .map(Some)
            .map_err(serde::de::Error::custom),
        None => Ok(None),
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TokenType {
    Start,
    Halt,
    Push,
    InputInt,
    InputChar,
    PrintInt,
    PrintIntLn,
    PrintChar,
    Add,
    Sub,
    Mul,
    Div,
    Mod,
    Eq,
    Lt,
    GT,
    Dup,
    Swap,
    Over,
    Rot,
    Depth,
    Store,
    Load,
    Not,
    If,
    Else,
    While,
    End,
    Continue,
    Pop,
    Break,
}

impl TokenType {
    /// Ensure exact JSON serialization of `GT` as `"GT"` instead of `"G_T"`.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Start => "START",
            Self::Halt => "HALT",
            Self::Push => "PUSH",
            Self::InputInt => "INPUT_INT",
            Self::InputChar => "INPUT_CHAR",
            Self::PrintInt => "PRINT_INT",
            Self::PrintIntLn => "PRINT_INT_LN",
            Self::PrintChar => "PRINT_CHAR",
            Self::Add => "ADD",
            Self::Sub => "SUB",
            Self::Mul => "MUL",
            Self::Div => "DIV",
            Self::Mod => "MOD",
            Self::Eq => "EQ",
            Self::Lt => "LT",
            Self::GT => "GT",
            Self::Dup => "DUP",
            Self::Swap => "SWAP",
            Self::Over => "OVER",
            Self::Rot => "ROT",
            Self::Depth => "DEPTH",
            Self::Store => "STORE",
            Self::Load => "LOAD",
            Self::Not => "NOT",
            Self::If => "IF",
            Self::Else => "ELSE",
            Self::While => "WHILE",
            Self::End => "END",
            Self::Continue => "CONTINUE",
            Self::Pop => "POP",
            Self::Break => "BREAK",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Token {
    #[serde(rename = "type")]
    pub token_type: TokenType,
    pub raw: String,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        serialize_with = "serialize_opt_bigint",
        deserialize_with = "deserialize_opt_bigint"
    )]
    pub value: Option<BigInt>,
    pub line: usize,
    pub column: usize,
    pub end_column: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DiagnosticKind {
    Syntax,
    Runtime,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostic {
    pub kind: DiagnosticKind,
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hint: Option<String>,
    pub line: usize,
    pub column: usize,
    pub end_column: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum OpCode {
    Push,
    Pop,
    Dup,
    Swap,
    Over,
    Rot,
    Depth,
    Add,
    Sub,
    Mul,
    Div,
    Mod,
    Eq,
    #[serde(rename = "LT")]
    Lt,
    #[serde(rename = "GT")]
    Gt,
    Not,
    Store,
    Load,
    InputInt,
    InputChar,
    PrintInt,
    PrintIntLn,
    PrintChar,
    Jz,
    JzPeek,
    Jmp,
    Halt,
}

impl OpCode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Push => "PUSH",
            Self::Pop => "POP",
            Self::Dup => "DUP",
            Self::Swap => "SWAP",
            Self::Over => "OVER",
            Self::Rot => "ROT",
            Self::Depth => "DEPTH",
            Self::Add => "ADD",
            Self::Sub => "SUB",
            Self::Mul => "MUL",
            Self::Div => "DIV",
            Self::Mod => "MOD",
            Self::Eq => "EQ",
            Self::Lt => "LT",
            Self::Gt => "GT",
            Self::Not => "NOT",
            Self::Store => "STORE",
            Self::Load => "LOAD",
            Self::InputInt => "INPUT_INT",
            Self::InputChar => "INPUT_CHAR",
            Self::PrintInt => "PRINT_INT",
            Self::PrintIntLn => "PRINT_INT_LN",
            Self::PrintChar => "PRINT_CHAR",
            Self::Jz => "JZ",
            Self::JzPeek => "JZ_PEEK",
            Self::Jmp => "JMP",
            Self::Halt => "HALT",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Operand {
    BigInt(BigInt),
    Jump(usize),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Instruction {
    pub op: OpCode,
    pub operand: Option<Operand>,
    pub token: Token,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct ParseOptions {
    pub allow_fragment: bool,
}

#[derive(Debug, Clone, Default)]
pub struct CompiledProgram {
    pub instructions: Vec<Instruction>,
    pub tokens: Vec<Token>,
    pub diagnostics: Vec<Diagnostic>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TracePhase {
    Before,
    After,
    Error,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TraceEvent {
    pub step: usize,
    pub ip: usize,
    pub op: OpCode,
    pub token: Token,
    pub phase: TracePhase,
    pub stack: Vec<BigInt>,
    pub memory_size: usize,
    pub error: Option<Diagnostic>,
}

#[derive(Debug, Clone, Default)]
pub struct VMOptions {
    pub stdin: Option<String>,
    pub max_steps: Option<usize>,
    pub max_stack_size: Option<usize>,
    pub max_memory_size: Option<usize>,
    pub max_bigint_bits: Option<usize>,
    pub max_output_length: Option<usize>,
    pub initial_stack: Option<Vec<BigInt>>,
    pub initial_memory: Option<BTreeMap<BigInt, BigInt>>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VMState {
    pub ip: usize,
    pub stack: Vec<BigInt>,
    pub memory: Vec<(BigInt, BigInt)>,
    pub output: String,
    pub steps: usize,
    pub halted: bool,
    pub error: Option<Diagnostic>,
    pub current_line: Option<usize>,
    pub current_token: Option<Token>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VMStateJson {
    pub ip: usize,
    pub stack: Vec<String>,
    pub memory: Vec<(String, String)>,
    pub output: String,
    pub steps: usize,
    pub halted: bool,
    pub error: Option<Diagnostic>,
    pub current_line: Option<usize>,
    pub current_token: Option<Token>,
}

impl VMState {
    pub fn to_json(&self) -> VMStateJson {
        VMStateJson {
            ip: self.ip,
            stack: self.stack.iter().map(ToString::to_string).collect(),
            memory: self
                .memory
                .iter()
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .collect(),
            output: self.output.clone(),
            steps: self.steps,
            halted: self.halted,
            error: self.error.clone(),
            current_line: self.current_line,
            current_token: self.current_token.clone(),
        }
    }
}
