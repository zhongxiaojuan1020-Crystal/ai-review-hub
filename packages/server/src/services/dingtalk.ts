import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import { getDb } from '../db/index.js';
import { config as configTable } from '../db/schema.js';
import { getConfig } from '../config.js';

/**
 * Read DingTalk config from DB (with env fallback).
 * Returns the webhook URL and optional sign secret.
 */
function loadDingTalkConfig(): { webhookUrl: string | null; secret: string | null } {
  const db = getDb();
  const envCfg = getConfig().dingtalk;
  const webhookRow = db.select().from(configTable)
    .where(eq(configTable.key, 'dingtalk_webhook')).get();
  const secretRow = db.select().from(configTable)
    .where(eq(configTable.key, 'dingtalk_secret')).get();
  const webhookUrl = envCfg.robotWebhook || (webhookRow?.value as string | undefined) || null;
  const secret = (envCfg as any).robotSecret || (secretRow?.value as string | undefined) || null;
  return { webhookUrl, secret };
}

/**
 * If a sign secret is configured, append `&timestamp=&sign=` to the webhook URL.
 * See https://open.dingtalk.com/document/robots/customize-robot-security-settings
 */
function buildSignedUrl(webhookUrl: string, secret: string | null): string {
  if (!secret) return webhookUrl;
  const timestamp = Date.now();
  const stringToSign = `${timestamp}\n${secret}`;
  const hmac = crypto.createHmac('sha256', secret).update(stringToSign).digest('base64');
  const sign = encodeURIComponent(hmac);
  const sep = webhookUrl.includes('?') ? '&' : '?';
  return `${webhookUrl}${sep}timestamp=${timestamp}&sign=${sign}`;
}

/**
 * POST a payload to the configured DingTalk webhook.
 * Reads the response body and logs errcode/errmsg so failures are visible.
 * Returns `{ ok, errcode, errmsg }` for callers that want to propagate errors to the user.
 */
export async function postToDingTalk(payload: unknown): Promise<{
  ok: boolean;
  errcode?: number;
  errmsg?: string;
  reason?: string;
}> {
  const { webhookUrl, secret } = loadDingTalkConfig();
  if (!webhookUrl) {
    console.warn('[DingTalk] webhook not configured, skipping');
    return { ok: false, reason: 'not_configured' };
  }

  const url = buildSignedUrl(webhookUrl, secret);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    let data: any = {};
    try { data = JSON.parse(text); } catch { /* not JSON */ }

    if (!res.ok) {
      console.error(`[DingTalk] HTTP ${res.status}: ${text}`);
      return { ok: false, reason: `http_${res.status}`, errmsg: text };
    }

    if (data.errcode !== 0) {
      // Common errors:
      //   310000 keywords not in content → 自定义关键词拦截
      //   310000 sign not match           → 加签密钥错误
      //   300001 token is not exist       → webhook URL 错误
      console.error(`[DingTalk] errcode=${data.errcode} errmsg=${data.errmsg}`);
      return { ok: false, errcode: data.errcode, errmsg: data.errmsg };
    }

    console.log('[DingTalk] message delivered OK');
    return { ok: true, errcode: 0 };
  } catch (err: any) {
    console.error('[DingTalk] fetch failed:', err?.message || err);
    return { ok: false, reason: 'fetch_failed', errmsg: err?.message || String(err) };
  }
}

/**
 * Send a DingTalk webhook message to the internal team group
 * when a new review is published.
 */
export async function sendPublishNotification(params: {
  authorName: string;
  reviewTitle: string;
  reviewId: string;
  appBaseUrl: string;
}): Promise<void> {
  const reviewUrl = `${params.appBaseUrl}/reviews/${params.reviewId}`;
  const payload = {
    msgtype: 'actionCard',
    actionCard: {
      title: `[短评] ${params.authorName} 发布了新短评`,
      text: [
        `### 📝 ${params.authorName} 发布了新短评`,
        '',
        `**${params.reviewTitle}**`,
        '',
        '请尽快阅读并参与评分 👇',
      ].join('\n'),
      btnOrientation: '0',
      btns: [{ title: '查看并评分', actionURL: reviewUrl }],
    },
  };
  await postToDingTalk(payload);
}

/**
 * Send a DingTalk webhook message when a review is distributed.
 * Uses the guest link so external viewers can access without login.
 */
export async function sendDistributeNotification(params: {
  reviewTitle: string;
  authorName?: string;
  description: string;
  opinions: string[];
  tags: string[];
  heatScore: number | null;
  guestUrl: string;
}): Promise<{ ok: boolean; errcode?: number; errmsg?: string; reason?: string }> {
  const opinionLines = params.opinions.map((o, i) => `${i + 1}. ${o}`).join('\n');
  const heatLine = params.heatScore != null
    ? `🔥 综合热度 **${params.heatScore.toFixed(2)}**\n`
    : '';
  const byline = params.authorName ? `by ${params.authorName}` : '';

  const payload = {
    msgtype: 'actionCard',
    actionCard: {
      // Include the word "短评" in the title so any custom-keyword security setting on
      // the DingTalk robot that is looking for "短评" will match.
      title: `[短评] 新短评分发：${params.reviewTitle}`,
      text: [
        `### 🚀 短评分发：${params.reviewTitle}`,
        byline,
        '',
        params.description.slice(0, 120) + (params.description.length > 120 ? '…' : ''),
        '',
        opinionLines,
        '',
        heatLine,
      ].filter(Boolean).join('\n'),
      btnOrientation: '0',
      btns: [{ title: '查看全文', actionURL: params.guestUrl }],
    },
  };
  return await postToDingTalk(payload);
}

/**
 * Send a small test message to the DingTalk webhook so the user can
 * verify their config from the settings page.
 */
export async function sendTestNotification(): Promise<{
  ok: boolean;
  errcode?: number;
  errmsg?: string;
  reason?: string;
}> {
  const payload = {
    msgtype: 'text',
    text: {
      content: '[短评] 连接测试：AI 短评圈已成功接入此群。',
    },
  };
  return await postToDingTalk(payload);
}
