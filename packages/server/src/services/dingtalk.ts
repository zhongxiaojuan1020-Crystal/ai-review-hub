import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { config as configTable } from '../db/schema.js';
import { getConfig } from '../config.js';

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
  const db = getDb();
  const envWebhook = getConfig().dingtalk.robotWebhook;
  const webhookRow = db.select().from(configTable)
    .where(eq(configTable.key, 'dingtalk_webhook')).get();
  const webhookUrl = envWebhook || (webhookRow?.value as string | undefined);
  if (!webhookUrl) return; // not configured, skip silently

  const reviewUrl = `${params.appBaseUrl}/reviews/${params.reviewId}`;

  const payload = {
    msgtype: 'actionCard',
    actionCard: {
      title: `📝 ${params.authorName} 发布了新短评`,
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

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('[DingTalk] publish notification failed:', err);
  }
}

/**
 * Send a DingTalk webhook message when a review is distributed.
 * Uses the guest link so external viewers can access without login.
 */
export async function sendDistributeNotification(params: {
  reviewTitle: string;
  description: string;
  opinions: string[];
  tags: string[];
  heatScore: number | null;
  guestUrl: string;
}): Promise<void> {
  const db = getDb();
  const envWebhook2 = getConfig().dingtalk.robotWebhook;
  const webhookRow2 = db.select().from(configTable)
    .where(eq(configTable.key, 'dingtalk_webhook')).get();
  const webhookUrl = envWebhook2 || (webhookRow2?.value as string | undefined);
  if (!webhookUrl) return;

  const opinionLines = params.opinions.map((o, i) => `${i + 1}. ${o}`).join('\n');
  const heatLine = params.heatScore != null
    ? `🔥 综合热度 **${params.heatScore.toFixed(2)}**\n`
    : '';

  const payload = {
    msgtype: 'actionCard',
    actionCard: {
      title: `🚀 新短评分发：${params.reviewTitle}`,
      text: [
        `### 🚀 ${params.reviewTitle}`,
        '',
        params.description.slice(0, 120) + (params.description.length > 120 ? '…' : ''),
        '',
        opinionLines,
        '',
        heatLine,
      ].join('\n'),
      btnOrientation: '0',
      btns: [{ title: '查看全文', actionURL: params.guestUrl }],
    },
  };

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('[DingTalk] distribute notification failed:', err);
  }
}
