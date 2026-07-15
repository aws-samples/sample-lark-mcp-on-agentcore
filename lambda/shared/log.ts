import { createHash } from 'crypto';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL' | 'FATAL';

export function log(level: LogLevel, event: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({
    level, event,
    requestId: process.env._X_AMZN_TRACE_ID || '',
    ...fields,
    ts: new Date().toISOString(),
  }));
}

// Hash userId / open_id before logging — they are mildly sensitive and may
// equal Feishu open_id. 16 hex chars from sha256.
export function hashUserId(userId: string): string {
  return createHash('sha256').update(userId).digest('hex').slice(0, 16);
}
