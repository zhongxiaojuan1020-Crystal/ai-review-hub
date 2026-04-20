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
 * Convert an HTML string to a plain-text / DingTalk-Markdown representation.
 * DingTalk actionCard.text accepts a limited markdown subset.
 */
function htmlToMarkdown(html: string): string {
  if (!html) return '';
  // Headings
  let md = html
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '\n### $1\n')
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '\n### $1\n')
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '\n**$1**\n')
    // Bold
    .replace(/<(strong|b)[^>]*>(.*?)<\/\1>/gi, '**$2**')
    // Italic
    .replace(/<(em|i)[^>]*>(.*?)<\/\1>/gi, '*$2*')
    // Underline (no md equivalent — just strip tag)
    .replace(/<u[^>]*>(.*?)<\/u>/gi, '$1')
    // Lists
    .replace(/<li[^>]*>(.*?)<\/li>/gi, '\n• $1')
    .replace(/<\/(ul|ol)>/gi, '\n')
    // Images — include as markdown image if URL is http (skip base64)
    .replace(/<img[^>]+src="(https?:[^"]+)"[^>]*\/?>/gi, '\n![]($1)\n')
    .replace(/<img[^>]+src="data:[^"]*"[^>]*\/?>/gi, '') // strip base64
    // Line breaks & paragraphs
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    // Strip remaining tags
    .replace(/<[^>]+>/g, '')
    // Decode HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    // Collapse excessive blank lines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return md;
}

/**
 * Send a DingTalk webhook message when a review is distributed.
 * Uses the guest link so external viewers can access without login.
 *
 * The message reproduces the full card layout: title, author, description,
 * numbered section viewpoints, tags, and heat score — matching the web card style.
 */
export async function sendDistributeNotification(params: {
  reviewTitle: string;
  authorName?: string;
  body?: string;         // new rich-text body (HTML)
  description?: string;  // legacy / structured description (HTML or plain)
  descriptionImages?: string[];  // base64 description images
  sections?: { title: string; content: string; images?: string[] }[];
  tags: string[];
  heatScore: number | null;
  guestUrl: string;
  /**
   * Internal app URL (requires login). When provided, the action buttons
   * link here instead of the guest URL — since the DingTalk group is the
   * internal team, members should go straight to the authenticated page
   * where they can score / comment.
   */
  reviewUrl?: string;
  reviewId: string;      // for building public image URLs
  baseUrl: string;       // public base URL for image serving
}): Promise<{ ok: boolean; errcode?: number; errmsg?: string; reason?: string }> {
  const lines: string[] = [];

  // ── Title ───────────────────────────────────────────────────
  // Note: don't repeat "【短评】" here — the actionCard outer title already
  // carries "[短评]" for DingTalk custom-keyword security compliance.
  lines.push(`### ${params.reviewTitle}`);
  if (params.authorName) lines.push(`*by ${params.authorName}*`);
  lines.push('');

  // ── Body content ────────────────────────────────────────────
  const imgBase = `${params.baseUrl}/api/public/review-image/${params.reviewId}`;

  if (params.body) {
    // New rich-text (word-like editor) — convert to markdown
    lines.push(htmlToMarkdown(params.body));
  } else {
    // Structured editor: description + sections.
    // Replace inline base64 <img> in description/section HTML with public
    // URLs so they render through htmlToMarkdown (which strips data: URIs).
    const replaceInline = (html: string, pathPrefix: string): string => {
      let idx = 0;
      return html.replace(
        /<img\b[^>]*\bsrc=(['"])(data:[^'"]+)\1[^>]*>/gi,
        () => `<img src="${imgBase}/${pathPrefix}/${idx++}" />`
      );
    };

    const descHtml = params.description ? replaceInline(params.description, 'desc-inline') : '';
    const descMd = descHtml ? htmlToMarkdown(descHtml) : '';
    if (descMd) {
      lines.push('**事件描述**');
      lines.push('');
      lines.push(descMd);
      lines.push('');
    }

    // Top-level description images (legacy `descriptionImages` array)
    if (params.descriptionImages && params.descriptionImages.length > 0) {
      params.descriptionImages.forEach((_img, i) => {
        lines.push(`![图片](${imgBase}/desc/${i})`);
        lines.push('');
      });
    }

    // Numbered viewpoints (matching the card's numbered circles)
    if (params.sections && params.sections.length > 0) {
      lines.push('---');
      lines.push('');
      params.sections.forEach((sec, i) => {
        const titleMd = htmlToMarkdown(sec.title || '').trim();
        const contentHtml = replaceInline(sec.content || '', `sec-inline/${i}`);
        const contentMd = htmlToMarkdown(contentHtml).trim();
        lines.push(`**${i + 1}. ${titleMd}**`);
        if (contentMd) {
          lines.push('');
          lines.push(contentMd);
        }
        // Top-level section images (legacy `section.images` array)
        if (sec.images && sec.images.length > 0) {
          lines.push('');
          sec.images.forEach((_img, imgIdx) => {
            lines.push(`![图片](${imgBase}/sec/${i}/${imgIdx})`);
          });
        }
        lines.push('');
      });
    }
  }

  // ── Tags ────────────────────────────────────────────────────
  if (params.tags && params.tags.length > 0) {
    lines.push(params.tags.map(t => `#${t}`).join('  '));
  }

  // Note: heat score intentionally excluded from DingTalk message

  // ── Safety: strip stray base64 data and enforce DingTalk 20KB limit ──
  let text = lines.join('\n');
  // Strip [[IMG:...]] markers (legacy inline image format) and bare base64 URIs
  text = text.replace(/\[\[IMG:[^\]]*?\]\]/g, '');
  text = text.replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g, '');
  // DingTalk actionCard.text limit is 20000 bytes; truncate if needed
  const MAX_BYTES = 18000; // leave headroom for JSON wrapper
  let byteLen = Buffer.byteLength(text, 'utf8');
  const imgCount = (text.match(/!\[[^\]]*\]\(/g) || []).length;
  console.log(`[DingTalk] message text: ${byteLen} bytes, ${imgCount} image(s), baseUrl=${params.baseUrl}`);
  if (byteLen > MAX_BYTES) {
    while (Buffer.byteLength(text, 'utf8') > MAX_BYTES) {
      text = text.slice(0, -100);
    }
    text += '\n\n…… 内容过长已截断，请点击"阅读全文"查看完整版';
    console.log(`[DingTalk] truncated to ${Buffer.byteLength(text, 'utf8')} bytes`);
  }

  // DingTalk actionCard buttons with plain http(s) URLs often don't respond
  // on mobile or PC clients. Wrapping the URL with the dingtalk:// scheme
  // forces the click to open in DingTalk's built-in browser reliably.
  const wrapUrl = (url: string) =>
    `dingtalk://dingtalkclient/page/link?url=${encodeURIComponent(url)}&pc_slide=false`;

  // Prefer the internal link for group members so they can score / comment
  // directly after logging in; fall back to the guest URL if no internal
  // URL was provided.
  const primaryUrl = params.reviewUrl || params.guestUrl;

  const payload = {
    msgtype: 'actionCard',
    actionCard: {
      // "短评" keyword in title ensures DingTalk custom-keyword security passes.
      title: `[短评] ${params.reviewTitle}`,
      text,
      // Horizontal layout for multiple buttons
      btnOrientation: '1',
      btns: [
        { title: '📖 阅读全文', actionURL: wrapUrl(primaryUrl) },
        { title: '👍 点赞',     actionURL: wrapUrl(primaryUrl) },
        { title: '💬 评论',     actionURL: wrapUrl(primaryUrl) },
      ],
    },
  };
  return await postToDingTalk(payload);
}

/**
 * Send a publish-reminder notification with the full review content
 * so team members can read it inline in the DingTalk group without
 * having to click through to the app.
 *
 * Mirrors the layout of sendDistributeNotification but always links
 * to the internal app page (requires login) so members can score/comment.
 */
export async function sendPublishReminderNotification(params: {
  authorName: string;
  reviewTitle: string;
  reviewUrl: string;   // internal app URL, e.g. https://app.example.com/reviews/:id
  /** New unified body HTML (inline subtitles + images) */
  body?: string;
  /** Legacy structured description HTML */
  description?: string;
  sections?: { title: string; content: string }[];
  tags?: string[];
  reviewId?: string;
  baseUrl?: string;    // public base URL for serving body images
}): Promise<{ ok: boolean; errcode?: number; errmsg?: string; reason?: string }> {
  const wrapUrl = (url: string) =>
    `dingtalk://dingtalkclient/page/link?url=${encodeURIComponent(url)}&pc_slide=false`;

  const lines: string[] = [];
  lines.push(`### ${params.authorName} 新发布了一条短评`);
  lines.push('');
  lines.push(`**「${params.reviewTitle}」**`);
  lines.push('');

  // ── Body content ────────────────────────────────────────────────────
  const hasNewBody = params.body && !params.body.startsWith('{');
  if (hasNewBody && params.body) {
    // Replace base64 inline images with public URLs before converting.
    let bodyForMd = params.body;
    if (params.baseUrl && params.reviewId) {
      const imgBase = `${params.baseUrl}/api/public/review-image/${params.reviewId}/body`;
      let idx = 0;
      bodyForMd = bodyForMd.replace(
        /<img\b[^>]*\bsrc=(['"])(data:[^'"]+)\1[^>]*>/gi,
        () => `<img src="${imgBase}/${idx++}" />`
      );
    }
    lines.push(htmlToMarkdown(bodyForMd));
  } else if (params.description || (params.sections && params.sections.length > 0)) {
    // Legacy structured format — replace inline base64 imgs with public URLs
    // so they render in DingTalk (otherwise htmlToMarkdown strips data: imgs).
    const imgBaseRoot = params.baseUrl && params.reviewId
      ? `${params.baseUrl}/api/public/review-image/${params.reviewId}`
      : null;
    const replaceInline = (html: string, pathPrefix: string): string => {
      if (!imgBaseRoot) return html;
      let idx = 0;
      return html.replace(
        /<img\b[^>]*\bsrc=(['"])(data:[^'"]+)\1[^>]*>/gi,
        () => `<img src="${imgBaseRoot}/${pathPrefix}/${idx++}" />`
      );
    };

    const descHtml = params.description ? replaceInline(params.description, 'desc-inline') : '';
    const descMd = descHtml ? htmlToMarkdown(descHtml) : '';
    if (descMd) { lines.push(descMd); lines.push(''); }
    if (params.sections && params.sections.length > 0) {
      lines.push('---');
      lines.push('');
      params.sections.forEach((sec, i) => {
        const titleMd = htmlToMarkdown(sec.title || '').trim();
        const contentHtml = replaceInline(sec.content || '', `sec-inline/${i}`);
        const contentMd = htmlToMarkdown(contentHtml).trim();
        lines.push(`**${i + 1}. ${titleMd}**`);
        if (contentMd) { lines.push(''); lines.push(contentMd); }
        lines.push('');
      });
    }
  } else {
    // No content at all — fallback to simple invite text
    lines.push('邀请大家尽快阅读并评分 👇');
  }

  // ── Tags ────────────────────────────────────────────────────────────
  if (params.tags && params.tags.length > 0) {
    lines.push('');
    lines.push(params.tags.map(t => `#${t}`).join('  '));
  }

  // ── Safety: strip base64 remnants + enforce 20KB limit ─────────────
  let text = lines.join('\n');
  text = text.replace(/\[\[IMG:[^\]]*?\]\]/g, '');
  text = text.replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g, '');
  const MAX_BYTES = 18000;
  if (Buffer.byteLength(text, 'utf8') > MAX_BYTES) {
    while (Buffer.byteLength(text, 'utf8') > MAX_BYTES) text = text.slice(0, -100);
    text += '\n\n…… 内容过长，请点击下方按钮查看完整版';
  }

  const payload = {
    msgtype: 'actionCard',
    actionCard: {
      title: `[短评] ${params.authorName} 发布了新短评`,
      text,
      btnOrientation: '0',
      btns: [
        { title: '📖 阅读原文 / 评分', actionURL: wrapUrl(params.reviewUrl) },
      ],
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
