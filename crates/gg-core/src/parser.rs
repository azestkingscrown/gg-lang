use num_bigint::BigInt;

use crate::lexer::{tokenize, truncate_display};
use crate::types::{
    CompiledProgram, Diagnostic, DiagnosticKind, Instruction, OpCode, Operand, ParseOptions, Token,
    TokenType,
};

enum BlockFrame {
    If {
        open_token: Token,
        jz_index: usize,
        else_jmp_index: Option<usize>,
    },
    While {
        open_token: Token,
        start_ip: usize,
        jz_index: usize,
        break_patches: Vec<usize>,
    },
}

fn simple_op(token_type: TokenType) -> Option<OpCode> {
    match token_type {
        TokenType::Halt => Some(OpCode::Halt),
        TokenType::Pop => Some(OpCode::Pop),
        TokenType::Dup => Some(OpCode::Dup),
        TokenType::Swap => Some(OpCode::Swap),
        TokenType::Over => Some(OpCode::Over),
        TokenType::Rot => Some(OpCode::Rot),
        TokenType::Depth => Some(OpCode::Depth),
        TokenType::Add => Some(OpCode::Add),
        TokenType::Sub => Some(OpCode::Sub),
        TokenType::Mul => Some(OpCode::Mul),
        TokenType::Div => Some(OpCode::Div),
        TokenType::Mod => Some(OpCode::Mod),
        TokenType::Eq => Some(OpCode::Eq),
        TokenType::Lt => Some(OpCode::Lt),
        TokenType::GT => Some(OpCode::Gt),
        TokenType::Not => Some(OpCode::Not),
        TokenType::Store => Some(OpCode::Store),
        TokenType::Load => Some(OpCode::Load),
        TokenType::InputInt => Some(OpCode::InputInt),
        TokenType::InputChar => Some(OpCode::InputChar),
        TokenType::PrintInt => Some(OpCode::PrintInt),
        TokenType::PrintIntLn => Some(OpCode::PrintIntLn),
        TokenType::PrintChar => Some(OpCode::PrintChar),
        _ => None,
    }
}

fn find_nearest_while_mut(stack: &mut [BlockFrame]) -> Option<(usize, &mut Vec<usize>)> {
    for frame in stack.iter_mut().rev() {
        if let BlockFrame::While {
            start_ip,
            break_patches,
            ..
        } = frame
        {
            return Some((*start_ip, break_patches));
        }
    }
    None
}

pub fn parse(
    tokens: Vec<Token>,
    lex_diagnostics: Vec<Diagnostic>,
    options: ParseOptions,
) -> CompiledProgram {
    let mut diagnostics = lex_diagnostics;
    let mut instructions: Vec<Instruction> = Vec::new();
    let mut block_stack: Vec<BlockFrame> = Vec::new();

    if tokens.is_empty() {
        if !options.allow_fragment && diagnostics.is_empty() {
            diagnostics.push(Diagnostic {
                kind: DiagnosticKind::Syntax,
                code: "SYNTAX_EMPTY".to_string(),
                message: "엄... 아무 코드도 없는데요? '요이~'로 시작해서 '줴줴이야'로 끝내주세요.".to_string(),
                hint: Some("최소 프로그램: 요이~ 줴줴이야".to_string()),
                line: 1,
                column: 1,
                end_column: 1,
            });
        }
        return CompiledProgram {
            instructions,
            tokens,
            diagnostics,
        };
    }

    if !options.allow_fragment && tokens[0].token_type != TokenType::Start {
        let first = &tokens[0];
        diagnostics.push(Diagnostic {
            kind: DiagnosticKind::Syntax,
            code: "SYNTAX_MISSING_START".to_string(),
            message: "요이~로 시작해야죠! 프로그램의 첫 번째 명령어는 반드시 '요이~'여야 해요.".to_string(),
            hint: Some("코드 맨 앞에 '요이~'를 추가해주세요.".to_string()),
            line: first.line,
            column: first.column,
            end_column: first.end_column,
        });
    }

    let last = &tokens[tokens.len() - 1];
    if !options.allow_fragment && last.token_type != TokenType::Halt {
        diagnostics.push(Diagnostic {
            kind: DiagnosticKind::Syntax,
            code: "SYNTAX_MISSING_HALT".to_string(),
            message: "줴줴이야! 프로그램 마지막은 반드시 '줴줴이야'로 끝나야 해요.".to_string(),
            hint: Some("코드 맨 끝에 '줴줴이야'를 추가해주세요.".to_string()),
            line: last.line,
            column: last.column,
            end_column: last.end_column,
        });
    }

    for (i, token) in tokens.iter().enumerate() {
        match token.token_type {
            TokenType::Start => {
                if i > 0 {
                    diagnostics.push(Diagnostic {
                        kind: DiagnosticKind::Syntax,
                        code: "SYNTAX_DUPLICATE_START".to_string(),
                        message: "아뇨아뇨 '요이~'는 프로그램 맨 처음에 딱 한 번만 쓸 수 있어요.".to_string(),
                        hint: None,
                        line: token.line,
                        column: token.column,
                        end_column: token.end_column,
                    });
                }
            }
            TokenType::Push => {
                instructions.push(Instruction {
                    op: OpCode::Push,
                    operand: Some(Operand::BigInt(
                        token.value.clone().unwrap_or_else(|| BigInt::from(0)),
                    )),
                    token: token.clone(),
                });
            }
            other if simple_op(other).is_some() => {
                instructions.push(Instruction {
                    op: simple_op(other).expect("checked is_some"),
                    operand: None,
                    token: token.clone(),
                });
            }
            TokenType::If => {
                let jz_index = instructions.len();
                instructions.push(Instruction {
                    op: OpCode::Jz,
                    operand: None,
                    token: token.clone(),
                });
                block_stack.push(BlockFrame::If {
                    open_token: token.clone(),
                    jz_index,
                    else_jmp_index: None,
                });
            }
            TokenType::Else => {
                let Some(BlockFrame::If {
                    jz_index,
                    else_jmp_index,
                    ..
                }) = block_stack.last_mut()
                else {
                    diagnostics.push(Diagnostic {
                        kind: DiagnosticKind::Syntax,
                        code: "SYNTAX_UNEXPECTED_ELSE".to_string(),
                        message: "아뇨아뇨! 짝이 맞는 '아뇨아뇨?'(IF) 없이 '아뇨아뇨'(ELSE)를 쓸 수 없어요.".to_string(),
                        hint: None,
                        line: token.line,
                        column: token.column,
                        end_column: token.end_column,
                    });
                    continue;
                };

                if else_jmp_index.is_some() {
                    diagnostics.push(Diagnostic {
                        kind: DiagnosticKind::Syntax,
                        code: "SYNTAX_DUPLICATE_ELSE".to_string(),
                        message: "아뇨아뇨! 하나의 '아뇨아뇨?'(IF) 블록에는 '아뇨아뇨'(ELSE)를 한 번만 쓸 수 있어요.".to_string(),
                        hint: None,
                        line: token.line,
                        column: token.column,
                        end_column: token.end_column,
                    });
                    continue;
                }

                let jmp_index = instructions.len();
                instructions.push(Instruction {
                    op: OpCode::Jmp,
                    operand: None,
                    token: token.clone(),
                });
                let after_jz = instructions.len();
                instructions[*jz_index].operand = Some(Operand::Jump(after_jz));
                *else_jmp_index = Some(jmp_index);
            }
            TokenType::While => {
                let start_ip = instructions.len();
                let jz_index = instructions.len();
                instructions.push(Instruction {
                    op: OpCode::JzPeek,
                    operand: None,
                    token: token.clone(),
                });
                block_stack.push(BlockFrame::While {
                    open_token: token.clone(),
                    start_ip,
                    jz_index,
                    break_patches: Vec::new(),
                });
            }
            TokenType::End => {
                let Some(frame) = block_stack.pop() else {
                    diagnostics.push(Diagnostic {
                        kind: DiagnosticKind::Syntax,
                        code: "SYNTAX_UNEXPECTED_END".to_string(),
                        message: "아뇨아뇨아뇨 짝이 맞는 '아뇨아뇨?' 또는 '아뇨아뇨~' 없이 '아뇨아뇨!'가 나왔어요.".to_string(),
                        hint: None,
                        line: token.line,
                        column: token.column,
                        end_column: token.end_column,
                    });
                    continue;
                };

                match frame {
                    BlockFrame::If {
                        jz_index,
                        else_jmp_index,
                        ..
                    } => {
                        let end_ip = instructions.len();
                        if let Some(jmp_idx) = else_jmp_index {
                            instructions[jmp_idx].operand = Some(Operand::Jump(end_ip));
                        } else {
                            instructions[jz_index].operand = Some(Operand::Jump(end_ip));
                        }
                    }
                    BlockFrame::While {
                        start_ip,
                        jz_index,
                        break_patches,
                        ..
                    } => {
                        instructions.push(Instruction {
                            op: OpCode::Jmp,
                            operand: Some(Operand::Jump(start_ip)),
                            token: token.clone(),
                        });
                        let after_loop_ip = instructions.len();
                        instructions[jz_index].operand = Some(Operand::Jump(after_loop_ip));
                        for break_ip in break_patches {
                            instructions[break_ip].operand = Some(Operand::Jump(after_loop_ip));
                        }
                    }
                }
            }
            TokenType::Continue => {
                let Some((start_ip, _)) = find_nearest_while_mut(&mut block_stack) else {
                    diagnostics.push(Diagnostic {
                        kind: DiagnosticKind::Syntax,
                        code: "SYNTAX_CONTINUE_OUTSIDE_LOOP".to_string(),
                        message: "넌 나가라! 반복문('아뇨아뇨~') 밖에서는 '아뇨아뇨아뇨'(CONTINUE)를 쓸 수 없어요.".to_string(),
                        hint: None,
                        line: token.line,
                        column: token.column,
                        end_column: token.end_column,
                    });
                    continue;
                };
                instructions.push(Instruction {
                    op: OpCode::Jmp,
                    operand: Some(Operand::Jump(start_ip)),
                    token: token.clone(),
                });
            }
            TokenType::Break => {
                let Some((_, break_patches)) = find_nearest_while_mut(&mut block_stack) else {
                    diagnostics.push(Diagnostic {
                        kind: DiagnosticKind::Syntax,
                        code: "SYNTAX_BREAK_OUTSIDE_LOOP".to_string(),
                        message: "넌 나가라! 반복문('아뇨아뇨~') 밖에서는 '넌 나가라!'(BREAK)를 쓸 수 없어요.".to_string(),
                        hint: None,
                        line: token.line,
                        column: token.column,
                        end_column: token.end_column,
                    });
                    continue;
                };
                let break_ip = instructions.len();
                instructions.push(Instruction {
                    op: OpCode::Jmp,
                    operand: None,
                    token: token.clone(),
                });
                break_patches.push(break_ip);
            }
            _ => {
                diagnostics.push(Diagnostic {
                    kind: DiagnosticKind::Syntax,
                    code: "SYNTAX_UNKNOWN_TOKEN".to_string(),
                    message: format!("예? '{}' 알 수 없는 토큰 타입이에요.", truncate_display(&token.raw, 40)),
                    hint: None,
                    line: token.line,
                    column: token.column,
                    end_column: token.end_column,
                });
            }
        }
    }

    for unclosed in block_stack {
        let (msg, open) = match unclosed {
            BlockFrame::If { open_token, .. } => (
                "아뇨아뇨! 열린 '아뇨아뇨?' 블록이 '아뇨아뇨!'로 닫히지 않았어요.",
                open_token,
            ),
            BlockFrame::While { open_token, .. } => (
                "아뇨아뇨! 열린 '아뇨아뇨~' 반복문이 '아뇨아뇨!'로 닫히지 않았어요.",
                open_token,
            ),
        };
        diagnostics.push(Diagnostic {
            kind: DiagnosticKind::Syntax,
            code: "SYNTAX_UNCLOSED_BLOCK".to_string(),
            message: msg.to_string(),
            hint: Some("짝이 맞는 위치에 '아뇨아뇨!'를 추가해주세요.".to_string()),
            line: open.line,
            column: open.column,
            end_column: open.end_column,
        });
    }

    diagnostics.sort_by_key(|d| (d.line, d.column));

    if !diagnostics.is_empty() {
        instructions.clear();
    }

    CompiledProgram {
        instructions,
        tokens,
        diagnostics,
    }
}

pub fn is_incomplete_fragment(source: &str) -> bool {
    let lex = tokenize(source);
    if !lex.diagnostics.is_empty() {
        return false;
    }
    let parsed = parse(
        lex.tokens,
        lex.diagnostics,
        ParseOptions {
            allow_fragment: true,
        },
    );
    !parsed.diagnostics.is_empty()
        && parsed
            .diagnostics
            .iter()
            .all(|d| d.code == "SYNTAX_UNCLOSED_BLOCK")
}
