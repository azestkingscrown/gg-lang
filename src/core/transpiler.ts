import { MAX_EXPONENT } from './lexer.js';

function encodePositiveBigInt(pos: bigint): string {
  const str = pos.toString();
  if (str.length - 1 <= MAX_EXPONENT) {
    const terms: string[] = [];
    for (let i = 0; i < str.length; i += 1) {
      const digit = Number(str[i]);
      if (digit === 0) continue;
      const power = str.length - 1 - i;
      terms.push(`${'어'.repeat(power)}엄${'.'.repeat(digit)}`);
    }
    if (terms.length === 1) {
      return terms[0];
    }
    const parts: string[] = [terms[0]];
    for (let i = 1; i < terms.length; i += 1) {
      parts.push(terms[i], '지랄');
    }
    return parts.join(' ');
  }

  const base = 10n ** BigInt(MAX_EXPONENT);
  const high = pos / base;
  const low = pos % base;
  const scale = `${'어'.repeat(MAX_EXPONENT)}엄.`;
  if (low === 0n) {
    return `${encodePositiveBigInt(high)} ${scale} 지~~랄`;
  }
  return `${encodePositiveBigInt(high)} ${scale} 지~~랄 ${encodePositiveBigInt(low)} 지랄`;
}

export function encodeBigInt(n: bigint): string {
  if (n === 0n) {
    return '엄';
  }

  if (n > 0n) {
    return encodePositiveBigInt(n);
  }

  const absStr = (-n).toString();
  if (absStr.length - 1 <= MAX_EXPONENT) {
    const terms: string[] = [];
    for (let i = 0; i < absStr.length; i += 1) {
      const digit = Number(absStr[i]);
      if (digit === 0) continue;
      const power = absStr.length - 1 - i;
      terms.push(`${'어'.repeat(power)}엄${','.repeat(digit)}`);
    }
    if (terms.length === 1) {
      return terms[0];
    }
    const parts: string[] = [terms[0]];
    for (let i = 1; i < terms.length; i += 1) {
      parts.push(terms[i], '지랄');
    }
    return parts.join(' ');
  }

  return `엄 ${encodePositiveBigInt(-n)} 지~랄`;
}

function isUnsafeCommentCodePoint(cp: number): boolean {
  if (cp < 0x20 || cp === 0x7f) return true;
  if (cp >= 0x80 && cp <= 0x9f) return true;
  if (cp === 0x2028 || cp === 0x2029) return true;
  if (cp === 0x061c || cp === 0x200e || cp === 0x200f) return true;
  if (cp >= 0x202a && cp <= 0x202e) return true;
  if (cp >= 0x2066 && cp <= 0x2069) return true;
  if (cp === 0xfeff) return true;
  return false;
}

function formatCommentChar(ch: string, cp: number): string {
  if (ch === '\n') return '\\n';
  if (ch === '\r') return '\\r';
  if (ch === '\t') return '\\t';
  if (isUnsafeCommentCodePoint(cp)) {
    return `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
  }
  return ch;
}

export function textToGG(text: string): string {
  const lines: string[] = ['요이~'];
  for (const ch of text) {
    let cp = ch.codePointAt(0)!;
    let displayCh = ch;
    if (cp >= 0xd800 && cp <= 0xdfff) {
      cp = 0xfffd;
      displayCh = '\ufffd';
    }
    const expr = encodeBigInt(BigInt(cp));
    lines.push(`${expr} 티~원! // '${formatCommentChar(displayCh, cp)}'`);
  }
  lines.push('줴줴이야');
  return lines.join('\n');
}
