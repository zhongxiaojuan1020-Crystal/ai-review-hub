import { FastifyInstance } from 'fastify';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

const FORMAT_PROMPT = `你是一位AI技术战略分析师，为内部团队撰写「短评」——简洁、有观点的技术动态评述。

请将以下原始材料整理为规范的短评格式。严格返回JSON对象，不要有任何其他文字或markdown代码块。

返回格式：
{
  "title": "标题（不含【短评】前缀，20字以内，突出核心价值）",
  "description": "一句话摘要（30-60字，概括核心事件或核心价值，直接出现在卡片摘要位置）",
  "sections": [
    { "title": "观点/亮点标题（15字以内）", "content": "该观点的详细说明（50-150字，客观具体）" },
    { "title": "...", "content": "..." }
  ],
  "suggestedTags": ["从以下选择1-3个最相关标签：AI Coding、基础模型、AI应用、具身智能、其他"]
}

要求：
- sections 数量3-5个，每个代表一个独立观点或技术亮点
- 每个section.title要简洁有力，会显示为卡片上的编号圆圈要点
- description是整体摘要，不重复sections内容
- 风格：客观、专业、有战略视角，避免空话

原始材料：
`;

interface FormatResult {
  title: string;
  description: string;
  sections: { title: string; content: string }[];
  suggestedTags: string[];
}

export async function aiRoutes(app: FastifyInstance) {
  app.post(
    '/api/ai/format',
    { preValidation: [app.authenticate] },
    async (request, reply) => {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return reply.status(503).send({
          error: '未配置 ANTHROPIC_API_KEY，请在 Railway 环境变量中添加',
        });
      }

      const { rawText } = request.body as { rawText?: string };
      if (!rawText || rawText.trim().length < 10) {
        return reply.status(400).send({ error: '请提供足够的原始内容（至少10字）' });
      }

      const prompt = FORMAT_PROMPT + rawText.trim();

      let anthropicRes: Response;
      try {
        anthropicRes = await fetch(ANTHROPIC_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-3-5-haiku-20241022',
            max_tokens: 2048,
            messages: [{ role: 'user', content: prompt }],
          }),
        });
      } catch (err: any) {
        console.error('[AI] fetch failed:', err?.message);
        return reply.status(502).send({ error: 'AI 服务请求失败，请稍后重试' });
      }

      if (!anthropicRes.ok) {
        const errText = await anthropicRes.text();
        console.error('[AI] API error:', anthropicRes.status, errText);
        let detail = '';
        try {
          const errJson = JSON.parse(errText);
          detail = errJson?.error?.message || errText.slice(0, 200);
        } catch {
          detail = errText.slice(0, 200);
        }
        return reply.status(502).send({ error: `AI 服务返回错误 ${anthropicRes.status}: ${detail}` });
      }

      const data = await anthropicRes.json() as any;
      const rawContent: string = data?.content?.[0]?.text || '';

      let result: FormatResult;
      try {
        const cleaned = rawContent
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/```\s*$/, '')
          .trim();
        result = JSON.parse(cleaned);
      } catch {
        console.error('[AI] JSON parse failed. Raw:', rawContent.slice(0, 300));
        return reply.status(502).send({ error: 'AI 返回内容解析失败，请重试' });
      }

      return {
        title: (result.title || '').trim(),
        description: (result.description || '').trim(),
        sections: Array.isArray(result.sections)
          ? result.sections.map(s => ({ title: String(s.title || '').trim(), content: String(s.content || '').trim() }))
          : [],
        suggestedTags: Array.isArray(result.suggestedTags) ? result.suggestedTags : [],
      };
    }
  );
}
