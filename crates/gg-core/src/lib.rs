pub mod codegen;
pub mod lexer;
pub mod parser;
pub mod transpiler;
pub mod types;
pub mod vm;

pub use codegen::{
    EmitOptions, EmitResult, EmitTarget, compile_to_target, emit_c, emit_c_with_warnings,
    emit_javascript,
};
pub use lexer::{MAX_EXPONENT, LexResult, tokenize, truncate_display};
pub use parser::{is_incomplete_fragment, parse};
pub use transpiler::{encode_bigint, text_to_gg};
pub use types::{
    CompiledProgram, Diagnostic, DiagnosticKind, Instruction, OpCode, Operand, ParseOptions, Span,
    Token, TokenType, TraceEvent, TracePhase, VMOptions, VMState, VMStateJson,
};
pub use vm::{
    DEFAULT_MAX_BIGINT_BITS, DEFAULT_MAX_MEMORY_SIZE, DEFAULT_MAX_OUTPUT_LENGTH,
    DEFAULT_MAX_STACK_SIZE, DEFAULT_MAX_STEPS, JjeJjeVM, MAX_STDIN_INT_DIGITS, bigint_bit_length,
};

pub fn compile(source: &str, options: ParseOptions) -> CompiledProgram {
    let lex = tokenize(source);
    parse(lex.tokens, lex.diagnostics, options)
}

pub fn analyze(source: &str, options: ParseOptions) -> Vec<Diagnostic> {
    compile(source, options).diagnostics
}

pub fn create_vm(source: &str, options: VMOptions) -> (CompiledProgram, JjeJjeVM) {
    let program = compile(source, ParseOptions::default());
    let vm = JjeJjeVM::new(&program, options);
    (program, vm)
}

pub fn run(source: &str, options: VMOptions) -> VMState {
    let (_, mut vm) = create_vm(source, options);
    vm.run()
}
