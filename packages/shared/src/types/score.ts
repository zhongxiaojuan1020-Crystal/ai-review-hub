export interface ScoreDimensions {
  relevance: number;
  necessity: number;
  importance: number;
  urgency: number;
  logic: number;
}

export interface Score extends ScoreDimensions {
  id: string;
  reviewId: string;
  scorerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScoreSubmitInput extends ScoreDimensions {}

export interface ScoreBreakdown extends ScoreDimensions {
  scorerName: string;
  scorerAvatar: string | null;
  totalScore: number;
}

/** Legacy 5-dimension scoring (kept for backward compat display). */
export const SCORE_DIMENSIONS = [
  { key: 'relevance',  label: '相关性', description: '与团队核心追踪方向的一致性程度，如 Agent 应用、MaaS、物理 AI 等' },
  { key: 'necessity',  label: '必要性', description: '事件和短评带来的增量信息，如新的 AI 产品形态 / 技术应用 / 模型迭代、多样化视角分析' },
  { key: 'importance', label: '重要性', description: '事件点评相对行业该技术发展的重要程度，如提供了技术价值 / 业务价值的判断' },
  { key: 'urgency',    label: '紧迫性', description: '时间敏感度和传播紧迫程度，如事件本身是行业首发 / 突破性技术、引发了快速裂变和传播' },
  { key: 'logic',      label: '逻辑性', description: '观点表述清晰度和逻辑严谨度，如权威评测论据支持、广泛数据支撑、多玩家对比分析' },
] as const;

export type DimensionKey = typeof SCORE_DIMENSIONS[number]['key'];

/** New simplified 2-dimension 3-star scoring. */
export const NEW_SCORE_DIMENSIONS = [
  {
    key: 'quality_score' as const,
    label: '质量',
    description: '观点表述清晰度和逻辑严谨度，如权威评测论据支持、广泛数据支撑、多玩家对比分析等。',
  },
  {
    key: 'importance_score' as const,
    label: '重要性',
    description: '选题和观点的重要程度，如技术先进性、事件增量信息、对业务的判断价值增量、时间紧迫程度等。',
  },
] as const;

export type NewDimensionKey = typeof NEW_SCORE_DIMENSIONS[number]['key'];
