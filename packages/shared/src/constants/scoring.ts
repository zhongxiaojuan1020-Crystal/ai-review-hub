export const DEFAULT_DIMENSION_WEIGHTS = {
  relevance: 0.2,
  necessity: 0.2,
  importance: 0.2,
  urgency: 0.2,
  logic: 0.2,
};

// Supervisor's fixed share of the final heat score (regardless of team size)
export const SUPERVISOR_SCORE_SHARE = 0.4;
export const DEFAULT_SUPERVISOR_WEIGHT = 2.0;
export const DEFAULT_MEMBER_WEIGHT = 1.0;
export const DEFAULT_GUEST_TOKEN_EXPIRY_HOURS = 720; // 30 days
export const SCORE_MIN = 0;
export const SCORE_MAX = 5;
export const AUTO_COMPLETE_HOURS = 24;

// Maps specific tags to the 4 main domain categories
export const TAG_DOMAIN_MAP: Record<string, string> = {
  '基础模型': '基础模型',
  'LLM': '基础模型',
  '大模型': '基础模型',
  '多模态': '基础模型',
  'Transformer': '基础模型',
  '预训练': '基础模型',
  '具身智能': '具身智能',
  '本体': '具身智能',
  '机器人': '具身智能',
  '人形机器人': '具身智能',
  'AI Coding': 'AI Coding',
  '代码': 'AI Coding',
  '编程': 'AI Coding',
  'Copilot': 'AI Coding',
  '开发工具': 'AI Coding',
  'AI应用': 'AI应用',
  '应用': 'AI应用',
  'SaaS': 'AI应用',
  'Agent': 'AI应用',
  '产品': 'AI应用',
};

// The 4 main domain categories
export const MAIN_DOMAINS = ['基础模型', '具身智能', 'AI Coding', 'AI应用'] as const;
export type Domain = typeof MAIN_DOMAINS[number];
