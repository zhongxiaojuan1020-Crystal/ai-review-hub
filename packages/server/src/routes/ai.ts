import { FastifyInstance } from 'fastify';

/**
 * AI 一键排版：把作者贴入的已写好的短评原文，纯机械地拆解到结构化字段。
 * - 不总结、不改写、不润色、不翻译
 * - 保留原文富文本（颜色等 style 保留；字体、字号清洗为系统默认）
 * - base64 图片用占位符方式来回传递，防止被大模型截断/篡改
 */

const SYSTEM_PROMPT = `你是「AI 短评圈」的排版助手。你的唯一任务是：把作者已经写好的短评文本，原样拆解到结构化字段里。

# ⚠️ 核心原则（最重要）
你是"切割刀"，不是"编辑器"。
- 绝对不要总结、概括、改写、润色、翻译原文的任何一句话
- 绝对不要补充原文没有的内容
- 绝对不要删减原文内容（除明显的结构分隔符）
- 原文是什么字就输出什么字，标点、语气词、口头禅都保留
- 如果原文只有一段话，就只输出一段话；不要硬拆成多个 sections
- 如果原文没有明显的标题，就从首句截取前 15–20 字，不要自己创作

# 图片占位符
原文中图片已被替换为 [[IMG_PLACEHOLDER_N]]（N 为数字）的占位符。
请**原样保留**这些占位符，不要删除、改写、合并或重命名。
系统会在返回后把它们还原为原图。

# 你要识别的边界信号

## 标题（title）
- 通常在最开头、单独一行、较短（<30 字）
- 可能有「标题：」「《》」「【】」「#」等标记
- 如果识别不出，就从首句截取前 15–20 字

## 导语（description）
- 标题之后、第一个小标题之前的段落
- 如果原文没有明显的导语，description 返回空字符串 ""

## 小节（sections）
识别信号：
- Markdown ##、### 开头
- 「1.」「2.」「一、」「二、」「①②③」等序号
- 加粗独占一行的短句（可能是小标题）
- 空行分隔的明显段落块
- 「亮点：」「观点：」「点评：」等引导词

### 高频模式："序号 + 首句即小标题"
作者常写成：

  观点一：Claude 4.5 在编码能力上领先。具体来看，在 SWE-Bench 上...
  └────────── 小标题（完整保留） ──────┘  └─── 正文 ───┘

处理规则：
- 如果某段以「观点N/亮点N/要点N/第N点/技术亮点N/①②③/一、二、三、」等序号引导词开头（跟「：」「、」「，」「.」）
- 则从段首到第一个句号/问号/感叹号前的那整句话 = section.title
- **⚠️ section.title 必须完整保留序号前缀**！比如"观点一：Claude 4.5 在编码能力上领先"这一整句都是 title，不要剥离"观点一："
- 从第一个句号之后、到下一个"观点N/亮点N"之前的内容 = section.content
- 原文里已经有的加粗/颜色/背景色等 HTML 标签全部原样保留

### 完全没有结构时
如果作者贴的是一整段没有分节的文字：
- description 放全部内容
- sections 返回空数组 []

## 参考来源（sources）
原文末尾经常会列出几条参考链接，常见格式：
  官方博客：https://...
  OpenAI收购Sky新闻：https://...
  原Sky功能介绍：https://...

或：
  - https://xxx.com
  - https://yyy.com

处理规则：
- 识别所有这种形如「描述: URL」或纯 URL 列表的参考链接
- 把**每条 URL**（只要 URL 本身，不含中文描述前缀）放进 sources 数组
- 这些参考链接行**不要**再出现在最后一个 section 的 content 里（要从 content 中删掉）
- 如果原文没有参考链接，sources 返回空数组 []

# HTML 处理规则
- 如果输入是纯文本，用 <p> 包裹段落，换行用 <br>
- 如果输入已经是富文本/HTML，**原样保留** <strong>、<em>、<u>、<ul>、<li>、<ol>、<img>、<p>、<br>、<h1>~<h6>、<span style="color:...">、<span style="background-color:...">、<span style="text-decoration:..."> 等
- 已被占位符替代的图片保留占位符即可
- 小标题文字不要重复出现在 content 里（已经在 section.title 中）

# 输出格式
严格返回下面这个 JSON（不要 markdown 代码块、不要前后任何文字）：

{
  "title": "标题文字",
  "description": "导语 HTML",
  "sections": [
    { "title": "完整小标题（含「观点一：」等前缀）", "content": "正文 HTML" }
  ],
  "sources": ["https://xxx.com", "https://yyy.com"]
}

# 禁忌
- ❌ 不要"精炼"句子
- ❌ 不要"补充背景"
- ❌ 不要"调整逻辑"
- ❌ 不要"统一风格"
- ❌ 不要输出 suggestedTags 字段（作者自己选）
- ❌ 不要在 JSON 之外输出任何解释/说明/道歉
- ❌ 不要输出 markdown 代码块包裹 JSON`;

interface FormatResult {
  title: string;
  description: string;
  sections: { title: string; content: string }[];
  sources: string[];
}

/**
 * 把 HTML 中的 <img src="data:..."> 替换成占位符，
 * 返回占位符化的 HTML 和原始图片 src 数组。
 */
function extractImagesToPlaceholders(html: string): { placeholderHtml: string; images: string[] } {
  const images: string[] = [];
  const placeholderHtml = html.replace(
    /<img\b[^>]*\bsrc=(['"])(data:[^'"]+)\1[^>]*>/gi,
    (_match, _quote, src) => {
      const idx = images.length;
      images.push(src);
      return `[[IMG_PLACEHOLDER_${idx}]]`;
    }
  );
  return { placeholderHtml, images };
}

/**
 * 还原占位符为 <img> 标签（使用原始 src）。
 */
function restorePlaceholders(text: string, images: string[]): string {
  return text.replace(/\[\[IMG_PLACEHOLDER_(\d+)\]\]/g, (match, idxStr) => {
    const idx = parseInt(idxStr, 10);
    if (Number.isNaN(idx) || idx < 0 || idx >= images.length) return match;
    return `<img src="${images[idx]}" />`;
  });
}

/**
 * 清洗 style 属性中的字体与字号设置（让系统默认值生效），
 * 保留颜色、背景、文字装饰等其它 style。
 */
function cleanStyleFonts(html: string): string {
  return html.replace(/\bstyle\s*=\s*(['"])([^'"]*)\1/gi, (_m, quote, styleContent) => {
    const cleaned = styleContent
      .split(';')
      .map((decl: string) => decl.trim())
      .filter((decl: string) => {
        if (!decl) return false;
        const lowered = decl.toLowerCase();
        if (lowered.startsWith('font-family')) return false;
        if (lowered.startsWith('font-size')) return false;
        if (lowered.startsWith('line-height')) return false;
        if (lowered.startsWith('font:')) return false; // shorthand 一般含字号
        return true;
      })
      .join('; ');
    if (!cleaned) return ''; // style 全被清空，整个属性去掉
    return `style=${quote}${cleaned}${quote}`;
  });
}

/**
 * 去掉危险标签：<script>、<style>、on* 事件属性。
 */
function stripDangerous(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '');
}

export async function aiRoutes(app: FastifyInstance) {
  app.post(
    '/api/ai/format',
    { preValidation: [app.authenticate] },
    async (request, reply) => {
      const apiKey = process.env.LLM_API_KEY;
      const baseUrl = process.env.LLM_BASE_URL;
      const model = process.env.LLM_MODEL;

      if (!apiKey || !baseUrl || !model) {
        return reply.status(503).send({
          error: '未配置 LLM_API_KEY / LLM_BASE_URL / LLM_MODEL 环境变量',
        });
      }

      const { rawText } = request.body as { rawText?: string };
      if (!rawText || !rawText.trim()) {
        return reply.status(400).send({ error: '请提供原始内容' });
      }

      // 1) 预处理：去危险标签 → 提取 base64 图片 → 清洗字体/字号 style
      const safeInput = stripDangerous(rawText);
      const { placeholderHtml, images } = extractImagesToPlaceholders(safeInput);
      const cleanedInput = cleanStyleFonts(placeholderHtml);

      // 2) 组装 OpenAI 兼容协议请求
      const endpoint = baseUrl.replace(/\/+$/, '') + '/chat/completions';
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30_000);

      let llmRes: Response;
      try {
        llmRes = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            temperature: 0.2,
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: cleanedInput },
            ],
          }),
          signal: controller.signal,
        });
      } catch (err: any) {
        clearTimeout(timer);
        const isAbort = err?.name === 'AbortError';
        console.error('[AI] fetch failed:', err?.message);
        return reply.status(502).send({
          error: isAbort ? 'AI 服务超时（30s），请稍后重试' : 'AI 服务请求失败，请稍后重试',
        });
      }
      clearTimeout(timer);

      if (!llmRes.ok) {
        const errText = await llmRes.text();
        console.error('[AI] API error:', llmRes.status, errText);
        let detail = '';
        try {
          const errJson = JSON.parse(errText);
          detail = errJson?.error?.message || errJson?.message || errText.slice(0, 200);
        } catch {
          detail = errText.slice(0, 200);
        }
        return reply.status(502).send({ error: `AI 服务返回错误 ${llmRes.status}: ${detail}` });
      }

      const data = (await llmRes.json()) as any;
      const rawContent: string = data?.choices?.[0]?.message?.content || '';

      // 3) 解析 JSON（兼容模型返回时包裹 ```json 代码块的情况）
      let result: FormatResult;
      try {
        let cleaned = rawContent.trim();
        // 去掉 markdown 代码块围栏
        cleaned = cleaned
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/```\s*$/, '')
          .trim();
        // 如果首尾不是 { }，尝试提取中间的 JSON 片段
        if (!cleaned.startsWith('{')) {
          const m = cleaned.match(/\{[\s\S]*\}/);
          if (m) cleaned = m[0];
        }
        result = JSON.parse(cleaned);
      } catch {
        console.error('[AI] JSON parse failed. Raw:', rawContent.slice(0, 300));
        // fallback：把原内容整个丢到 description，让作者自己整理
        return {
          title: '',
          description: rawText,
          sections: [],
          sources: [],
          _fallback: true,
          _reason: 'AI 返回无法解析，已将原内容填入摘要',
        };
      }

      // 4) 后处理：style 再清洗一遍 + 还原图片占位符
      const postProcess = (s: string) => restorePlaceholders(cleanStyleFonts(String(s || '')), images);

      const finalResult: FormatResult = {
        title: String(result.title || '').trim(),
        description: postProcess(result.description || '').trim(),
        sections: Array.isArray(result.sections)
          ? result.sections
              .filter((s) => s && (s.title || s.content))
              .map((s) => ({
                title: String(s.title || '').trim(),
                content: postProcess(s.content || '').trim(),
              }))
          : [],
        sources: Array.isArray(result.sources)
          ? result.sources
              .map((s) => String(s || '').trim())
              .filter((s) => /^https?:\/\//i.test(s))
          : [],
      };

      return finalResult;
    }
  );
}
