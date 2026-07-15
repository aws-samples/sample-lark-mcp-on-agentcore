import { createHmac } from 'crypto';
import i18n from '../../config/i18n.json';

interface SNSRecord { Sns: { Message: string; Subject?: string; Timestamp?: string } }
interface SNSEvent { Records: SNSRecord[] }

const WEBHOOK_URL = process.env.FEISHU_WEBHOOK_URL || '';
const WEBHOOK_SECRET = process.env.FEISHU_WEBHOOK_SECRET || '';
const WEBHOOK_KEYWORD = process.env.FEISHU_WEBHOOK_KEYWORD || '';
// Per-app display name (empty for the default app). Shown on the card so a shared
// alert channel across multiple apps can tell which app fired.
const APP_ALIAS = process.env.APP_ALIAS || '';
const LANG = process.env.DEPLOY_LANG || 'en';
const t = i18n.alarm[LANG as keyof typeof i18n.alarm] || i18n.alarm.en;

function signRequest(): { timestamp: string; sign: string } | null {
  if (!WEBHOOK_SECRET) return null;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const stringToSign = `${timestamp}\n${WEBHOOK_SECRET}`;
  const sign = createHmac('sha256', stringToSign).update('').digest('base64');
  return { timestamp, sign };
}

interface AlarmMessage {
  AlarmName?: string;
  NewStateValue?: string;
  NewStateReason?: string;
  StateChangeTime?: string;
  Region?: string;
  OldStateValue?: string;
}

export async function handler(event: SNSEvent): Promise<void> {
  if (!WEBHOOK_URL) return;
  for (const record of event.Records) {
    let alarm: AlarmMessage;
    try {
      alarm = JSON.parse(record.Sns.Message);
    } catch {
      alarm = { AlarmName: 'Unknown', NewStateReason: record.Sns.Message };
    }

    const isAlarm = alarm.NewStateValue === 'ALARM';
    const keyword = WEBHOOK_KEYWORD ? `[${WEBHOOK_KEYWORD}] ` : '';
    const appTag = APP_ALIAS ? `[${APP_ALIAS}] ` : '';
    const title = isAlarm
      ? `🔴 ${keyword}${appTag}${t.alarm}: ${alarm.AlarmName}`
      : `✅ ${keyword}${appTag}${t.ok}: ${alarm.AlarmName}`;

    const card: Record<string, unknown> = {
      msg_type: 'interactive',
      card: {
        header: {
          title: { tag: 'plain_text', content: title },
          template: isAlarm ? 'red' : 'green',
        },
        elements: [
          {
            tag: 'div',
            fields: [
              { is_short: true, text: { tag: 'lark_md', content: `**${t.status}:** ${alarm.NewStateValue || 'N/A'}` } },
              { is_short: true, text: { tag: 'lark_md', content: `**${t.region}:** ${alarm.Region || process.env.AWS_REGION || 'N/A'}` } },
            ],
          },
          {
            tag: 'div',
            text: { tag: 'lark_md', content: `**${t.reason}:**\n${alarm.NewStateReason || 'N/A'}` },
          },
          {
            tag: 'div',
            fields: [
              { is_short: true, text: { tag: 'lark_md', content: `**${t.time}:** ${alarm.StateChangeTime || new Date().toISOString()}` } },
              { is_short: true, text: { tag: 'lark_md', content: `**${t.previous}:** ${alarm.OldStateValue || 'N/A'}` } },
            ],
          },
        ],
      },
    };

    const sig = signRequest();
    if (sig) {
      card.timestamp = sig.timestamp;
      card.sign = sig.sign;
    }

    const resp = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(card),
    });
    if (!resp.ok) {
      console.log(JSON.stringify({ level: 'ERROR', event: 'webhook_send_failed', status: resp.status, body: await resp.text() }));
    }
  }
}
