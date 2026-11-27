use num_bigint::BigInt;
use num_traits::{Signed, Zero};

use crate::lexer::MAX_EXPONENT;

fn encode_positive_bigint(pos: &BigInt) -> String {
    let s = pos.to_string();
    if s.len() - 1 <= MAX_EXPONENT {
        let mut terms = Vec::new();
        for (i, ch) in s.bytes().enumerate() {
            let digit = (ch - b'0') as usize;
            if digit == 0 {
                continue;
            }
            let power = s.len() - 1 - i;
            terms.push(format!("{}{}{}", "어".repeat(power), "엄", ".".repeat(digit)));
        }
        if terms.len() == 1 {
            return terms[0].clone();
        }
        let mut parts = Vec::with_capacity(terms.len() * 2 - 1);
        parts.push(terms[0].as_str());
        for term in &terms[1..] {
            parts.push(term.as_str());
            parts.push("지랄");
        }
        return parts.join(" ");
    }

    let base = BigInt::from(10u8).pow(MAX_EXPONENT as u32);
    let high = pos / &base;
    let low = pos % &base;
    let scale = format!("{}엄.", "어".repeat(MAX_EXPONENT));
    if low.is_zero() {
        format!("{} {} 지~~랄", encode_positive_bigint(&high), scale)
    } else {
        format!(
            "{} {} 지~~랄 {} 지랄",
            encode_positive_bigint(&high),
            scale,
            encode_positive_bigint(&low)
        )
    }
}

pub fn encode_bigint(n: &BigInt) -> String {
    if n.is_zero() {
        return "엄".to_string();
    }
    if n.is_positive() {
        return encode_positive_bigint(n);
    }

    let neg_abs = -n;
    let abs_str = neg_abs.to_string();
    if abs_str.len() - 1 <= MAX_EXPONENT {
        let mut terms = Vec::new();
        for (i, ch) in abs_str.bytes().enumerate() {
            let digit = (ch - b'0') as usize;
            if digit == 0 {
                continue;
            }
            let power = abs_str.len() - 1 - i;
            terms.push(format!("{}{}{}", "어".repeat(power), "엄", ",".repeat(digit)));
        }
        if terms.len() == 1 {
            return terms[0].clone();
        }
        let mut parts = Vec::with_capacity(terms.len() * 2 - 1);
        parts.push(terms[0].as_str());
        for term in &terms[1..] {
            parts.push(term.as_str());
            parts.push("지랄");
        }
        return parts.join(" ");
    }

    format!("엄 {} 지~랄", encode_positive_bigint(&neg_abs))
}

fn is_unsafe_comment_codepoint(cp: u32) -> bool {
    cp < 0x20
        || cp == 0x7F
        || (0x80..=0x9F).contains(&cp)
        || matches!(cp, 0x2028 | 0x2029 | 0x061C | 0x200E | 0x200F | 0xFEFF)
        || (0x202A..=0x202E).contains(&cp)
        || (0x2066..=0x2069).contains(&cp)
}

fn format_comment_char(ch: char) -> String {
    match ch {
        '\n' => "\\n".to_string(),
        '\r' => "\\r".to_string(),
        '\t' => "\\t".to_string(),
        _ => {
            let cp = ch as u32;
            if is_unsafe_comment_codepoint(cp) {
                format!("U+{cp:04X}")
            } else {
                ch.to_string()
            }
        }
    }
}

pub fn text_to_gg(text: &str) -> String {
    let mut lines = Vec::new();
    lines.push("요이~".to_string());
    for ch in text.chars() {
        let cp = ch as u32;
        let expr = encode_bigint(&BigInt::from(cp));
        lines.push(format!("{expr} 야~르! // '{}'", format_comment_char(ch)));
    }
    lines.push("줴줴이야".to_string());
    lines.join("\n")
}
