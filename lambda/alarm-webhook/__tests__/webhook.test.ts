import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

process.env.FEISHU_WEBHOOK_URL = 'https://open.feishu.cn/open-apis/bot/v2/hook/test-token';
process.env.DEPLOY_LANG = 'zh';

let fetchCalls: Array<{ url: string; init: any }> = [];
let fetchStatus = 200;
global.fetch = vi.fn(async (url: any, init: any) => {
  fetchCalls.push({ url, init });
  return new Response('{"StatusCode":0}', { status: fetchStatus });
}) as any;

function snsEvent(message: string | object) {
  return {
    Records: [{
      Sns: {
        Message: typeof message === 'string' ? message : JSON.stringify(message),
        Subject: 'ALARM',
        Timestamp: '2026-05-24T10:00:00.000Z',
      },
    }],
  };
}

beforeEach(() => { fetchCalls = []; fetchStatus = 200; });
afterEach(() => { vi.restoreAllMocks(); });

describe('alarm-webhook Lambda', () => {
  it('sends Feishu interactive card for ALARM state', async () => {
    vi.resetModules();
    const { handler } = await import('../index');
    await handler(snsEvent({
      AlarmName: 'lark-mcp-on-agentcore-token-lost',
      NewStateValue: 'ALARM',
      NewStateReason: 'Threshold crossed: 1 datapoint',
      StateChangeTime: '2026-05-24T10:00:00.000+0000',
      Region: 'us-west-2',
      OldStateValue: 'OK',
    }) as any);

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe('https://open.feishu.cn/open-apis/bot/v2/hook/test-token');
    const body = JSON.parse(fetchCalls[0].init.body);
    expect(body.msg_type).toBe('interactive');
    expect(body.card.header.template).toBe('red');
    expect(body.card.header.title.content).toContain('告警触发');
    expect(body.card.header.title.content).toContain('token-lost');
  });

  it('sends green card for OK state (recovery)', async () => {
    vi.resetModules();
    const { handler } = await import('../index');
    await handler(snsEvent({
      AlarmName: 'lark-mcp-on-agentcore-refresh-failed',
      NewStateValue: 'OK',
      NewStateReason: 'Threshold ok',
      StateChangeTime: '2026-05-24T11:00:00.000+0000',
      Region: 'us-west-2',
      OldStateValue: 'ALARM',
    }) as any);

    expect(fetchCalls).toHaveLength(1);
    const body = JSON.parse(fetchCalls[0].init.body);
    expect(body.card.header.template).toBe('green');
    expect(body.card.header.title.content).toContain('告警恢复');
  });

  it('handles non-JSON SNS message gracefully', async () => {
    vi.resetModules();
    const { handler } = await import('../index');
    await handler(snsEvent('plain text alarm notification') as any);

    expect(fetchCalls).toHaveLength(1);
    const body = JSON.parse(fetchCalls[0].init.body);
    expect(body.msg_type).toBe('interactive');
    expect(body.card.header.title.content).toContain('Unknown');
  });

  it('does not throw when webhook URL is empty', async () => {
    const orig = process.env.FEISHU_WEBHOOK_URL;
    process.env.FEISHU_WEBHOOK_URL = '';
    vi.resetModules();
    const { handler } = await import('../index');
    await handler(snsEvent({ AlarmName: 'test', NewStateValue: 'ALARM' }) as any);
    expect(fetchCalls).toHaveLength(0);
    process.env.FEISHU_WEBHOOK_URL = orig;
  });

  it('logs error when webhook returns non-2xx', async () => {
    const consoleSpy = vi.spyOn(console, 'log');
    fetchStatus = 500;
    vi.resetModules();
    const { handler } = await import('../index');
    await handler(snsEvent({ AlarmName: 'test', NewStateValue: 'ALARM' }) as any);

    expect(consoleSpy).toHaveBeenCalled();
    const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(logged.event).toBe('webhook_send_failed');
    expect(logged.status).toBe(500);
    consoleSpy.mockRestore();
  });

  it('processes multiple SNS records in single event', async () => {
    vi.resetModules();
    const { handler } = await import('../index');
    const event = {
      Records: [
        { Sns: { Message: JSON.stringify({ AlarmName: 'alarm-1', NewStateValue: 'ALARM' }) } },
        { Sns: { Message: JSON.stringify({ AlarmName: 'alarm-2', NewStateValue: 'OK' }) } },
      ],
    };
    await handler(event as any);
    expect(fetchCalls).toHaveLength(2);
  });

  it('prefixes the card title with APP_ALIAS so a shared channel can tell apps apart', async () => {
    const orig = process.env.APP_ALIAS;
    process.env.APP_ALIAS = 'HR 生产环境';
    vi.resetModules();
    const { handler } = await import('../index');
    await handler(snsEvent({ AlarmName: 'token-lost', NewStateValue: 'ALARM' }) as any);
    const body = JSON.parse(fetchCalls[0].init.body);
    expect(body.card.header.title.content).toContain('HR 生产环境');
    // Restore WITHOUT assigning undefined (which would become the string "undefined").
    if (orig === undefined) delete process.env.APP_ALIAS; else process.env.APP_ALIAS = orig;
  });

  it('omits the app prefix when APP_ALIAS is empty (default app)', async () => {
    const orig = process.env.APP_ALIAS;
    delete process.env.APP_ALIAS;
    vi.resetModules();
    const { handler } = await import('../index');
    await handler(snsEvent({ AlarmName: 'token-lost', NewStateValue: 'ALARM' }) as any);
    const body = JSON.parse(fetchCalls[0].init.body);
    // No leading "[...]" app tag, but the alarm name still shows.
    expect(body.card.header.title.content).toContain('token-lost');
    expect(body.card.header.title.content).not.toMatch(/\]\s*\[/); // no double-bracket from empty alias
    if (orig !== undefined) process.env.APP_ALIAS = orig;
  });

  it('uses English labels when DEPLOY_LANG=en', async () => {
    const orig = process.env.DEPLOY_LANG;
    process.env.DEPLOY_LANG = 'en';
    vi.resetModules();
    const { handler } = await import('../index');
    await handler(snsEvent({
      AlarmName: 'test-alarm',
      NewStateValue: 'ALARM',
      NewStateReason: 'threshold crossed',
      Region: 'us-west-2',
    }) as any);
    const body = JSON.parse(fetchCalls[0].init.body);
    expect(body.card.header.title.content).toContain('ALARM');
    expect(body.card.header.title.content).not.toContain('告警');
    const fields = body.card.elements[0].fields;
    expect(fields[0].text.content).toContain('Status');
    expect(fields[1].text.content).toContain('Region');
    process.env.DEPLOY_LANG = orig;
  });

  it('includes signature (timestamp + sign) when FEISHU_WEBHOOK_SECRET is set', async () => {
    const orig = process.env.FEISHU_WEBHOOK_SECRET;
    process.env.FEISHU_WEBHOOK_SECRET = 'test-secret-123';
    vi.resetModules();
    const { handler } = await import('../index');
    await handler(snsEvent({ AlarmName: 'sig-test', NewStateValue: 'ALARM' }) as any);

    expect(fetchCalls).toHaveLength(1);
    const body = JSON.parse(fetchCalls[0].init.body);
    expect(body.timestamp).toBeDefined();
    expect(body.sign).toBeDefined();
    expect(typeof body.timestamp).toBe('string');
    expect(body.sign.length).toBeGreaterThan(10);
    process.env.FEISHU_WEBHOOK_SECRET = orig;
  });

  it('does not include signature when FEISHU_WEBHOOK_SECRET is empty', async () => {
    const orig = process.env.FEISHU_WEBHOOK_SECRET;
    process.env.FEISHU_WEBHOOK_SECRET = '';
    vi.resetModules();
    const { handler } = await import('../index');
    await handler(snsEvent({ AlarmName: 'no-sig', NewStateValue: 'ALARM' }) as any);

    const body = JSON.parse(fetchCalls[0].init.body);
    expect(body.timestamp).toBeUndefined();
    expect(body.sign).toBeUndefined();
    process.env.FEISHU_WEBHOOK_SECRET = orig;
  });

  it('includes keyword in title when FEISHU_WEBHOOK_KEYWORD is set', async () => {
    const orig = process.env.FEISHU_WEBHOOK_KEYWORD;
    process.env.FEISHU_WEBHOOK_KEYWORD = 'alert';
    vi.resetModules();
    const { handler } = await import('../index');
    await handler(snsEvent({ AlarmName: 'kw-test', NewStateValue: 'ALARM' }) as any);

    const body = JSON.parse(fetchCalls[0].init.body);
    expect(body.card.header.title.content).toContain('[alert]');
    process.env.FEISHU_WEBHOOK_KEYWORD = orig;
  });

  it('no keyword prefix when FEISHU_WEBHOOK_KEYWORD is empty', async () => {
    const orig = process.env.FEISHU_WEBHOOK_KEYWORD;
    process.env.FEISHU_WEBHOOK_KEYWORD = '';
    vi.resetModules();
    const { handler } = await import('../index');
    await handler(snsEvent({ AlarmName: 'no-kw', NewStateValue: 'ALARM' }) as any);

    const body = JSON.parse(fetchCalls[0].init.body);
    expect(body.card.header.title.content).not.toContain('[');
    process.env.FEISHU_WEBHOOK_KEYWORD = orig;
  });

  it('falls back to English when DEPLOY_LANG is unknown', async () => {
    const orig = process.env.DEPLOY_LANG;
    process.env.DEPLOY_LANG = 'xx';
    vi.resetModules();
    const { handler } = await import('../index');
    await handler(snsEvent({ AlarmName: 'test', NewStateValue: 'ALARM', Region: 'us-west-2' }) as any);
    const body = JSON.parse(fetchCalls[0].init.body);
    expect(body.card.header.title.content).toContain('ALARM');
    expect(body.card.header.title.content).not.toContain('告警');
    process.env.DEPLOY_LANG = orig;
  });

  it('uses AWS_REGION fallback when alarm has no Region field', async () => {
    const origRegion = process.env.AWS_REGION;
    process.env.AWS_REGION = 'ap-northeast-1';
    vi.resetModules();
    const { handler } = await import('../index');
    await handler(snsEvent({ AlarmName: 'no-region', NewStateValue: 'ALARM' }) as any);
    const body = JSON.parse(fetchCalls[0].init.body);
    const fields = body.card.elements[0].fields;
    const regionField = fields.find((f: any) => f.text.content.includes('ap-northeast-1'));
    expect(regionField).toBeDefined();
    process.env.AWS_REGION = origRegion;
  });
});
