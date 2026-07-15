/**
 * Skill Quality Tests
 *
 * Validates that adapted skill files in docker/skills/ conform to
 * MCP adaptation rules. Catches issues that review agents might miss.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';

const SKILLS_DIR = resolve(__dirname, '../skills');
const skipIfNoSkills = !existsSync(SKILLS_DIR);

function getAllMdFiles(dir) {
  const files = [];
  function walk(d) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.md')) files.push(full);
    }
  }
  walk(dir);
  return files;
}

describe.skipIf(skipIfNoSkills)('skill quality', () => {
  const allFiles = getAllMdFiles(SKILLS_DIR);

  it('has adapted skills', () => {
    expect(allFiles.length).toBeGreaterThan(0);
  });

  it('every skill directory has a SKILL.md (else it vanishes from lark_list_skills)', () => {
    const missing = [];
    for (const skillName of readdirSync(SKILLS_DIR, { withFileTypes: true })) {
      if (!skillName.isDirectory()) continue;
      if (!existsSync(join(SKILLS_DIR, skillName.name, 'SKILL.md'))) missing.push(skillName.name);
    }
    expect(missing, `skill dirs without SKILL.md:\n${missing.map(m => `  ${m}`).join('\n')}`).toEqual([]);
  });

  it('every SKILL.md has a non-empty, single-quoted description frontmatter (feeds lark_list_skills)', () => {
    const violations = [];
    for (const skillName of readdirSync(SKILLS_DIR)) {
      const skillPath = join(SKILLS_DIR, skillName, 'SKILL.md');
      if (!existsSync(skillPath)) continue;
      const content = readFileSync(skillPath, 'utf8');
      const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (!fm) { violations.push({ skill: skillName, reason: 'no frontmatter block' }); continue; }
      // Locate the description line. The adapt-skill rule mandates ONE double-quoted line —
      // reject block scalars (`>`/`|`) and plain unquoted values, which the server would
      // parse inconsistently or surface vacuously (e.g. a bare ">").
      const descLine = fm[1].split(/\r?\n/).find(l => /^description:/.test(l));
      if (!descLine) { violations.push({ skill: skillName, reason: 'no description key' }); continue; }
      const rawVal = descLine.replace(/^description:[ \t]*/, '').trim();
      if (/^[>|]/.test(rawVal)) { violations.push({ skill: skillName, reason: 'block scalar (>/|) — use a single double-quoted line' }); continue; }
      if (!rawVal.startsWith('"')) { violations.push({ skill: skillName, reason: 'description must be a double-quoted scalar' }); continue; }
      // Parse exactly as server.js does (JSON string semantics) so test == runtime.
      let desc;
      try { desc = JSON.parse(rawVal); } catch { desc = rawVal.replace(/^"|"$/g, '').replace(/\\"/g, '"'); }
      desc = (desc || '').trim();
      if (!desc) { violations.push({ skill: skillName, reason: 'empty description' }); continue; }
      // The description feeds an agent's skill-selection decision; CLI notation must be adapted.
      const leaks = [];
      if (/lark-cli/.test(desc)) leaks.push('lark-cli');
      // +cmd shortcut: a `+` not preceded by an alphanumeric (so C++/a+b don't trip) and
      // followed by a lowercase letter. Catches CJK-punctuation prefixes like `：+agenda`、`、+create`.
      if (/(?<![A-Za-z0-9])\+[a-z]/.test(desc)) leaks.push('+cmd shortcut');
      if (/references\/[^\s]+\.md/.test(desc)) leaks.push('references/*.md path');
      // Raw-API direct call: a lark_<svc>_<resource>_<method>(...) token for a name that is NOT
      // a registered shortcut must go through lark_invoke. We can't load the catalog here, so we
      // flag any direct-call token that is NOT immediately preceded by `tool_name="` and warn —
      // the known raw-API name lark_vc_meeting_get is the canonical offender.
      if (/(?<!tool_name=")\blark_vc_meeting_get\s*\(/.test(desc)) leaks.push('raw-API direct call (use lark_invoke)');
      if (leaks.length) violations.push({ skill: skillName, reason: `unadapted CLI notation: ${leaks.join(', ')}` });
    }
    expect(violations, `description frontmatter issues:\n${violations.map(v => `  ${v.skill}: ${v.reason}`).join('\n')}`).toEqual([]);
  });

  it('no lark-cli references in any file', () => {
    const violations = [];
    for (const file of allFiles) {
      const content = readFileSync(file, 'utf8');
      const matches = content.match(/lark-cli/g);
      if (matches) {
        violations.push({ file: file.replace(SKILLS_DIR + '/', ''), count: matches.length });
      }
    }
    expect(violations, `Files with lark-cli references:\n${violations.map(v => `  ${v.file}: ${v.count}`).join('\n')}`).toEqual([]);
  });

  it('no intra-skill filesystem links ](references/...)', () => {
    const violations = [];
    for (const file of allFiles) {
      const content = readFileSync(file, 'utf8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (/\]\(references\//.test(lines[i])) {
          violations.push({ file: file.replace(SKILLS_DIR + '/', ''), line: i + 1 });
        }
      }
    }
    expect(violations, `Files with ](references/ links:\n${violations.map(v => `  ${v.file}:${v.line}`).join('\n')}`).toEqual([]);
  });

  it('no cross-skill dead links ](../lark-...)', () => {
    const violations = [];
    for (const file of allFiles) {
      const content = readFileSync(file, 'utf8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (/\]\(\.\.\/lark-/.test(lines[i]) || /\]\(\.\.\/\.\.\/lark-/.test(lines[i])) {
          violations.push({ file: file.replace(SKILLS_DIR + '/', ''), line: i + 1 });
        }
      }
    }
    expect(violations, `Files with ../lark-* dead links:\n${violations.map(v => `  ${v.file}:${v.line}`).join('\n')}`).toEqual([]);
  });

  it('no --as user/bot in code blocks', () => {
    const violations = [];
    for (const file of allFiles) {
      const content = readFileSync(file, 'utf8');
      const codeBlocks = content.match(/```[\s\S]*?```/g) || [];
      for (const block of codeBlocks) {
        if (/--as\s+(user|bot)/.test(block)) {
          violations.push(file.replace(SKILLS_DIR + '/', ''));
          break;
        }
      }
    }
    expect(violations, `Files with --as in code blocks:\n${violations.map(v => `  ${v}`).join('\n')}`).toEqual([]);
  });

  it('no Read 工具 / Read tool instructions', () => {
    const violations = [];
    for (const file of allFiles) {
      const content = readFileSync(file, 'utf8');
      if (/Read 工具|Read tool/i.test(content)) {
        violations.push(file.replace(SKILLS_DIR + '/', ''));
      }
    }
    expect(violations, `Files with Read tool refs:\n${violations.map(v => `  ${v}`).join('\n')}`).toEqual([]);
  });

  it('no lark_get_skill(domain="shared") dead references', () => {
    const violations = [];
    for (const file of allFiles) {
      const content = readFileSync(file, 'utf8');
      if (/lark_get_skill\([^)]*domain\s*=\s*"shared"/.test(content)) {
        violations.push(file.replace(SKILLS_DIR + '/', ''));
      }
    }
    expect(violations, `Files with lark_get_skill(domain="shared"):\n${violations.map(v => `  ${v}`).join('\n')}`).toEqual([]);
  });

  it('all lark_get_skill section references resolve to actual files', () => {
    const violations = [];
    for (const file of allFiles) {
      const content = readFileSync(file, 'utf8');
      const ownDomain = file
        .replace(SKILLS_DIR + '/', '')
        .split('/')[0]
        .replace('lark-', '');
      // Capture the full argument list: the target skill dir comes from the
      // call's own domain= argument (cross-domain refs are common), falling
      // back to the containing skill for intra-skill calls that omit it.
      const regex = /lark_get_skill\(([^)]*)\)/g;
      let m;
      while ((m = regex.exec(content)) !== null) {
        const args = m[1];
        const sectionMatch = args.match(/section\s*=\s*"([^"]+)"/);
        if (!sectionMatch) continue;
        const section = sectionMatch[1];
        if (section === '...' || section.includes('<')) continue; // placeholders like assets/templates/<name>.html
        const domainMatch = args.match(/domain\s*=\s*"([^"]+)"/);
        const domain = domainMatch ? domainMatch[1] : ownDomain;
        const skillDir = join(SKILLS_DIR, `lark-${domain}`);
        // Same resolution as skill-sections.js resolveSection(): assets are
        // addressed literally with extension; markdown tries three candidates.
        const isAsset = ['.html', '.txt', '.csv'].some(ext => section.endsWith(ext));
        const candidates = isAsset
          ? [join(skillDir, section)]
          : [
              join(skillDir, 'references', `${section}.md`),
              join(skillDir, 'references', `lark-${domain}-${section}.md`),
              join(skillDir, `${section}.md`),
            ];
        if (!candidates.some(p => existsSync(p))) {
          violations.push({ file: file.replace(SKILLS_DIR + '/', ''), domain, section });
        }
      }
    }
    expect(violations, `Unresolvable section references:\n${violations.map(v => `  ${v.file}: domain="${v.domain}" section="${v.section}"`).join('\n')}`).toEqual([]);
  });

  it('all resource files are reachable from at least one file in the same skill (except known orphans from upstream)', () => {
    // Known upstream orphan files that are not referenced by any other file
    const knownOrphans = new Set(['lark-slides/references/slide-templates.md']);
    const violations = [];
    for (const skillName of readdirSync(SKILLS_DIR)) {
      const skillDir = join(SKILLS_DIR, skillName);
      if (!existsSync(join(skillDir, 'SKILL.md'))) continue;

      const domain = skillName.replace('lark-', '');
      // Concatenate all .md content in this skill
      const allContent = getAllMdFiles(skillDir).map(f => readFileSync(f, 'utf8')).join('\n');

      // Check every .md file (except SKILL.md itself) is referenced somewhere
      for (const file of getAllMdFiles(skillDir)) {
        if (file.endsWith('/SKILL.md')) continue;
        const fname = file.split('/').pop().replace('.md', '');
        const section = fname.replace(`lark-${domain}-`, '');
        const sectionUnderscore = section.replace(/-/g, '_');
        const mentioned = allContent.includes(`section="${section}"`) ||
                          allContent.includes(`section="${fname}"`) ||
                          allContent.includes(fname) ||
                          allContent.includes(section) ||
                          allContent.includes(sectionUnderscore);
        if (!mentioned) {
          const relPath = `${skillName}/${file.replace(skillDir + '/', '')}`;
          if (!knownOrphans.has(relPath)) {
            violations.push({ skill: skillName, file: file.replace(skillDir + '/', '') });
          }
        }
      }
    }
    if (violations.length > 0) {
      const report = violations.map(v => `  ${v.skill}: ${v.file}`).join('\n');
      expect.fail(`${violations.length} resource file(s) unreachable (not referenced by any file in the skill):\n${report}`);
    }
  });
});
