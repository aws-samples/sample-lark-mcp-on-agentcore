/**
 * Unit tests for extractSkillDescription — the function that produces the
 * one-line summary surfaced by lark_list_skills (progressive-disclosure level 1).
 *
 * Imports the REAL module (docker/skill-description.js) so these tests can never
 * drift from the shipped implementation. Covers every branch flagged by the
 * adversarial review: quoted scalars (incl. escapes), block scalars (>/|),
 * empty/missing descriptions, the heading+prose fallback (incl. code fences),
 * CRLF tolerance, and the final dir fallback.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { extractSkillDescription } from '../skill-description.js';

describe('extractSkillDescription — quoted scalar', () => {
  it('returns a plain double-quoted description', () => {
    const md = '---\nname: x\ndescription: "飞书审批：审批实例。"\n---\n# approval';
    expect(extractSkillDescription(md, 'lark-approval')).toBe('飞书审批：审批实例。');
  });

  it('unescapes inner escaped quotes (the bug the old [^"]+ regex truncated on)', () => {
    const md = '---\ndescription: "say \\"hi\\" there"\n---\n# h';
    expect(extractSkillDescription(md, 'd')).toBe('say "hi" there');
  });

  it('does NOT truncate at the first escaped quote (full value preserved)', () => {
    // mirrors lark-calendar: a \" appears mid-string; old regex cut it to ~145 chars
    const md = '---\ndescription: "before \\"calendar\\" after — and a long tail that must survive"\n---\n# cal';
    expect(extractSkillDescription(md, 'd')).toBe('before "calendar" after — and a long tail that must survive');
  });

  it('handles \\n / \\t JSON escapes via JSON.parse', () => {
    const md = '---\ndescription: "line1\\nline2\\tend"\n---\n# h';
    expect(extractSkillDescription(md, 'd')).toBe('line1\nline2\tend');
  });

  it('falls through to heading/prose when the quoted value is empty', () => {
    const md = '---\nname: x\ndescription: ""\n---\n# Fallback Heading\nFallback prose';
    expect(extractSkillDescription(md, 'd')).toBe('Fallback Heading — Fallback prose');
  });

  it('falls back to dir when quoted value is empty and there is no body', () => {
    const md = '---\nname: x\ndescription: ""\n---\n';
    expect(extractSkillDescription(md, 'lark-empty')).toBe('lark-empty');
  });

  it('recovers via the catch path if JSON.parse fails (malformed escape)', () => {
    // A stray single backslash makes JSON.parse throw; fallback strips wrappers + \"
    const md = '---\ndescription: "path C:\\x weird"\n---\n# h';
    const got = extractSkillDescription(md, 'd');
    expect(got).toBe('path C:\\x weird');
  });
});

describe('extractSkillDescription — block scalars', () => {
  it('folds a > block scalar into one line', () => {
    const md = '---\nname: x\ndescription: >\n  飞书画板：查询和编辑\n  画板内容\n---\n# wb';
    expect(extractSkillDescription(md, 'd')).toBe('飞书画板：查询和编辑 画板内容');
  });

  it('joins a | literal block scalar (whitespace-collapsed to one line)', () => {
    const md = '---\nname: x\ndescription: |\n  line one\n  line two\n---\n# h';
    expect(extractSkillDescription(md, 'd')).toBe('line one line two');
  });

  it('handles a > block scalar with a chomping indicator (>-)', () => {
    const md = '---\ndescription: >-\n  folded chomped\n  second\n---\n# h';
    expect(extractSkillDescription(md, 'd')).toBe('folded chomped second');
  });

  it('stops collecting block lines at a dedented key', () => {
    const md = '---\ndescription: >\n  kept line\nname: x\n---\n# h';
    expect(extractSkillDescription(md, 'd')).toBe('kept line');
  });
});

describe('extractSkillDescription — plain unquoted scalar', () => {
  it('returns an unquoted single-line value', () => {
    const md = '---\nname: x\ndescription: just plain text\n---\n# h';
    expect(extractSkillDescription(md, 'd')).toBe('just plain text');
  });
});

describe('extractSkillDescription — heading + prose fallback', () => {
  it('uses "# Heading — first prose" when no description key exists', () => {
    const md = '---\nname: x\nversion: 1\n---\n# Heading Only\nprose line';
    expect(extractSkillDescription(md, 'd')).toBe('Heading Only — prose line');
  });

  it('skips a **bold CRITICAL** banner when choosing prose', () => {
    const md = '---\nname: x\nversion: 1\n---\n# My Heading\n**CRITICAL banner**\nactual prose';
    expect(extractSkillDescription(md, 'd')).toBe('My Heading — actual prose');
  });

  it('does NOT pick a line from inside a code fence', () => {
    const md = '---\nname: x\nversion: 1\n---\n# My Heading\n```\ncode\n```\nactual prose';
    expect(extractSkillDescription(md, 'd')).toBe('My Heading — actual prose');
  });

  it('works with no frontmatter at all', () => {
    const md = '# contact\nsome prose here';
    expect(extractSkillDescription(md, 'd')).toBe('contact — some prose here');
  });

  it('treats a nested ## subheading as a heading (skipped, not prose)', () => {
    const md = '# contact\n## 选哪个工具\nfirst real prose';
    expect(extractSkillDescription(md, 'd')).toBe('contact — first real prose');
  });
});

describe('extractSkillDescription — dir fallback', () => {
  it('returns dir for empty content', () => {
    expect(extractSkillDescription('', 'lark-x')).toBe('lark-x');
  });

  it('returns dir when there is only frontmatter and no usable description or body', () => {
    const md = '---\nname: x\nversion: 1\n---\n';
    expect(extractSkillDescription(md, 'lark-y')).toBe('lark-y');
  });
});

describe('extractSkillDescription — CRLF tolerance', () => {
  it('parses CRLF frontmatter', () => {
    const md = '---\r\nname: x\r\ndescription: "crlf value"\r\n---\r\nbody';
    expect(extractSkillDescription(md, 'd')).toBe('crlf value');
  });

  it('folds a CRLF block scalar', () => {
    const md = '---\r\ndescription: >\r\n  one\r\n  two\r\n---\r\n# h';
    expect(extractSkillDescription(md, 'd')).toBe('one two');
  });
});

// Integration guard: run the real function over every shipped skill and assert
// each yields a full, leak-free, non-degenerate description. This is what
// lark_list_skills actually returns in production.
describe('extractSkillDescription — over all shipped skills', () => {
  const SKILLS_DIR = resolve(__dirname, '../skills');
  const available = existsSync(SKILLS_DIR);

  it.skipIf(!available)('every shipped skill yields a clean, full description (not the dir name)', () => {
    const problems = [];
    for (const dir of readdirSync(SKILLS_DIR).sort()) {
      const p = join(SKILLS_DIR, dir, 'SKILL.md');
      if (!existsSync(p)) continue;
      const desc = extractSkillDescription(readFileSync(p, 'utf8'), dir);
      const issues = [];
      if (desc === dir) issues.push('degenerated to dir name');
      if (desc === '>' || desc === '|') issues.push('bare block-scalar indicator');
      if (desc.length < 10) issues.push(`too short (${desc.length})`);
      if (desc.includes('lark-cli')) issues.push('contains lark-cli');
      if (/references\/[^\s]+\.md/.test(desc)) issues.push('contains references/*.md');
      if (issues.length) problems.push(`${dir}: ${issues.join(', ')}`);
    }
    expect(problems, `degenerate descriptions:\n${problems.join('\n')}`).toEqual([]);
  });
});
