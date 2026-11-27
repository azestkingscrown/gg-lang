import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const VSCODE_DIR = path.resolve(process.cwd(), 'editors', 'vscode');

interface GrammarRule {
  name?: string;
  match?: string;
}

interface GrammarFile {
  scopeName: string;
  patterns: Array<{ include: string }>;
  repository: Record<string, { patterns: GrammarRule[] }>;
}

function collectAllRules(grammar: GrammarFile): GrammarRule[] {
  const rules: GrammarRule[] = [];
  for (const key of Object.keys(grammar.repository)) {
    rules.push(...grammar.repository[key].patterns);
  }
  return rules;
}

function matchFirstRule(grammar: GrammarFile, tokenLine: string): string | null {
  for (const inc of grammar.patterns) {
    const repoKey = inc.include.replace(/^#/, '');
    const group = grammar.repository[repoKey];
    if (!group) continue;
    for (const rule of group.patterns) {
      if (!rule.match || !rule.name) continue;
      const re = new RegExp(rule.match, 'u');
      if (re.test(tokenLine)) {
        return rule.name;
      }
    }
  }
  return null;
}

describe('VS Code Extension (editors/vscode)', () => {
  it('매니페스트, 언어 설정, 문법, 스니펫 JSON 파일과 경로가 유효하다', () => {
    const pkgPath = path.join(VSCODE_DIR, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
      name: string;
      version: string;
      contributes: {
        languages: Array<{ id: string; extensions: string[]; configuration: string }>;
        grammars: Array<{ language: string; scopeName: string; path: string }>;
        snippets: Array<{ language: string; path: string }>;
      };
    };

    expect(pkg.name).toBe('gg-lang-vscode');
    expect(pkg.contributes.languages[0].id).toBe('gg');
    expect(pkg.contributes.languages[0].extensions).toEqual(['.gg', '.GG']);

    const langCfgPath = path.resolve(VSCODE_DIR, pkg.contributes.languages[0].configuration);
    const grammarPath = path.resolve(VSCODE_DIR, pkg.contributes.grammars[0].path);
    const snippetsPath = path.resolve(VSCODE_DIR, pkg.contributes.snippets[0].path);

    expect(fs.existsSync(langCfgPath)).toBe(true);
    expect(fs.existsSync(grammarPath)).toBe(true);
    expect(fs.existsSync(snippetsPath)).toBe(true);

    const langCfg = JSON.parse(fs.readFileSync(langCfgPath, 'utf8')) as {
      comments: { lineComment: string };
      folding: { markers: { start: string; end: string } };
      indentationRules: { increaseIndentPattern: string; decreaseIndentPattern: string };
    };
    expect(langCfg.comments.lineComment).toBe('//');
    expect(() => new RegExp(langCfg.folding.markers.start, 'u')).not.toThrow();
    expect(() => new RegExp(langCfg.folding.markers.end, 'u')).not.toThrow();
    expect(() => new RegExp(langCfg.indentationRules.increaseIndentPattern, 'u')).not.toThrow();
    expect(() => new RegExp(langCfg.indentationRules.decreaseIndentPattern, 'u')).not.toThrow();

    const snippets = JSON.parse(fs.readFileSync(snippetsPath, 'utf8')) as Record<
      string,
      { prefix: string; body: string[] }
    >;
    expect(Object.keys(snippets).length).toBeGreaterThanOrEqual(8);
    expect(snippets['Program Skeleton']?.prefix).toBe('gg-init');
  });

  it('TextMate 문법의 모든 정규식이 컴파일되고 정상/오류 토큰을 정확히 분류한다', () => {
    const grammarPath = path.join(VSCODE_DIR, 'syntaxes', 'gg.tmLanguage.json');
    const grammar = JSON.parse(fs.readFileSync(grammarPath, 'utf8')) as GrammarFile;
    expect(grammar.scopeName).toBe('source.gg');

    for (const rule of collectAllRules(grammar)) {
      const pattern = rule.match;
      if (pattern) {
        expect(() => new RegExp(pattern, 'u'), rule.name).not.toThrow();
      }
    }

    expect(matchFirstRule(grammar, '// 주석')).toBe('comment.line.double-slash.gg');
    expect(matchFirstRule(grammar, '요이~')).toBe('keyword.control.boundary.gg');
    expect(matchFirstRule(grammar, '줴줴이야')).toBe('keyword.control.boundary.gg');
    expect(matchFirstRule(grammar, '아뇨아뇨~')).toBe('keyword.control.flow.gg');
    expect(matchFirstRule(grammar, '넌 나가라!')).toBe('keyword.control.stack.gg');
    expect(matchFirstRule(grammar, '아 예?')).toBe('support.function.io.gg');
    expect(matchFirstRule(grammar, '야~르!')).toBe('support.function.io.gg');
    expect(matchFirstRule(grammar, '지~~롤?')).toBe('keyword.operator.comparison.gg');
    expect(matchFirstRule(grammar, '지~~~롤')).toBe('keyword.operator.arithmetic.gg');
    expect(matchFirstRule(grammar, '쥐~랄!')).toBe('entity.name.function.memory.gg');
    expect(matchFirstRule(grammar, '쥐~~~~랄')).toBe('entity.name.function.stack.gg');
    expect(matchFirstRule(grammar, '어엄...')).toBe('constant.numeric.gg');
    expect(matchFirstRule(grammar, '엄')).toBe('constant.numeric.gg');
    expect(matchFirstRule(grammar, '엄...//붙은주석')).toBe('comment.line.double-slash.gg');

    // Invalid literals & excess tildes must fall into invalid.illegal.gg
    expect(matchFirstRule(grammar, '엄.,')).toBe('invalid.illegal.gg');
    expect(matchFirstRule(grammar, '어엄')).toBe('invalid.illegal.gg');
    expect(matchFirstRule(grammar, '지~~~~~랄')).toBe('invalid.illegal.gg');
    expect(matchFirstRule(grammar, '지~~~랄?')).toBe('invalid.illegal.gg');
    expect(matchFirstRule(grammar, '쥐~~랄!')).toBe('invalid.illegal.gg');
  });
});
