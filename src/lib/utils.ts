export interface PaletteItem {
  token: string;
  label: string;
}

export const PALETTE_ITEMS: PaletteItem[] = [
  { token: '요이~', label: '시작' },
  { token: '엄', label: '0' },
  { token: '엄.', label: '+1' },
  { token: '엄,', label: '-1' },
  { token: '어엄.', label: '+10' },
  { token: '예?', label: '정수입력' },
  { token: '아 예?', label: '문자입력' },
  { token: '야~르', label: '정수출력' },
  { token: '야~~르', label: '줄바꿈출력' },
  { token: '야~르!', label: '문자출력' },
  { token: '지랄', label: '+' },
  { token: '지~랄', label: '-' },
  { token: '지~~랄', label: '×' },
  { token: '지~~~랄', label: '÷' },
  { token: '지~~~~랄', label: '%' },
  { token: '지랄?', label: '==' },
  { token: '지~랄?', label: '<' },
  { token: '지~~랄?', label: '>' },
  { token: '쥐랄', label: 'DUP' },
  { token: '쥐~랄', label: 'SWAP' },
  { token: '쥐랄!', label: 'STORE' },
  { token: '쥐~랄!', label: 'LOAD' },
  { token: '아뇨', label: 'NOT' },
  { token: '아뇨아뇨?', label: 'IF' },
  { token: '아뇨아뇨', label: 'ELSE' },
  { token: '아뇨아뇨~', label: 'WHILE' },
  { token: '아뇨아뇨!', label: 'END' },
  { token: '아뇨아뇨아뇨', label: 'CONT' },
  { token: '넌 나가라', label: 'POP' },
  { token: '넌 나가라!', label: 'BREAK' },
  { token: '줴줴이야', label: '종료' },
];

export const AUTO_PLAY_INTERVAL_MS = 180;
export const DEBOUNCE_MS = 120;
export const MAX_INSPECTOR_ITEMS = 200;
export const MAX_BIGINT_DISPLAY_CHARS = 36;
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_TRANSPILER_CHARS = 10_000;
export const DRAFT_STORAGE_KEY = 'jjejje:draft:v1';

export function formatBigIntDisplay(value: bigint): { text: string; full: string } {
  const full = value.toString();
  if (full.length <= MAX_BIGINT_DISPLAY_CHARS) {
    return { text: full, full };
  }
  return {
    text: `${full.slice(0, 18)}…${full.slice(-10)} (${full.length}자리)`,
    full,
  };
}

export function formatCharPreview(value: bigint): string | null {
  if (value < 0n || value > 0x10ffffn) return null;
  const num = Number(value);
  if (num >= 0xd800 && num <= 0xdfff) return null;
  if (num === 10) return "'\\n'";
  if (num === 13) return "'\\r'";
  if (num === 9) return "'\\t'";
  if (num === 32) return "' '";
  if (num < 32 || (num >= 127 && num <= 159)) return null;
  try {
    return `'${String.fromCodePoint(num)}'`;
  } catch {
    return null;
  }
}

export function getOffsetForLineColumn(text: string, line: number, column: number): number {
  const lines = text.split('\n');
  const clampedLine = Math.max(1, Math.min(line, lines.length));
  let offset = 0;
  for (let i = 0; i < clampedLine - 1; i += 1) {
    offset += lines[i].length + 1;
  }
  const lineLen = lines[clampedLine - 1]?.length ?? 0;
  const clampedCol = Math.max(1, Math.min(column, lineLen + 1));
  return offset + (clampedCol - 1);
}

export async function copyToClipboard(
  text: string,
  fallbackTextarea?: HTMLTextAreaElement | null,
): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to execCommand fallback
    }
  }

  if (fallbackTextarea) {
    fallbackTextarea.focus();
    fallbackTextarea.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    }
  }

  const temp = document.createElement('textarea');
  temp.value = text;
  temp.setAttribute('readonly', 'true');
  temp.style.position = 'fixed';
  temp.style.opacity = '0';
  temp.style.pointerEvents = 'none';
  document.body.appendChild(temp);
  temp.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  } finally {
    document.body.removeChild(temp);
  }
  return ok;
}

export function encodeSharePayload(code: string, stdin: string): string {
  const json = JSON.stringify({ code, stdin });
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function decodeSharePayload(hash: string): { code: string; stdin: string } | null {
  if (!hash.startsWith('#code=')) return null;
  try {
    let b64 = hash.slice('#code='.length).replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4 !== 0) {
      b64 += '=';
    }
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as { code?: unknown }).code === 'string' &&
      typeof (parsed as { stdin?: unknown }).stdin === 'string'
    ) {
      return parsed as { code: string; stdin: string };
    }
  } catch {
    return null;
  }
  return null;
}
