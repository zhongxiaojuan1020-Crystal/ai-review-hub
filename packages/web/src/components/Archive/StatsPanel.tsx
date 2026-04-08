import React, { useMemo, useState } from 'react';
import { Card, Radio, Typography, Space, Tag, Avatar, DatePicker } from 'antd';
import { FireOutlined, FileTextOutlined, CheckCircleOutlined, UserOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { DOMAIN_COLOR, reviewDomainFromTags, getTagColor } from '@ai-review/shared';

const { Text } = Typography;
const { RangePicker } = DatePicker;

const reviewDomain = (tags: string[]): string => reviewDomainFromTags(tags || []);

type PeriodMode = 'week' | 'month' | 'custom';

function getWeekRange(): [Dayjs, Dayjs] {
  const today = dayjs();
  const dow = today.day(); // 0=Sun, 1=Mon, ..., 6=Sat
  const daysFromMonday = dow === 0 ? 6 : dow - 1;
  const monday = today.subtract(daysFromMonday, 'day').startOf('day');
  const sunday = monday.add(6, 'day').endOf('day');
  return [monday, sunday];
}

function getMonthRange(): [Dayjs, Dayjs] {
  const today = dayjs();
  return [today.startOf('month'), today.endOf('month')];
}

interface Props {
  reviews: any[];
}

const StatsPanel: React.FC<Props> = ({ reviews }) => {
  const [mode, setMode] = useState<PeriodMode>('week');
  const [customRange, setCustomRange] = useState<[Dayjs, Dayjs] | null>(null);

  const dateRange = useMemo((): [Dayjs, Dayjs] | null => {
    if (mode === 'week') return getWeekRange();
    if (mode === 'month') return getMonthRange();
    return customRange;
  }, [mode, customRange]);

  const periodReviews = useMemo(() => {
    if (!dateRange) return [];
    const [start, end] = dateRange;
    return reviews.filter(r => {
      const t = dayjs(r.createdAt);
      return !t.isBefore(start) && !t.isAfter(end);
    });
  }, [reviews, dateRange]);

  const completed = periodReviews.filter(r => r.status === 'completed');
  const avgHeat = completed.length > 0
    ? completed.reduce((s, r) => s + (r.heatScore || 0), 0) / completed.length
    : null;

  // Tag frequency across all period reviews
  const tagCounts = useMemo(() => {
    const map = new Map<string, number>();
    periodReviews.forEach(r => {
      (r.tags as string[])?.forEach(tag => {
        map.set(tag, (map.get(tag) || 0) + 1);
      });
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [periodReviews]);

  // Domain distribution
  const domainCounts = useMemo(() => {
    const map = new Map<string, number>();
    periodReviews.forEach(r => {
      const d = reviewDomain(r.tags);
      map.set(d, (map.get(d) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [periodReviews]);

  const maxDomainCount = domainCounts[0]?.[1] || 1;

  // Author leaderboard
  const authorCounts = useMemo(() => {
    const map = new Map<string, { name: string; count: number; avgScore: number; scores: number[] }>();
    periodReviews.forEach(r => {
      if (!r.author) return;
      const existing = map.get(r.author.id) || { name: r.author.name, count: 0, avgScore: 0, scores: [] as number[] };
      existing.count += 1;
      if (r.heatScore) existing.scores.push(r.heatScore);
      map.set(r.author.id, existing);
    });
    return Array.from(map.values())
      .map(a => ({
        ...a,
        avgScore: a.scores.length > 0 ? a.scores.reduce((s, v) => s + v, 0) / a.scores.length : null,
      }))
      .sort((a, b) => b.count - a.count);
  }, [periodReviews]);

  const periodLabel = mode === 'week' ? '本周' : mode === 'month' ? '本月' : '自定义';

  return (
    <Card
      size="small"
      style={{ marginBottom: 16, borderColor: '#FFD591', background: '#FFFAF0' }}
      styles={{ body: { padding: '12px 16px' } }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: mode === 'custom' ? 10 : 14 }}>
        <Text strong style={{ color: '#FF6A00' }}>团队数据看板</Text>
        <Radio.Group
          size="small"
          value={mode}
          onChange={e => setMode(e.target.value)}
          buttonStyle="solid"
          optionType="button"
          options={[
            { label: '本周', value: 'week' },
            { label: '本月', value: 'month' },
            { label: '自定义', value: 'custom' },
          ]}
        />
      </div>

      {/* Custom date range picker */}
      {mode === 'custom' && (
        <div style={{ marginBottom: 14 }}>
          <RangePicker
            size="small"
            style={{ width: '100%' }}
            value={customRange}
            onChange={val => {
              if (val && val[0] && val[1]) {
                setCustomRange([val[0].startOf('day'), val[1].endOf('day')]);
              } else {
                setCustomRange(null);
              }
            }}
            placeholder={['开始日期', '结束日期']}
            allowClear
          />
        </div>
      )}

      {/* Key metrics */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 14 }}>
        {[
          {
            icon: <FileTextOutlined style={{ color: '#FF6A00' }} />,
            label: '发布短评',
            value: periodReviews.length,
            suffix: '篇',
          },
          {
            icon: <CheckCircleOutlined style={{ color: '#52c41a' }} />,
            label: '完成评分',
            value: completed.length,
            suffix: '篇',
          },
          {
            icon: <FireOutlined style={{ color: '#FF6A00' }} />,
            label: '平均热度',
            value: avgHeat != null ? avgHeat.toFixed(2) : '-',
            suffix: '',
          },
        ].map((item, i) => (
          <div key={i} style={{
            flex: 1, textAlign: 'center', padding: '8px 4px',
            borderRight: i < 2 ? '1px solid #FFD591' : 'none',
          }}>
            <div style={{ marginBottom: 2 }}>{item.icon}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#333', lineHeight: 1.2 }}>
              {item.value}<span style={{ fontSize: 12, color: '#888', fontWeight: 400 }}>{item.suffix}</span>
            </div>
            <div style={{ fontSize: 11, color: '#888' }}>{item.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 16 }}>
        {/* Domain distribution */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 6 }}>领域分布</Text>
          {domainCounts.length === 0
            ? <Text type="secondary" style={{ fontSize: 12 }}>暂无数据</Text>
            : domainCounts.map(([domain, count]) => (
              <div key={domain} style={{ marginBottom: 5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <Text style={{ fontSize: 11, color: DOMAIN_COLOR[domain] || '#888' }}>{domain}</Text>
                  <Text style={{ fontSize: 11, color: '#888' }}>{count}</Text>
                </div>
                <div style={{ height: 5, background: '#f0f0f0', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${(count / maxDomainCount) * 100}%`,
                    background: DOMAIN_COLOR[domain] || '#ccc',
                    borderRadius: 3,
                    transition: 'width 0.4s ease',
                  }} />
                </div>
              </div>
            ))
          }
        </div>

        {/* Vertical divider */}
        <div style={{ width: 1, background: '#FFD591', flexShrink: 0 }} />

        {/* Author leaderboard */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 6 }}>活跃作者</Text>
          {authorCounts.length === 0
            ? <Text type="secondary" style={{ fontSize: 12 }}>暂无数据</Text>
            : authorCounts.slice(0, 4).map((a, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <Avatar size={20} icon={<UserOutlined />} style={{ background: '#FF6A00', fontSize: 10, flexShrink: 0 }} />
                <Text style={{ fontSize: 12, flex: 1 }} ellipsis>{a.name}</Text>
                <Tag style={{ fontSize: 11, padding: '0 5px', margin: 0, borderColor: '#FFD591', background: '#fff', color: '#FF6A00' }}>
                  {a.count}篇
                </Tag>
                {a.avgScore != null && (
                  <Space size={2} style={{ flexShrink: 0 }}>
                    <FireOutlined style={{ color: '#FF6A00', fontSize: 10 }} />
                    <Text style={{ fontSize: 11, color: '#FF6A00' }}>{a.avgScore.toFixed(1)}</Text>
                  </Space>
                )}
              </div>
            ))
          }
        </div>
      </div>

      {/* Tag cloud */}
      {tagCounts.length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed #FFD591' }}>
          <Text style={{ fontSize: 12, color: '#888', marginRight: 8 }}>热门标签</Text>
          {tagCounts.map(([tag, count]) => {
            const c = getTagColor(tag);
            return (
              <Tag
                key={tag}
                style={{
                  fontSize: 11, marginBottom: 4,
                  borderColor: c.border, background: c.bg, color: c.text,
                }}
              >
                #{tag} <span style={{ color: '#bbb', marginLeft: 2 }}>{count}</span>
              </Tag>
            );
          })}
        </div>
      )}
    </Card>
  );
};

export default StatsPanel;
