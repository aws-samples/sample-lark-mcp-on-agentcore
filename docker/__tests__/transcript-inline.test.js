import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  needsTranscriptInline,
  runTranscriptInline,
} from '../server-lib.js';

// `minutes +detail --transcript` and `note +transcript` write the transcript to a
// file and print only its path, which a remote MCP agent cannot open. The fake
// `run` below plays lark-cli: it writes files relative to the cwd it is given and
// returns the JSON envelope, so each test asserts on what the agent receives and
// on what is left on disk afterwards.
let tmpRoot;
beforeEach(() => { tmpRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'transcript-test-'))); });
afterEach(() => { fs.rmSync(tmpRoot, { recursive: true, force: true }); });

function fakeCli(write, envelope) {
  const calls = [];
  const run = async (args, cwd) => {
    calls.push({ args, cwd });
    const written = {};
    for (const [rel, text] of Object.entries(write)) {
      const full = path.join(cwd, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, text);
      written[rel] = full;
    }
    return { stdout: JSON.stringify(typeof envelope === 'function' ? envelope(written, cwd) : envelope), stderr: '' };
  };
  return { run, calls };
}

const MINUTES = ['minutes', '+detail', '--minute-tokens', 'obc1', '--transcript'];
const NOTE = ['note', '+transcript', '--note-id', 'n1'];
const parse = (result) => JSON.parse(result.stdout);
const leftovers = () => fs.readdirSync(tmpRoot);

describe('needsTranscriptInline', () => {
  it('matches the two transcript-writing commands only', () => {
    expect(needsTranscriptInline(NOTE)).toBe(true);
    expect(needsTranscriptInline(MINUTES)).toBe(true);
    expect(needsTranscriptInline(['minutes', '+detail', '--minute-tokens', 'obc1', '--summary'])).toBe(false);
    expect(needsTranscriptInline(['note', '+detail', '--note-id', 'n1'])).toBe(false);
    expect(needsTranscriptInline(['minutes', '+download', '--minute-tokens', 'obc1'])).toBe(false);
  });

  it('leaves --dry-run alone (nothing is written)', () => {
    expect(needsTranscriptInline([...NOTE, '--dry-run'])).toBe(false);
  });
});

describe('runTranscriptInline', () => {
  it('passes other commands through untouched, with no cwd override', async () => {
    const { run, calls } = fakeCli({}, { ok: true, data: { x: 1 } });
    const args = ['calendar', '+agenda'];
    const result = await runTranscriptInline(run, args, { tmpRoot });
    expect(calls).toEqual([{ args, cwd: undefined }]);
    expect(parse(result)).toEqual({ ok: true, data: { x: 1 } });
  });

  it('drops agent-supplied output locations and forces JSON', async () => {
    const { run, calls } = fakeCli({}, { ok: true, data: {} });
    await runTranscriptInline(run, [
      'minutes', '+detail', '--minute-tokens', 'obc1', '--transcript',
      '--output-dir', '/etc', '--overwrite', '--format', 'table', '--jq', '.data',
    ], { tmpRoot });
    await runTranscriptInline(run, [...NOTE, '--output', '../../escape.md', '--json'], { tmpRoot });
    expect(calls[0].args).toEqual(['minutes', '+detail', '--minute-tokens', 'obc1', '--transcript', '--format', 'json']);
    expect(calls[1].args).toEqual(['note', '+transcript', '--note-id', 'n1', '--format', 'json']);
    expect(path.dirname(calls[0].cwd)).toBe(tmpRoot);
    expect(calls[0].cwd).not.toBe(calls[1].cwd);
  });

  it('replaces the minutes transcript_file path with its content', async () => {
    const text = '[00:01] 张三：样品外观划痕是 3 号线的。\n[00:09] 李四：下周一前出报告。\n';
    const { run } = fakeCli({ 'minutes/obc1/transcript.txt': text }, {
      ok: true,
      data: { minutes: [{ minute_token: 'obc1', artifacts: { summary: 's', transcript_file: './minutes/obc1/transcript.txt' } }] },
    });
    const artifacts = parse(await runTranscriptInline(run, MINUTES, { tmpRoot })).data.minutes[0].artifacts;
    expect(artifacts).toEqual({
      summary: 's',
      transcript_content: text,
      transcript_bytes: Buffer.byteLength(text),
      transcript_truncated: false,
    });
  });

  it('matches an absolute path under the call directory (note +transcript)', async () => {
    const { run } = fakeCli({ 'notes/n1/unified_transcript.md': '# 逐字稿\n' }, (written) => ({
      ok: true,
      data: { note_id: 'n1', output_path: written['notes/n1/unified_transcript.md'] },
    }));
    const data = parse(await runTranscriptInline(run, NOTE, { tmpRoot })).data;
    expect(data.output_path).toBeUndefined();
    expect(data.transcript_content).toBe('# 逐字稿\n');
  });

  it('still returns files the output never named, keyed by relative path', async () => {
    const { run } = fakeCli({ 'notes/n1/unified_transcript.md': 'hello' }, { ok: true, data: { note_id: 'n1' } });
    const out = parse(await runTranscriptInline(run, NOTE, { tmpRoot }));
    expect(out.data).toEqual({ note_id: 'n1' });
    expect(out.transcripts).toEqual([{
      file: path.join('notes', 'n1', 'unified_transcript.md'),
      transcript_content: 'hello',
      transcript_bytes: 5,
      transcript_truncated: false,
    }]);
  });

  it('shares one byte budget across files and never splits a character', async () => {
    const a = '一二三四五'; // 15 bytes
    const b = '六七八九十';
    const { run } = fakeCli({ 'minutes/a/transcript.txt': a, 'minutes/b/transcript.txt': b }, {
      ok: true,
      data: { minutes: [
        { minute_token: 'a', artifacts: { transcript_file: 'minutes/a/transcript.txt' } },
        { minute_token: 'b', artifacts: { transcript_file: 'minutes/b/transcript.txt' } },
      ] },
    });
    const out = parse(await runTranscriptInline(run, MINUTES, { tmpRoot, maxBytes: 20 }));
    const [first, second] = out.data.minutes.map((m) => m.artifacts);
    expect(first).toMatchObject({ transcript_content: a, transcript_truncated: false });
    // 5 bytes left: one 3-byte character fits, the dangling 2 bytes are dropped.
    expect(second).toMatchObject({ transcript_content: '六', transcript_bytes: 15, transcript_truncated: true });
    expect(out.transcript_notice).toMatch(/20-byte/);
  });

  it('never reads a path outside the call directory', async () => {
    const outside = path.join(tmpRoot, 'secret.txt');
    fs.writeFileSync(outside, 'do not leak');
    const { run } = fakeCli({}, { ok: true, data: { transcript_file: outside, other: '/etc/hosts' } });
    const out = parse(await runTranscriptInline(run, NOTE, { tmpRoot }));
    expect(out.data).toEqual({ transcript_file: outside, other: '/etc/hosts' });
    expect(JSON.stringify(out)).not.toContain('do not leak');
  });

  it('does not follow a symlink the CLI left behind', async () => {
    const outside = path.join(tmpRoot, 'secret.txt');
    fs.writeFileSync(outside, 'do not leak');
    const run = async (_args, cwd) => {
      fs.symlinkSync(outside, path.join(cwd, 'link.txt'));
      return { stdout: JSON.stringify({ ok: true, data: { transcript_file: 'link.txt' } }), stderr: '' };
    };
    const out = parse(await runTranscriptInline(run, NOTE, { tmpRoot }));
    expect(out.data).toEqual({ transcript_file: 'link.txt' });
    expect(JSON.stringify(out)).not.toContain('do not leak');
  });

  it('wraps non-JSON output instead of dropping the transcript', async () => {
    const run = async (_args, cwd) => {
      fs.writeFileSync(path.join(cwd, 't.txt'), 'body');
      return { stdout: 'saved to ./t.txt\n', stderr: '' };
    };
    const out = parse(await runTranscriptInline(run, NOTE, { tmpRoot }));
    expect(out).toMatchObject({ ok: true, output: 'saved to ./t.txt', transcripts: [{ file: 't.txt', transcript_content: 'body' }] });
  });

  it('returns stdout unchanged when nothing was written', async () => {
    const run = async () => ({ stdout: '{"ok":true,"data":{"minutes":[]}}', stderr: '' });
    const result = await runTranscriptInline(run, MINUTES, { tmpRoot });
    expect(result.stdout).toBe('{"ok":true,"data":{"minutes":[]}}');
  });

  it('removes the call directory after success and after failure', async () => {
    const ok = fakeCli({ 'notes/n1/unified_transcript.md': 'x' }, { ok: true, data: {} });
    await runTranscriptInline(ok.run, NOTE, { tmpRoot });
    expect(leftovers()).toEqual([]);

    const boom = Object.assign(new Error('Command failed'), { stdout: '{"ok":false,"error":{"code":99991679}}' });
    const failing = async (_args, cwd) => {
      fs.writeFileSync(path.join(cwd, 'partial.md'), 'half');
      throw boom;
    };
    await expect(runTranscriptInline(failing, NOTE, { tmpRoot })).rejects.toBe(boom);
    expect(leftovers()).toEqual([]);
  });

  it('lets a second fetch of the same transcript succeed', async () => {
    // Upstream refuses to overwrite an existing output file; a fresh directory
    // per call means the default path never already exists.
    const run = async (_args, cwd) => {
      const file = path.join(cwd, 'notes', 'n1', 'unified_transcript.md');
      if (fs.existsSync(file)) throw new Error('file already exists');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, 'x');
      return { stdout: JSON.stringify({ ok: true, data: { output_path: file } }), stderr: '' };
    };
    await runTranscriptInline(run, NOTE, { tmpRoot });
    const second = parse(await runTranscriptInline(run, NOTE, { tmpRoot }));
    expect(second.data.transcript_content).toBe('x');
  });
});
