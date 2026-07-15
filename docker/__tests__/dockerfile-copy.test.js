/**
 * Guard: every local module server.js require()s must be COPYed into the image.
 *
 * The Dockerfile COPYs runtime files one-by-one (a deny-by-default allow-list),
 * NOT `COPY *.js`. So adding a new `require('./foo')` to server.js without a
 * matching `COPY foo.js /app/foo.js` produces an image that lint + unit tests
 * pass cleanly (they run against the source tree, never the image) but that
 * crashes at container startup with MODULE_NOT_FOUND.
 *
 * This test runs in plain `npm test` (no Docker needed), so it catches the
 * missing-COPY class in the source-only path. The end-to-end container boot is
 * covered separately by scripts/test-smoke-docker.sh (wired into CI).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const DOCKER_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');

function localRequires(jsSource) {
  // require('./x') or require('./x.js') — relative siblings only (not node_modules).
  const re = /require\(\s*['"]\.\/([^'"]+)['"]\s*\)/g;
  const names = new Set();
  let m;
  while ((m = re.exec(jsSource)) !== null) {
    names.add(m[1].replace(/\.js$/, ''));
  }
  return [...names];
}

function copiedFiles(dockerfile) {
  // COPY <src> /app/<dst> — collect the basenames of the source side.
  const copied = new Set();
  for (const line of dockerfile.split('\n')) {
    const m = line.match(/^\s*COPY\s+(\S+)\s+\/app\//);
    if (m) copied.add(m[1].replace(/\.js$/, ''));
  }
  return copied;
}

describe('Dockerfile COPY covers server.js local requires', () => {
  const serverSrc = readFileSync(join(DOCKER_DIR, 'server.js'), 'utf8');
  const dockerfile = readFileSync(join(DOCKER_DIR, 'Dockerfile'), 'utf8');
  const required = localRequires(serverSrc);
  const copied = copiedFiles(dockerfile);

  it('server.js require()s at least one local module (sanity)', () => {
    expect(required.length).toBeGreaterThan(0);
  });

  it.each(['skill-description', 'skill-sections', 'server-lib'])(
    'COPYs the known runtime module %s.js',
    (mod) => {
      expect(copied.has(mod)).toBe(true);
    },
  );

  it('every local require() in server.js has a matching Dockerfile COPY', () => {
    const missing = required.filter((mod) => !copied.has(mod));
    expect(
      missing,
      `server.js require()s these local modules with no matching "COPY <file> /app/" in docker/Dockerfile ` +
        `(they would crash the container at startup with MODULE_NOT_FOUND): ${missing.join(', ')}`,
    ).toEqual([]);
  });
});
