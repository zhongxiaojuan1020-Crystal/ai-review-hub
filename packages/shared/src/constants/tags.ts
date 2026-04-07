export interface TagCategory {
  label: string;
  children: string[];
}

export const DEFAULT_TAGS: TagCategory[] = [
  { label: '基础模型', children: ['LLM', '多模态'] },
  { label: '具身智能', children: ['VLA', 'WM', '数采', '本体'] },
  { label: 'AI Coding', children: [] },
  { label: 'AI 应用', children: ['Agent', 'Claw'] },
];
