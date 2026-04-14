import { FastifyInstance } from 'fastify';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

const FORMAT_PROMPT = `你是一位AI技术战略分析师，为内部团队撰写「短评」——简洁、有观点的技术动态评述。

请将以下原始材料整理为规范的短评格式。严格返回JSON对象，不要有任何其他文字或markdown代码块。

返回格式：
{
  "title": "标题（不含【短评】前缀，20字以内，突出核心价值）",
  "body": "HTML正文字符串（用<h2>作二级标题，<p>作段落，<ul><li>作要点；结构：背景/现象 → 核心观点3-5点 → 战略意义；总字数400-800字）",
  "suggestedTags": ["从以下选择1-3个最相关标签：AI Coding、基础模型、AI应用、具身智能、其他"]
}

原始材料：
`;

interface FormatResult {
  title: string;
  body: string;
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
        return reply.status(502).send({ error: `AI 服务返回错误 ${anthropicRes.status}` });
      }

      const data = await anthropicRes.json() as any;
      const rawContent: string = data?.content?.[0]?.text || '';

      // Parse JSON — strip markdown fences if present
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
        body: (result.body || '').trim(),
        suggestedTags: Array.isArray(result.suggestedTags) ? result.suggestedTags : [],
      };
    }
  );
}
