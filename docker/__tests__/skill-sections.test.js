/**
 * Unit tests for skill-sections.js — section listing/resolution behind
 * lark_get_skill. Imports the REAL module so these tests cannot drift from the
 * shipped server behavior.
 *
 * Covers: backward-compatible markdown (listed/addressed WITHOUT extension),
 * the new text-asset support added for 方案 B (.html/.txt/.csv, listed/addressed
 * WITH extension + relative path), the path-traversal guard, binary exclusion,
 * and skill-dir containment.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  ASSET_EXTENSIONS,
  isAssetFile,
  isUnsafeSection,
  listSections,
  listAllSections,
  resolveSection,
} from '../skill-sections.js';

// Build a realistic skill tree on disk:
//   lark-mail/
//     SKILL.md
//     references/lark-mail-html.md
//     references/lark-mail-send.md
//     assets/templates/weekly--team-report.html
//     assets/templates/notes.txt
//     assets/logo.png            (binary — must NOT be exposed)
//   lark-doc/
//     references/style/lark-doc-style.md   (nested subdir markdown)
let root;
let mailDir;
let docDir;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'skill-sections-'));
  mailDir = join(root, 'lark-mail');
  docDir = join(root, 'lark-doc');
  mkdirSync(join(mailDir, 'references'), { recursive: true });
  mkdirSync(join(mailDir, 'assets', 'templates'), { recursive: true });
  mkdirSync(join(docDir, 'references', 'style'), { recursive: true });

  writeFileSync(join(mailDir, 'SKILL.md'), '# mail\n');
  writeFileSync(join(mailDir, 'references', 'lark-mail-html.md'), '# html guide\n');
  writeFileSync(join(mailDir, 'references', 'lark-mail-send.md'), '# send\n');
  writeFileSync(join(mailDir, 'assets', 'templates', 'weekly--team-report.html'), '<html>weekly</html>\n');
  writeFileSync(join(mailDir, 'assets', 'templates', 'notes.txt'), 'plain notes\n');
  writeFileSync(join(mailDir, 'assets', 'logo.png'), 'PNGDATA');

  // node_modules must be excluded at BOTH the top level (listAllSections) and
  // inside a recursed subdir (listSections) — a skill that vendors deps must not
  // leak node_modules/**/*.md as fetchable sections.
  mkdirSync(join(mailDir, 'node_modules', 'pkg'), { recursive: true });
  writeFileSync(join(mailDir, 'node_modules', 'pkg', 'readme.md'), '# vendored\n');
  mkdirSync(join(mailDir, 'references', 'node_modules'), { recursive: true });
  writeFileSync(join(mailDir, 'references', 'node_modules', 'dep.md'), '# nested vendored\n');

  writeFileSync(join(docDir, 'references', 'style', 'lark-doc-style.md'), '# style\n');
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('isAssetFile', () => {
  it('matches the supported text extensions', () => {
    expect(isAssetFile('x.html')).toBe(true);
    expect(isAssetFile('x.txt')).toBe(true);
    expect(isAssetFile('x.csv')).toBe(true);
  });
  it('does not match markdown or binary types', () => {
    expect(isAssetFile('x.md')).toBe(false);
    expect(isAssetFile('logo.png')).toBe(false);
    expect(isAssetFile('archive.zip')).toBe(false);
  });
  it('ASSET_EXTENSIONS stays text-only (no binary types leak in)', () => {
    for (const ext of ASSET_EXTENSIONS) {
      expect(['.html', '.txt', '.csv']).toContain(ext);
    }
  });
});

describe('isUnsafeSection', () => {
  it('rejects path traversal, backslashes, and absolute paths', () => {
    expect(isUnsafeSection('../../etc/passwd')).toBe(true);
    expect(isUnsafeSection('a\\b')).toBe(true);
    expect(isUnsafeSection('/etc/passwd')).toBe(true);
  });
  it('accepts ordinary section names and asset paths', () => {
    expect(isUnsafeSection('create')).toBe(false);
    expect(isUnsafeSection('routes/dsl')).toBe(false);
    expect(isUnsafeSection('assets/templates/weekly--team-report.html')).toBe(false);
  });
});

describe('listSections (backward-compatible markdown)', () => {
  it('lists markdown WITHOUT extension', () => {
    const sections = listSections(join(mailDir, 'references'), 'references/');
    expect(sections).toContain('references/lark-mail-html');
    expect(sections).toContain('references/lark-mail-send');
    // never with a .md suffix
    expect(sections.some(s => s.endsWith('.md'))).toBe(false);
  });

  it('lists nested-subdir markdown with full relative path, no extension', () => {
    const sections = listSections(join(docDir, 'references'), 'references/');
    expect(sections).toContain('references/style/lark-doc-style');
  });
});

describe('listSections (text assets — 方案 B)', () => {
  it('lists text assets WITH extension and relative path', () => {
    const sections = listSections(join(mailDir, 'assets'), 'assets/');
    expect(sections).toContain('assets/templates/weekly--team-report.html');
    expect(sections).toContain('assets/templates/notes.txt');
  });

  it('does NOT list binary assets', () => {
    const sections = listSections(join(mailDir, 'assets'), 'assets/');
    expect(sections.some(s => s.endsWith('.png'))).toBe(false);
  });
});

describe('listAllSections', () => {
  it('enumerates md (no ext) and text assets (with ext) across subdirs', () => {
    const all = listAllSections(mailDir);
    expect(all).toContain('references/lark-mail-html');
    expect(all).toContain('assets/templates/weekly--team-report.html');
    expect(all).toContain('assets/templates/notes.txt');
    expect(all.some(s => s.endsWith('.png'))).toBe(false);
  });

  it('returns [] for a missing skill dir', () => {
    expect(listAllSections(join(root, 'lark-nonexistent'))).toEqual([]);
  });

  it('excludes node_modules at the top level', () => {
    const all = listAllSections(mailDir);
    expect(all.some(s => s.startsWith('node_modules/'))).toBe(false);
    expect(all).not.toContain('node_modules/pkg/readme');
  });

  it('excludes node_modules nested inside a recursed subdir', () => {
    // references/node_modules/dep.md must not surface
    const all = listAllSections(mailDir);
    expect(all.some(s => s.includes('node_modules'))).toBe(false);
    expect(all).not.toContain('references/node_modules/dep');
    // ...while the real reference sibling is still listed
    expect(all).toContain('references/lark-mail-html');
  });
});

describe('resolveSection (markdown — unchanged behavior)', () => {
  it('resolves a bare section via references/<section>.md', () => {
    const p = resolveSection(mailDir, 'mail', 'lark-mail-send');
    expect(p).toBe(join(mailDir, 'references', 'lark-mail-send.md'));
  });

  it('resolves via the lark-<domain>-<section>.md convention', () => {
    // section="send" → references/lark-mail-send.md
    const p = resolveSection(mailDir, 'mail', 'send');
    expect(p).toBe(join(mailDir, 'references', 'lark-mail-send.md'));
  });

  it('resolves nested-subdir markdown via <section>.md', () => {
    const p = resolveSection(docDir, 'doc', 'references/style/lark-doc-style');
    expect(p).toBe(join(docDir, 'references', 'style', 'lark-doc-style.md'));
  });

  it('returns null for an unknown markdown section', () => {
    expect(resolveSection(mailDir, 'mail', 'does-not-exist')).toBeNull();
  });
});

describe('resolveSection (text assets — 方案 B)', () => {
  it('resolves an .html asset addressed with its extension + path', () => {
    const p = resolveSection(mailDir, 'mail', 'assets/templates/weekly--team-report.html');
    expect(p).toBe(join(mailDir, 'assets', 'templates', 'weekly--team-report.html'));
  });

  it('resolves a .txt asset', () => {
    const p = resolveSection(mailDir, 'mail', 'assets/templates/notes.txt');
    expect(p).toBe(join(mailDir, 'assets', 'templates', 'notes.txt'));
  });

  it('returns null for an asset path that does not exist', () => {
    expect(resolveSection(mailDir, 'mail', 'assets/templates/missing.html')).toBeNull();
  });

  it('does NOT resolve a binary asset (png not in allow-list → treated as md, no match)', () => {
    expect(resolveSection(mailDir, 'mail', 'assets/logo.png')).toBeNull();
  });
});

describe('resolveSection (containment)', () => {
  it('never resolves outside the skill dir even if a candidate would escape', () => {
    // An asset-looking section that tries to climb out. isUnsafeSection catches
    // this at the server layer, but resolveSection must be safe on its own too.
    expect(resolveSection(mailDir, 'mail', '../lark-doc/references/style/lark-doc-style.html')).toBeNull();
  });
});
