import { describe, it, expect } from 'vitest';
import {
  needsBaseCreateTransaction,
  runBaseCreateTransaction,
} from '../server-lib.js';

// Regression suite for the Base partial-create defect found by black-box testing
// of lark-cli 1.0.92: `base +base-create --fields` creates the Base first, then
// customizes its default table. When a later step fails (observed: the app lacks
// base:table:create → 99991672), upstream surfaces only that error and the
// already-created Base stays in Drive as an orphan shell. This server drives the
// steps itself so it holds the exact token it just created and can delete it.
//
// The fake `run` records every argv it receives, so each test asserts on the real
// call sequence rather than on a reimplementation.
function fakeRun(handlers) {
  const calls = [];
  const run = async (args) => {
    calls.push(args);
    for (const [match, respond] of handlers) {
      if (match(args)) return respond(args);
    }
    return { stdout: JSON.stringify({ ok: true, data: {} }), stderr: '' };
  };
  return { run, calls };
}

const isCreate = (a) => a[0] === 'base' && a[1] === '+base-create';
const isTableCreate = (a) => a[0] === 'base' && a[1] === '+table-create';
const isTableUpdate = (a) => a[0] === 'base' && a[1] === '+table-update';
const isTableDelete = (a) => a[0] === 'base' && a[1] === '+table-delete';
const isTableList = (a) => a[0] === 'base' && a[1] === '+table-list';
const isDriveDelete = (a) => a[0] === 'drive' && a[1] === '+delete';

const CREATE_OK = {
  stdout: JSON.stringify({
    ok: true,
    data: { base: { app_token: 'bas_new', name: 'Demo' }, created: true, default_table_id: 'tbl_default' },
  }),
  stderr: '',
};

// The real 99991672 envelope: the app never applied for base:table:create.
const APP_SCOPE_ERR = {
  stdout: JSON.stringify({
    ok: false,
    error: {
      type: 'authorization',
      subtype: 'app_scope_not_applied',
      code: 99991672,
      message: 'access denied: app cli_x has not applied for the required scope(s): base:table:create',
      missing_scopes: ['base:table:create'],
    },
  }),
  stderr: '',
};

describe('needsBaseCreateTransaction', () => {
  it('claims base +base-create with --fields', () => {
    expect(needsBaseCreateTransaction(['base', '+base-create', '--name', 'x', '--fields', '[]'])).toBe(true);
  });

  it('claims base +base-create with --table-name only', () => {
    expect(needsBaseCreateTransaction(['base', '+base-create', '--name', 'x', '--table-name', 'T'])).toBe(true);
  });

  // Without either flag upstream performs a single call — nothing to compensate.
  it('does not claim a plain base +base-create', () => {
    expect(needsBaseCreateTransaction(['base', '+base-create', '--name', 'x'])).toBe(false);
  });

  // --dry-run must stay a pass-through: it prints the planned requests and
  // creates nothing, so splitting it would misreport the upstream plan.
  it('does not claim a --dry-run call', () => {
    expect(needsBaseCreateTransaction(['base', '+base-create', '--name', 'x', '--fields', '[]', '--dry-run'])).toBe(false);
  });

  it('does not claim unrelated commands', () => {
    expect(needsBaseCreateTransaction(['base', '+table-create', '--fields', '[]'])).toBe(false);
    expect(needsBaseCreateTransaction(['im', '+messages-send', '--text', 'hi'])).toBe(false);
  });
});

describe('runBaseCreateTransaction — pass-through', () => {
  it('forwards a non-transactional command untouched, exactly once', async () => {
    const { run, calls } = fakeRun([]);
    const argv = ['im', '+messages-send', '--chat-id', 'oc_1', '--text', 'hi'];
    await runBaseCreateTransaction(run, argv);
    expect(calls).toEqual([argv]);
  });
});

describe('runBaseCreateTransaction — success paths', () => {
  it('--fields: creates the Base, adds the custom table, deletes the default one', async () => {
    const { run, calls } = fakeRun([
      [isCreate, () => CREATE_OK],
      [isTableCreate, () => ({
        stdout: JSON.stringify({
          ok: true,
          data: { table: { id: 'tbl_custom', name: 'Tasks', fields: [{ id: 'fld_1', name: 'Title' }] } },
        }),
        stderr: '',
      })],
    ]);

    const result = await runBaseCreateTransaction(run, [
      'base', '+base-create', '--name', 'Demo', '--table-name', 'Tasks',
      '--fields', '[{"name":"Title","type":"text"}]',
    ]);

    // The Base create must NOT carry the table flags — those are our own steps.
    expect(calls[0].includes('--fields')).toBe(false);
    expect(calls[0].includes('--table-name')).toBe(false);
    expect(calls.map(c => `${c[0]} ${c[1]}`)).toEqual([
      'base +base-create', 'base +table-create', 'base +table-delete',
    ]);
    // The replacement table keeps the caller's requested name and schema.
    expect(calls[1]).toContain('Tasks');
    expect(calls[1]).toContain('[{"name":"Title","type":"text"}]');
    // Deleting a table is high-risk upstream, so --yes must be present.
    expect(calls[2]).toContain('--yes');
    expect(calls[2]).toContain('tbl_default');
    expect(calls.some(isDriveDelete)).toBe(false);

    // The envelope keeps upstream's success shape so agents see no difference.
    const data = JSON.parse(result.stdout).data;
    expect(data.created).toBe(true);
    expect(data.table.id).toBe('tbl_custom');
    expect(data.fields).toEqual([{ id: 'fld_1', name: 'Title' }]);
    expect(data.default_table_deleted).toBe(true);
    expect(data.deleted_default_table_id).toBe('tbl_default');
  });

  it('--table-name only: renames the default table and never deletes it', async () => {
    const { run, calls } = fakeRun([
      [isCreate, () => CREATE_OK],
      [isTableUpdate, () => ({
        stdout: JSON.stringify({ ok: true, data: { table: { id: 'tbl_default', name: 'Tasks' }, updated: true } }),
        stderr: '',
      })],
    ]);

    const result = await runBaseCreateTransaction(run, [
      'base', '+base-create', '--name', 'Demo', '--table-name', 'Tasks',
    ]);

    expect(calls.map(c => `${c[0]} ${c[1]}`)).toEqual(['base +base-create', 'base +table-update']);
    expect(calls.some(isTableDelete)).toBe(false);
    const data = JSON.parse(result.stdout).data;
    expect(data.default_table_renamed).toBe(true);
    expect(data.renamed_default_table_id).toBe('tbl_default');
    expect(data.default_table_deleted).toBeUndefined();
  });

  it('falls back to +table-list when the create response omits the default table ID', async () => {
    const { run, calls } = fakeRun([
      [isCreate, () => ({ stdout: JSON.stringify({ ok: true, data: { base: { app_token: 'bas_new' } } }), stderr: '' })],
      [isTableList, () => ({
        stdout: JSON.stringify({ ok: true, data: { tables: [{ id: 'tbl_listed', name: 'Table 1' }], total: 1 } }),
        stderr: '',
      })],
      [isTableUpdate, () => ({ stdout: JSON.stringify({ ok: true, data: { table: { id: 'tbl_listed' } } }), stderr: '' })],
    ]);

    await runBaseCreateTransaction(run, ['base', '+base-create', '--name', 'Demo', '--table-name', 'Tasks']);
    expect(calls.map(c => `${c[0]} ${c[1]}`)).toEqual([
      'base +base-create', 'base +table-list', 'base +table-update',
    ]);
    expect(calls[2]).toContain('tbl_listed');
  });
});

describe('runBaseCreateTransaction — rollback (the reported defect)', () => {
  // The exact reported reproduction: table-create is refused for a missing app
  // scope. Before this fix the Base survived as an orphan shell in Drive.
  it('deletes the just-created Base when the replacement table fails', async () => {
    const { run, calls } = fakeRun([
      [isCreate, () => CREATE_OK],
      [isTableCreate, () => APP_SCOPE_ERR],
      [isDriveDelete, () => ({ stdout: JSON.stringify({ ok: true, data: { deleted: true } }), stderr: '' })],
    ]);

    await expect(runBaseCreateTransaction(run, [
      'base', '+base-create', '--name', 'Demo', '--fields', '[{"name":"Title","type":"text"}]',
    ])).rejects.toMatchObject({ stdout: expect.stringContaining('base:table:create') });

    const rollbackCall = calls.find(isDriveDelete);
    expect(rollbackCall).toBeDefined();
    // Rollback must target the token WE created, by type, with confirmation —
    // never a title search, which could delete an unrelated same-name Base.
    expect(rollbackCall).toContain('bas_new');
    expect(rollbackCall).toContain('bitable');
    expect(rollbackCall).toContain('--yes');
  });

  it('preserves the original error and reports a successful rollback', async () => {
    const { run } = fakeRun([
      [isCreate, () => CREATE_OK],
      [isTableCreate, () => APP_SCOPE_ERR],
      [isDriveDelete, () => ({ stdout: JSON.stringify({ ok: true, data: { deleted: true } }), stderr: '' })],
    ]);

    const err = await runBaseCreateTransaction(run, [
      'base', '+base-create', '--name', 'Demo', '--fields', '[{"name":"Title","type":"text"}]',
    ]).catch(e => e);

    const envelope = JSON.parse(err.stdout);
    // The scope error must survive verbatim: patchPermissionError still needs to
    // mint an authorize_url from missing_scopes downstream.
    expect(envelope.error.code).toBe(99991672);
    expect(envelope.error.missing_scopes).toEqual(['base:table:create']);
    expect(envelope.error.rollback).toEqual({ attempted: true, succeeded: true, resource_type: 'bitable' });
    // Nothing was left behind, so no cleanup instruction should be advertised.
    expect(envelope.error.partial_resource).toBeUndefined();
  });

  it('rolls back when deleting the default table fails after the custom one was created', async () => {
    const { run, calls } = fakeRun([
      [isCreate, () => CREATE_OK],
      [isTableCreate, () => ({ stdout: JSON.stringify({ ok: true, data: { table: { id: 'tbl_custom' } } }), stderr: '' })],
      [isTableDelete, () => ({ stdout: JSON.stringify({ ok: false, error: { code: 1254005, message: 'delete failed' } }), stderr: '' })],
      [isDriveDelete, () => ({ stdout: JSON.stringify({ ok: true, data: { deleted: true } }), stderr: '' })],
    ]);

    await expect(runBaseCreateTransaction(run, [
      'base', '+base-create', '--name', 'Demo', '--fields', '[{"name":"Title","type":"text"}]',
    ])).rejects.toBeDefined();
    expect(calls.some(isDriveDelete)).toBe(true);
  });

  it('rolls back when the rename step fails', async () => {
    const { run, calls } = fakeRun([
      [isCreate, () => CREATE_OK],
      [isTableUpdate, () => ({ stdout: JSON.stringify({ ok: false, error: { code: 1254005, message: 'rename failed' } }), stderr: '' })],
      [isDriveDelete, () => ({ stdout: JSON.stringify({ ok: true, data: { deleted: true } }), stderr: '' })],
    ]);

    await expect(runBaseCreateTransaction(run, [
      'base', '+base-create', '--name', 'Demo', '--table-name', 'Tasks',
    ])).rejects.toBeDefined();
    expect(calls.some(isDriveDelete)).toBe(true);
  });

  // Worst case: cleanup itself is refused (e.g. no drive delete scope). The
  // orphan is real, so the agent must be told the token and how to remove it
  // instead of the leak being silent.
  it('reports the orphan token and a cleanup call when rollback also fails', async () => {
    const { run } = fakeRun([
      [isCreate, () => CREATE_OK],
      [isTableCreate, () => APP_SCOPE_ERR],
      [isDriveDelete, () => ({
        stdout: JSON.stringify({ ok: false, error: { code: 99991679, message: 'no permission to delete' } }),
        stderr: '',
      })],
    ]);

    const err = await runBaseCreateTransaction(run, [
      'base', '+base-create', '--name', 'Demo', '--fields', '[{"name":"Title","type":"text"}]',
    ]).catch(e => e);

    const envelope = JSON.parse(err.stdout);
    expect(envelope.error.rollback.succeeded).toBe(false);
    expect(envelope.error.rollback.error).toContain('no permission to delete');
    expect(envelope.error.partial_resource).toEqual({
      type: 'bitable',
      token: 'bas_new',
      cleanup_tool: 'lark_drive_delete',
      cleanup_args: { file_token: 'bas_new', type: 'bitable', _confirm: true },
    });
  });

  // A create that yields no token cannot be compensated, so it must NOT proceed
  // to write more resources it could not clean up.
  it('refuses to customize when the create response carries no base token', async () => {
    const { run, calls } = fakeRun([
      [isCreate, () => ({ stdout: JSON.stringify({ ok: true, data: { created: true } }), stderr: '' })],
    ]);

    await expect(runBaseCreateTransaction(run, [
      'base', '+base-create', '--name', 'Demo', '--fields', '[{"name":"Title","type":"text"}]',
    ])).rejects.toThrow(/no base_token/);
    expect(calls).toHaveLength(1);
  });

  // If the Base create itself fails, nothing exists yet — a rollback call would
  // be a spurious destructive request.
  it('does not attempt rollback when the Base create itself fails', async () => {
    const { run, calls } = fakeRun([
      [isCreate, () => ({ stdout: JSON.stringify({ ok: false, error: { code: 99991672, message: 'app scope not applied' } }), stderr: '' })],
    ]);

    await expect(runBaseCreateTransaction(run, [
      'base', '+base-create', '--name', 'Demo', '--fields', '[{"name":"Title","type":"text"}]',
    ])).rejects.toBeDefined();
    expect(calls).toHaveLength(1);
    expect(calls.some(isDriveDelete)).toBe(false);
  });
});
