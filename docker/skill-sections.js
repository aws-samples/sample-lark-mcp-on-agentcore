// Pure helpers for lark_get_skill section resolution and listing.
//
// Kept in its own side-effect-free module so it can be unit-tested directly
// (server.js starts an HTTP listener on import and cannot be required in tests).
//
// Two concerns live here:
//   - listSections(): enumerate the fetchable sections under a skill dir.
//   - resolveSection(): map a requested `section` string to an on-disk file.
//
// Backward-compatible markdown behavior is preserved exactly: `.md` files are
// listed and addressed WITHOUT their extension (section="create" → references/
// create.md). In addition, text-only ASSET files (.html/.txt/.csv) are exposed
// WITH their extension and relative path (section="assets/templates/x.html"),
// so adapted skills that ship reference templates can serve them through
// lark_get_skill. Binary assets are intentionally NOT supported — the MCP
// response is text/UTF-8 only.

const fs = require('fs');
const path = require('path');

// Text asset extensions that lark_get_skill may serve verbatim. Markdown is
// handled separately (listed/addressed without extension); these are listed and
// addressed WITH their extension. Keep this list text-only: the server returns
// content as a UTF-8 {type:'text'} block, so binary types (png, pdf, …) must NOT
// be added here.
const ASSET_EXTENSIONS = ['.html', '.txt', '.csv'];

function isAssetFile(name) {
  return ASSET_EXTENSIONS.some(ext => name.endsWith(ext));
}

// Recursively enumerate fetchable sections under `dir`.
//   - markdown:   `references/create.md`        → "create"            (no ext)
//   - md in sub:  `routes/dsl.md`               → "routes/dsl"        (no ext)
//   - asset:      `assets/templates/x.html`     → "assets/templates/x.html" (with ext + path)
// `prefix` carries the relative path of `dir` from the skill root (with a
// trailing slash, or '' at the root).
function listSections(dir, prefix = '', fsImpl = fs) {
  const results = [];
  if (!fsImpl.existsSync(dir)) return results;
  for (const entry of fsImpl.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    if (entry.isDirectory()) {
      results.push(...listSections(`${dir}/${entry.name}`, `${prefix}${entry.name}/`, fsImpl));
    } else if (entry.name.endsWith('.md')) {
      results.push(`${prefix}${entry.name.replace(/\.md$/, '')}`);
    } else if (isAssetFile(entry.name)) {
      results.push(`${prefix}${entry.name}`);
    }
  }
  return results;
}

// Enumerate every section under a skill directory's subdirectories (the form
// lark_get_skill advertises). Mirrors the previous inline behavior: only
// recurses into subdirectories, skipping loose files at the skill root.
function listAllSections(skillDir, fsImpl = fs) {
  const all = [];
  if (!fsImpl.existsSync(skillDir)) return all;
  for (const sub of fsImpl.readdirSync(skillDir, { withFileTypes: true })) {
    if (sub.isDirectory() && sub.name !== 'node_modules') {
      all.push(...listSections(`${skillDir}/${sub.name}`, `${sub.name}/`, fsImpl));
    }
  }
  return all;
}

// Returns true if `section` is unsafe (path traversal / absolute / backslash).
function isUnsafeSection(section) {
  return /\\|\.\./.test(section) || section.startsWith('/');
}

// Resolve a requested section to an absolute file path under `skillDir`, or
// null if no candidate exists. `domain` is the bare domain (no `lark-` prefix),
// used for the `lark-<domain>-<section>.md` convention.
//
// Resolution order:
//   1. If the section names a text asset (ends in an asset extension), address
//      it literally and relative to the skill root: `<skillDir>/<section>`.
//   2. Otherwise treat it as markdown and try, in order:
//        references/<section>.md
//        references/lark-<domain>-<section>.md
//        <section>.md                      (subdir paths: routes/dsl, scenes/x)
//
// A final containment check guarantees the resolved path stays inside skillDir
// even if a caller slips something past isUnsafeSection().
function resolveSection(skillDir, domain, section, fsImpl = fs) {
  let candidates;
  if (isAssetFile(section)) {
    candidates = [`${skillDir}/${section}`];
  } else {
    candidates = [
      `${skillDir}/references/${section}.md`,
      `${skillDir}/references/lark-${domain}-${section}.md`,
      `${skillDir}/${section}.md`,
    ];
  }
  const root = path.resolve(skillDir);
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) continue;
    if (fsImpl.existsSync(resolved)) return resolved;
  }
  return null;
}

module.exports = {
  ASSET_EXTENSIONS,
  isAssetFile,
  isUnsafeSection,
  listSections,
  listAllSections,
  resolveSection,
};
