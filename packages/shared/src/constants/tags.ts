// ============================================================================
// Tag taxonomy – hierarchical (L1 domain / L2 topic) with shared color palette
// ============================================================================
//
// Every tag belongs to one of 4 L1 domains (基础模型 / 具身智能 / AI Coding / AI应用)
// or falls back to "其他". Each domain has its own hue, and L2 topics under the
// same domain share that hue in a lighter shade – giving related tags a visible
// family relationship while keeping domains distinguishable at a glance.
//
// This file is the single source of truth for:
//   - Default L1 + L2 tags
//   - Per-domain color palette (used by tags, stats panel, archive drawer, etc.)
//   - Helpers: getTagLevel / getTagDomain / getTagColor

export type TagLevel = 'L1' | 'L2';

export interface TagDef {
  label: string;
  level: TagLevel;
  /** For L2 tags: the L1 (domain) label this tag lives under. */
  parent?: string;
}

// The 4 L1 domains, in a fixed display order
export const MAIN_DOMAINS = ['基础模型', '具身智能', 'AI Coding', 'AI应用'] as const;
export type Domain = typeof MAIN_DOMAINS[number];

// ---------- Color palette ---------------------------------------------------
// Each L1 gets its own hue. L2 tags inherit the hue but render in a lighter
// shade (same family, different brightness). "其他" falls back to neutral gray.

export interface DomainPalette {
  /** Primary (dark) color — used for L1 text / chip text */
  primary: string;
  /** Medium shade — used for L2 chip text */
  light: string;
  /** Background tint — used for chip background */
  bg: string;
  /** Border color — used for chip border */
  border: string;
  /** Background tint for L2 (slightly lighter than bg) */
  bgL2: string;
}

export const DOMAIN_PALETTE: Record<string, DomainPalette> = {
  '基础模型': {
    primary: '#1677FF',
    light:   '#4096FF',
    bg:      '#E6F4FF',
    bgL2:    '#F0F8FF',
    border:  '#91CAFF',
  },
  '具身智能': {
    primary: '#722ED1',
    light:   '#9254DE',
    bg:      '#F9F0FF',
    bgL2:    '#FBF5FF',
    border:  '#D3ADF7',
  },
  'AI Coding': {
    primary: '#13A8A8',
    light:   '#36CFC9',
    bg:      '#E6FFFB',
    bgL2:    '#F0FFFD',
    border:  '#87E8DE',
  },
  'AI应用': {
    primary: '#FA8C16',
    light:   '#FFA940',
    bg:      '#FFF7E6',
    bgL2:    '#FFFBF0',
    border:  '#FFD591',
  },
  '其他': {
    primary: '#8c8c8c',
    light:   '#bfbfbf',
    bg:      '#fafafa',
    bgL2:    '#fcfcfc',
    border:  '#e0e0e0',
  },
};

// Quick lookup of just the primary color (used by charts / bars)
export const DOMAIN_COLOR: Record<string, string> = Object.fromEntries(
  Object.entries(DOMAIN_PALETTE).map(([k, v]) => [k, v.primary]),
);

// ---------- Default tag taxonomy -------------------------------------------

/** L1 domain tags (always visible) */
export const L1_TAGS: TagDef[] = MAIN_DOMAINS.map(d => ({ label: d, level: 'L1' as const }));

/** L2 topic tags shipped by default. parent must match an L1 label. */
export const L2_TAGS: TagDef[] = [
  // 基础模型
  { label: 'LLM',        level: 'L2', parent: '基础模型' },
  { label: '多模态',      level: 'L2', parent: '基础模型' },
  { label: '预训练',      level: 'L2', parent: '基础模型' },
  // 具身智能
  { label: 'VLA',        level: 'L2', parent: '具身智能' },
  { label: 'WM',         level: 'L2', parent: '具身智能' },
  { label: '数采',        level: 'L2', parent: '具身智能' },
  { label: '本体',        level: 'L2', parent: '具身智能' },
  // AI Coding
  { label: 'Copilot',    level: 'L2', parent: 'AI Coding' },
  { label: '开发工具',    level: 'L2', parent: 'AI Coding' },
  // AI 应用
  { label: 'Agent',      level: 'L2', parent: 'AI应用' },
  { label: 'Claw',       level: 'L2', parent: 'AI应用' },
  { label: 'SaaS',       level: 'L2', parent: 'AI应用' },
];

/** Full default taxonomy, flat. */
export const DEFAULT_TAGS: TagDef[] = [...L1_TAGS, ...L2_TAGS];

// ---------- Back-compat: TAG_DOMAIN_MAP ------------------------------------
// Maps any known tag label → its L1 domain. Used by older call sites that
// still take `tags: string[]` and need to infer a domain.

export const TAG_DOMAIN_MAP: Record<string, string> = Object.fromEntries([
  ...L1_TAGS.map(t => [t.label, t.label]),
  ...L2_TAGS.map(t => [t.label, t.parent!]),
  // Common aliases
  ['大模型', '基础模型'],
  ['Transformer', '基础模型'],
  ['机器人', '具身智能'],
  ['人形机器人', '具身智能'],
  ['代码', 'AI Coding'],
  ['编程', 'AI Coding'],
  ['应用', 'AI应用'],
  ['产品', 'AI应用'],
]);

// ---------- Helpers ---------------------------------------------------------

/** Look up a tag across default + user-custom lists. */
export function findTagDef(label: string, customTags: TagDef[] = []): TagDef | null {
  return (
    DEFAULT_TAGS.find(t => t.label === label) ||
    customTags.find(t => t.label === label) ||
    null
  );
}

/** Return the L1 domain for any tag label (default, custom, or alias). */
export function getTagDomain(label: string, customTags: TagDef[] = []): string {
  const def = findTagDef(label, customTags);
  if (def) return def.level === 'L1' ? def.label : (def.parent || '其他');
  return TAG_DOMAIN_MAP[label] || '其他';
}

/** Return 'L1' or 'L2' for any tag (L2 by default for unknown custom tags). */
export function getTagLevel(label: string, customTags: TagDef[] = []): TagLevel {
  const def = findTagDef(label, customTags);
  if (def) return def.level;
  // Pure aliases (no def found) → L2 under inferred domain
  return 'L2';
}

/** Return { text, bg, border } for rendering a tag chip. */
export function getTagColor(label: string, customTags: TagDef[] = []): {
  text: string; bg: string; border: string;
} {
  const domain = getTagDomain(label, customTags);
  const level = getTagLevel(label, customTags);
  const palette = DOMAIN_PALETTE[domain] || DOMAIN_PALETTE['其他'];
  if (level === 'L1') {
    return { text: palette.primary, bg: palette.bg, border: palette.border };
  }
  // L2: same hue, lighter shade
  return { text: palette.light, bg: palette.bgL2, border: palette.border };
}

/** Derive review → domain from its tag list (first match wins). */
export function reviewDomainFromTags(tags: string[], customTags: TagDef[] = []): string {
  for (const t of tags || []) {
    const d = getTagDomain(t, customTags);
    if (d !== '其他') return d;
  }
  return '其他';
}
