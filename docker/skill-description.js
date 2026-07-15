// Pure helper: derive the one-line summary returned by lark_list_skills.
//
// Kept in its own side-effect-free module so it can be unit-tested directly
// (server.js starts an HTTP listener on import and cannot be required in tests).
//
// Prefer the frontmatter `description:` (the authoritative summary, kept by
// adapt-skill-for-mcp). Handles quoted values (honoring \" and other JSON
// escapes), unquoted scalars, and YAML block scalars (`>`/`|`). Falls back to
// the first heading + first prose paragraph so a skill that loses its
// frontmatter still surfaces something meaningful instead of a bare directory
// name. CRLF-tolerant.
function extractSkillDescription(content, dir) {
  const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (fm) {
    const block = fm[1].split(/\r?\n/);
    for (let i = 0; i < block.length; i++) {
      const m = block[i].match(/^description:[ \t]*(.*)$/);
      if (!m) continue;
      const raw = m[1].trim();
      // Quoted scalar — parse as a JSON string to handle \" \n \t \\ etc.
      if (raw.startsWith('"')) {
        let val;
        try { val = JSON.parse(raw); } catch { val = raw.replace(/^"|"$/g, '').replace(/\\"/g, '"'); }
        if (val && val.trim()) return val.trim();
        break; // empty quoted → fall through to heading/prose
      }
      // Block scalar (`>` folded or `|` literal) — gather indented continuation lines.
      if (raw === '>' || raw === '|' || /^[>|][+-]?\d*$/.test(raw)) {
        const collected = [];
        for (let j = i + 1; j < block.length; j++) {
          if (/^\s+\S/.test(block[j])) collected.push(block[j].trim());
          else if (block[j].trim() === '') collected.push('');
          else break;
        }
        const folded = (raw[0] === '>' ? collected.join(' ') : collected.join('\n')).replace(/\s+/g, ' ').trim();
        if (folded) return folded;
        break;
      }
      // Plain unquoted scalar.
      if (raw) return raw;
      break;
    }
  }
  // Fallback: "# Heading — first non-empty, non-bold prose line" (skip code fences entirely)
  const body = fm ? content.slice(fm[0].length) : content;
  const lines = body.split(/\r?\n/);
  let heading = '';
  let prose = '';
  let inFence = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('```')) { inFence = !inFence; continue; }
    if (inFence) continue;
    if (!heading && line.startsWith('#')) { heading = line.replace(/^#+\s*/, ''); continue; }
    // skip bold CRITICAL/BLOCKING banners when picking prose
    if (!prose && heading && !line.startsWith('**') && !line.startsWith('#')) {
      prose = line.replace(/^[->\s]+/, '');
      break;
    }
  }
  const summary = [heading, prose].filter(Boolean).join(' — ');
  return summary || dir;
}

module.exports = { extractSkillDescription };
