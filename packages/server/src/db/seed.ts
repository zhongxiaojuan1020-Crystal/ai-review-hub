import Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import { getConfig } from '../config.js';

const config = getConfig();
const sqlite = new Database(config.databasePath);

// Domain expertise weights per member
// Scale: 1.0 = primary domain, 0.7 = secondary domain, 0.3 = passing familiarity
const domainWeights = {
  // 衔木: AI应用 primary, AI Coding secondary
  user_xianmu: { 'AI应用': 1.0, 'AI Coding': 0.7, '基础模型': 0.3, '具身智能': 0.3 },
  // 司徒琳璟: AI Coding primary, AI应用 secondary
  user_situlj: { 'AI Coding': 1.0, 'AI应用': 0.7, '基础模型': 0.3, '具身智能': 0.3 },
  // 李飞宏: 基础模型 primary, 具身智能 secondary
  user_lifeihong: { '基础模型': 1.0, '具身智能': 0.7, 'AI应用': 0.3, 'AI Coding': 0.3 },
  // 阿离: 具身智能 primary, 基础模型(多模态) secondary
  user_ali: { '具身智能': 1.0, '基础模型': 0.7, 'AI应用': 0.3, 'AI Coding': 0.3 },
  // 方文 (supervisor): domain_weights not used — fixed 40% share
  user_supervisor: null,
};

const insertUser = sqlite.prepare(
  `INSERT OR IGNORE INTO users (id, name, avatar_url, dingtalk_userid, role, domain_weights) VALUES (?, ?, ?, ?, ?, ?)`
);

const demoUsers = [
  { id: 'user_supervisor', name: '方文', dingtalk: 'dt_fangwen', role: 'supervisor', weights: null },
  { id: 'user_xianmu',    name: '衔木',   dingtalk: 'dt_xianmu',   role: 'member',     weights: domainWeights.user_xianmu },
  { id: 'user_situlj',    name: '司徒琳璟', dingtalk: 'dt_situlj',   role: 'member',     weights: domainWeights.user_situlj },
  { id: 'user_lifeihong', name: '李飞宏', dingtalk: 'dt_lifeihong', role: 'member',     weights: domainWeights.user_lifeihong },
  { id: 'user_ali',       name: '阿离',   dingtalk: 'dt_ali',       role: 'member',     weights: domainWeights.user_ali },
];

for (const u of demoUsers) {
  insertUser.run(u.id, u.name, null, u.dingtalk, u.role, u.weights ? JSON.stringify(u.weights) : null);
}

// Seed demo reviews
const insertReview = sqlite.prepare(
  `INSERT OR IGNORE INTO reviews (id, author_id, company, description, sections, tags, sources, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-5 days'), datetime('now', '-5 days'))`
);

insertReview.run(
  'review_demo_1', 'user_xianmu',
  'Unitree 宇树',
  '宇树于3月提交科创板IPO材料，拟募资XX亿，估值约150亿人民币。本次上市为具身智能赛道首个A股IPO案例。',
  JSON.stringify([
    { title: '具身智能首个IPO，定价锚点意义大于融资本身', content: '宇树的IPO估值将成为行业定价参照系，影响后续一级市场融资逻辑。其公开披露的数据将首次让外部投资人看到真实的收入规模与毛利水平。', images: [] },
    { title: '对竞争格局的影响', content: '上市将加速宇树品牌建设与渠道扩张，但也将面临更严格的信披压力，部分核心技术路线可能因此提前暴露。', images: [] },
  ]),
  JSON.stringify(['具身智能', '本体']),
  JSON.stringify([]),
  'in_progress'
);

insertReview.run(
  'review_demo_2', 'user_situlj',
  'OpenAI GPT-5',
  'OpenAI预计于2025年Q2发布GPT-5，据内部信息新模型在推理能力上有重大突破，MMLU分数超过92%。',
  JSON.stringify([
    { title: '推理能力跃升将重新定义AI Coding赛道格局', content: '如果GPT-5的推理能力达到预期，现有AI编程助手的技术壁垒将被大幅削弱。SWE-bench等基准测试的通过率可能超过60%。', images: [] },
    { title: '对国内大模型厂商的竞争压力', content: '国内厂商在推理能力上的差距可能进一步拉大，预计将加速模型蒸馏和Agent方向的投入来寻求差异化。', images: [] },
  ]),
  JSON.stringify(['基础模型', 'LLM', 'AI Coding']),
  JSON.stringify(['https://openai.com/blog']),
  'in_progress'
);

insertReview.run(
  'review_demo_3', 'user_lifeihong',
  'Claude 4.5 Sonnet',
  'Anthropic发布Claude 4.5 Sonnet，采用混合推理架构，在长上下文理解和多步推理任务上表现突出。',
  JSON.stringify([
    { title: '混合推理架构或成行业标配', content: '快思考+慢思考的混合架构已被OpenAI o系列和Claude验证有效，预计未来12个月国内头部模型将跟进。', images: [] },
    { title: '对企业客户的吸引力', content: '长上下文能力对法律、金融等文档密集型行业有直接价值，有助于Anthropic在企业市场提升份额。', images: [] },
  ]),
  JSON.stringify(['基础模型', 'LLM', 'AI Coding']),
  JSON.stringify([]),
  'in_progress'
);

// Seed completed scores so the ranking page shows results
// Review 1 (具身智能/本体): 阿离 primary, 李飞宏 secondary
const insertScore = sqlite.prepare(
  `INSERT OR IGNORE INTO scores (id, review_id, scorer_id, relevance, necessity, importance, urgency, logic, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-4 days'), datetime('now', '-4 days'))`
);

// review_demo_1 scores
insertScore.run(nanoid(), 'review_demo_1', 'user_supervisor',  3.5, 4.0, 4.5, 3.0, 4.0);
insertScore.run(nanoid(), 'review_demo_1', 'user_situlj',      2.5, 3.0, 4.0, 3.0, 3.5);
insertScore.run(nanoid(), 'review_demo_1', 'user_lifeihong',   4.0, 4.5, 4.5, 3.5, 4.0);
insertScore.run(nanoid(), 'review_demo_1', 'user_ali',         4.5, 4.0, 5.0, 4.0, 4.5);
// 衔木 is author, no score

// review_demo_2 scores
insertScore.run(nanoid(), 'review_demo_2', 'user_supervisor',  4.0, 4.5, 4.0, 4.5, 4.0);
insertScore.run(nanoid(), 'review_demo_2', 'user_xianmu',      3.5, 4.0, 4.0, 4.0, 3.5);
insertScore.run(nanoid(), 'review_demo_2', 'user_lifeihong',   4.5, 4.0, 4.0, 4.0, 4.5);
insertScore.run(nanoid(), 'review_demo_2', 'user_ali',         3.0, 3.5, 3.5, 4.0, 3.0);
// 司徒琳璟 is author, no score

// review_demo_3 scores
insertScore.run(nanoid(), 'review_demo_3', 'user_supervisor',  4.5, 4.0, 4.5, 3.5, 4.5);
insertScore.run(nanoid(), 'review_demo_3', 'user_xianmu',      3.0, 3.5, 4.0, 3.0, 3.5);
insertScore.run(nanoid(), 'review_demo_3', 'user_situlj',      4.0, 4.0, 4.5, 3.5, 4.0);
insertScore.run(nanoid(), 'review_demo_3', 'user_ali',         4.0, 3.5, 4.0, 3.0, 4.0);
// 李飞宏 is author, no score

// Mark all three reviews as completed with a placeholder heat score (will be recalculated by scoring service)
sqlite.prepare(
  `UPDATE reviews SET status = 'completed', completed_at = datetime('now', '-3 days'), heat_score = 4.0 WHERE id IN ('review_demo_1','review_demo_2','review_demo_3')`
).run();

console.log(`Seeded ${demoUsers.length} users and 3 demo reviews with scores`);
sqlite.close();
