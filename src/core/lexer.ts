import type { Diagnostic, Token, TokenType } from './types.js';

export const MAX_EXPONENT = 1000;

interface RawWord {
  raw: string;
  line: number;
  column: number;
  endColumn: number;
}

const EXACT_KEYWORDS = new Map<string, TokenType>([
  ['요이~', 'START'],
  ['줴줴이야', 'HALT'],
  ['예?', 'INPUT_INT'],
  ['야~르', 'PRINT_INT'],
  ['야~~르', 'PRINT_INT_LN'],
  ['야~르!', 'PRINT_CHAR'],
  ['아뇨', 'NOT'],
  ['아뇨아뇨?', 'IF'],
  ['아뇨아뇨', 'ELSE'],
  ['아뇨아뇨~', 'WHILE'],
  ['아뇨아뇨!', 'END'],
  ['아뇨아뇨아뇨', 'CONTINUE'],
]);

const ARITHMETIC_OPS: TokenType[] = ['ADD', 'SUB', 'MUL', 'DIV', 'MOD'];
const COMPARE_OPS: TokenType[] = ['EQ', 'LT', 'GT'];
const STACK_OPS: TokenType[] = ['DUP', 'SWAP', 'OVER', 'ROT', 'DEPTH'];

export function truncateDisplay(text: string, maxLen = 40): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}…`;
}

function isHorizontalWhitespace(ch: string): boolean {
  return (
    ch === ' ' ||
    ch === '\t' ||
    ch === '\v' ||
    ch === '\f' ||
    ch === '\u00a0' ||
    ch === '\u3000'
  );
}

function scanRawWords(source: string): RawWord[] {
  const words: RawWord[] = [];
  let i = source.startsWith('\ufeff') ? 1 : 0;
  let line = 1;
  let column = 1;

  while (i < source.length) {
    const ch = source[i];

    if (ch === '\n') {
      line += 1;
      column = 1;
      i += 1;
      continue;
    }

    if (ch === '\r') {
      if (source[i + 1] === '\n') {
        i += 2;
      } else {
        i += 1;
      }
      line += 1;
      column = 1;
      continue;
    }

    if (isHorizontalWhitespace(ch)) {
      column += 1;
      i += 1;
      continue;
    }

    if (ch === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n' && source[i] !== '\r') {
        i += 1;
      }
      continue;
    }

    const startCol = column;
    let raw = '';
    while (i < source.length) {
      const c = source[i];
      if (
        isHorizontalWhitespace(c) ||
        c === '\r' ||
        c === '\n' ||
        (c === '/' && source[i + 1] === '/')
      ) {
        break;
      }
      raw += c;
      i += 1;
      column += 1;
    }

    words.push({
      raw,
      line,
      column: startCol,
      endColumn: column,
    });
  }

  return words;
}

function getTypoHint(raw: string): string | undefined {
  if (raw === '요이' || /^요이~{2,}$/.test(raw) || /^요이[^~]+$/.test(raw)) {
    return "혹시 '요이~'를 쓰려던 건가요?";
  }
  if (raw === '예' || raw === '예!' || raw === '아예' || raw === '아예?') {
    return "혹시 '예?' 또는 '아 예?'를 쓰려던 건가요?";
  }
  if (/^야~*르[!?.~]*$/.test(raw)) {
    return "혹시 '야~르', '야~~르', '야~르!' 중 하나를 쓰려던 건가요?";
  }
  if (
    raw === '줴줴' ||
    raw === '줴줴이' ||
    raw === '줴줴야' ||
    raw === '제제이야' ||
    /^줴줴이야[~!?.]+$/.test(raw)
  ) {
    return "혹시 '줴줴이야'를 쓰려던 건가요?";
  }
  if (raw === '넌나가라' || raw === '넌나가라!') {
    return "혹시 띄어쓰기를 넣어 '넌 나가라' 또는 '넌 나가라!'를 쓰려던 건가요?";
  }
  if (/^지~*(?:랄|롤)/.test(raw)) {
    return "산술/비교 연산은 '지(~*)랄' 또는 '지(~*)랄?' (순화: '롤') 형태여야 해요.";
  }
  if (/^쥐~*(?:랄|롤)/.test(raw)) {
    return "스택/메모리 명령은 '쥐(~*)랄', '쥐랄!', '쥐~랄!' 형태만 지원합니다.";
  }
  if (/^아뇨/.test(raw)) {
    return "조건/반복 키워드는 '아뇨', '아뇨아뇨?', '아뇨아뇨', '아뇨아뇨~', '아뇨아뇨!', '아뇨아뇨아뇨'만 있어요.";
  }
  if (/^어*엄/.test(raw)) {
    return "'엄' 숫자 리터럴 뒤에는 온점(.) 또는 쉼표(,)만 붙일 수 있어요.";
  }
  return undefined;
}

export interface LexResult {
  tokens: Token[];
  diagnostics: Diagnostic[];
}

export function tokenize(source: string): LexResult {
  const words = scanRawWords(source);
  const tokens: Token[] = [];
  const diagnostics: Diagnostic[] = [];

  let i = 0;
  while (i < words.length) {
    const word = words[i];
    const next = words[i + 1];

    if (word.raw === '아') {
      if (next && next.line === word.line && next.raw === '예?') {
        tokens.push({
          type: 'INPUT_CHAR',
          raw: '아 예?',
          line: word.line,
          column: word.column,
          endColumn: next.endColumn,
        });
        i += 2;
        continue;
      }

      diagnostics.push({
        kind: 'syntax',
        code: 'LEX_INCOMPLETE_AH',
        message: "예? '아' 뒤에는 '예?'가 와야 해요 (아 예?)",
        hint: "문자 1글자를 입력받으려면 같은 줄에 '아 예?'라고 적어주세요.",
        line: word.line,
        column: word.column,
        endColumn: word.endColumn,
      });
      i += 1;
      continue;
    }

    if (word.raw === '넌') {
      if (next && next.line === word.line && (next.raw === '나가라' || next.raw === '나가라!')) {
        tokens.push({
          type: next.raw === '나가라' ? 'POP' : 'BREAK',
          raw: `넌 ${next.raw}`,
          line: word.line,
          column: word.column,
          endColumn: next.endColumn,
        });
        i += 2;
        continue;
      }

      diagnostics.push({
        kind: 'syntax',
        code: 'LEX_INCOMPLETE_NEON',
        message: "예? '넌' 뒤에는 '나가라' 또는 '나가라!'가 와야 해요",
        hint: "스택 top 버리기는 '넌 나가라', 반복문 탈출은 '넌 나가라!'입니다.",
        line: word.line,
        column: word.column,
        endColumn: word.endColumn,
      });
      i += 1;
      continue;
    }

    if (word.raw === '나가라' || word.raw === '나가라!') {
      diagnostics.push({
        kind: 'syntax',
        code: 'LEX_ORPHAN_NAGARA',
        message: `예? '${word.raw}' 앞에 '넌'을 빼먹으셨는데요? (넌 ${word.raw})`,
        hint: "'넌 나가라' 또는 '넌 나가라!' 형태로 두 단어를 같은 줄에 붙여 써주세요.",
        line: word.line,
        column: word.column,
        endColumn: word.endColumn,
      });
      i += 1;
      continue;
    }

    const exactType = EXACT_KEYWORDS.get(word.raw);
    if (exactType) {
      tokens.push({
        type: exactType,
        raw: word.raw,
        line: word.line,
        column: word.column,
        endColumn: word.endColumn,
      });
      i += 1;
      continue;
    }

    const pushMatch = /^(어*)엄([.,]*)$/.exec(word.raw);
    if (pushMatch) {
      const eoPart = pushMatch[1];
      const marksPart = pushMatch[2];
      const hasDots = marksPart.includes('.');
      const hasCommas = marksPart.includes(',');

      if (hasDots && hasCommas) {
        diagnostics.push({
          kind: 'syntax',
          code: 'LEX_MIXED_NUMBER_MARKS',
          message: "아뇨아뇨아뇨 '엄' 뒤에는 온점(.)과 쉼표(,)를 섞어 쓸 수 없어요",
          hint: "양수는 '.'만, 음수는 ','만 사용해주세요.",
          line: word.line,
          column: word.column,
          endColumn: word.endColumn,
        });
        i += 1;
        continue;
      }

      if (eoPart.length >= 1 && marksPart.length === 0) {
        diagnostics.push({
          kind: 'syntax',
          code: 'LEX_MISSING_NUMBER_VALUE',
          message: `예? '${truncateDisplay(word.raw)}' 뒤에 온점(.)이나 쉼표(,)로 값을 적어주세요`,
          hint: "예: '어엄.'은 10, '어엄,,'은 -20을 의미합니다.",
          line: word.line,
          column: word.column,
          endColumn: word.endColumn,
        });
        i += 1;
        continue;
      }

      if (eoPart.length > MAX_EXPONENT) {
        diagnostics.push({
          kind: 'syntax',
          code: 'LEX_NUMBER_TOO_LARGE',
          message: `아뇨아뇨아뇨 '${truncateDisplay(word.raw)}'의 '어' 개수가 너무 많아요 (최대 ${MAX_EXPONENT}개)`,
          hint: "큰 수는 '지~~랄'(곱셈)을 조합해 만들어 보세요.",
          line: word.line,
          column: word.column,
          endColumn: word.endColumn,
        });
        i += 1;
        continue;
      }

      const magnitude = BigInt(marksPart.length);
      const signed = hasCommas ? -magnitude : magnitude;
      const value = signed * 10n ** BigInt(eoPart.length);

      tokens.push({
        type: 'PUSH',
        raw: word.raw,
        value,
        line: word.line,
        column: word.column,
        endColumn: word.endColumn,
      });
      i += 1;
      continue;
    }

    const jiMatch = /^지(~*)(?:랄|롤)(\??)$/.exec(word.raw);
    if (jiMatch) {
      const tildes = jiMatch[1].length;
      const isCmp = jiMatch[2] === '?';

      if (isCmp) {
        if (tildes < COMPARE_OPS.length) {
          tokens.push({
            type: COMPARE_OPS[tildes],
            raw: word.raw,
            line: word.line,
            column: word.column,
            endColumn: word.endColumn,
          });
          i += 1;
          continue;
        }
      } else if (tildes < ARITHMETIC_OPS.length) {
        tokens.push({
          type: ARITHMETIC_OPS[tildes],
          raw: word.raw,
          line: word.line,
          column: word.column,
          endColumn: word.endColumn,
        });
        i += 1;
        continue;
      }

      diagnostics.push({
        kind: 'syntax',
        code: 'LEX_TOO_MANY_TILDES',
        message: '물결(~) 개수가 너무 많아요! 산술은 0~4개, 비교(?)는 0~2개만 쓸 수 있어요',
        line: word.line,
        column: word.column,
        endColumn: word.endColumn,
      });
      i += 1;
      continue;
    }

    const jwiMatch = /^쥐(~*)랄(!?)$/.exec(word.raw);
    if (jwiMatch) {
      const tildes = jwiMatch[1].length;
      const isMem = jwiMatch[2] === '!';

      if (isMem) {
        if (tildes === 0 || tildes === 1) {
          tokens.push({
            type: tildes === 0 ? 'STORE' : 'LOAD',
            raw: word.raw,
            line: word.line,
            column: word.column,
            endColumn: word.endColumn,
          });
          i += 1;
          continue;
        }

        diagnostics.push({
          kind: 'syntax',
          code: 'LEX_INVALID_MEMORY_OP',
          message: "메모리 명령('쥐~랄!')은 물결 0개('쥐랄!' 저장) 또는 1개('쥐~랄!' 불러오기)만 쓸 수 있어요.",
          line: word.line,
          column: word.column,
          endColumn: word.endColumn,
        });
        i += 1;
        continue;
      }

      if (tildes < STACK_OPS.length) {
        tokens.push({
          type: STACK_OPS[tildes],
          raw: word.raw,
          line: word.line,
          column: word.column,
          endColumn: word.endColumn,
        });
        i += 1;
        continue;
      }

      diagnostics.push({
        kind: 'syntax',
        code: 'LEX_INVALID_STACK_OP',
        message: "스택 명령('쥐~랄')의 물결(~)은 0~4개까지만 쓸 수 있어요.",
        line: word.line,
        column: word.column,
        endColumn: word.endColumn,
      });
      i += 1;
      continue;
    }

    diagnostics.push({
      kind: 'syntax',
      code: 'LEX_UNKNOWN_TOKEN',
      message: `예? '${truncateDisplay(word.raw)}'이(가) 무슨 말인지 모르겠어요`,
      hint: getTypoHint(word.raw),
      line: word.line,
      column: word.column,
      endColumn: word.endColumn,
    });
    i += 1;
  }

  return { tokens, diagnostics };
}
