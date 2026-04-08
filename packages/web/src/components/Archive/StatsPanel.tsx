import React, { useMemo, useState } from 'react';
import { Radio, Typography, DatePicker } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { DOMAIN_COLOR, reviewDomainFromTags } from '@ai-review/shared';

const { Text } = Typography;
const { RangePicker } = DatePicker;

const reviewDomain = (tags: string[]): string => reviewDomainFromTags(tags || []);

type PeriodMode = 'week' | 'month' | 'custom';

function getWeekRange(): [Dayjs, Dayjs] {
  const today = dayjs();
  const dow = today.day();
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

/**
 * Minimal stats panel: period selector + domain-percentage bar.
 *
 * Intentionally sparse — no individual author leaderboards / average-heat
 * headline numbers (avoid internal competition), no key-metric tiles.
 * Just "how are the reviews distributed across domains?"
 */
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

  // Domain distribution (count + percentage)
  const domainBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    periodReviews.forEach(r => {
      const d = reviewDomain(r.tags);
      map.set(d, (map.get(d) || 0) + 1);
    });
    const total = periodReviews.length;
    return Array.from(map.entries())
      .map(([domain, count]) => ({
        domain,
        count,
        percent: total > 0 ? (count / total) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }, [periodReviews]);

  const total = periodReviews.length;

  return (
    <div
      style={{
        marginBottom: 12,
        padding: '10px 14px',
        background: '#FFFAF0',
        border: '1px solid #FFE7BA',
        borderRadius: 8,
      }}
    >
      {/* Header row: title + period selector */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: mode === 'custom' ? 8 : 10 }}>
        <Text style={{ fontSize: 12, color: '#888' }}>
          领域分布 · <Text style={{ color: '#FF6A00', fontWeight: 600 }}>{total}</Text> 篇
        </Text>
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

      {/* Custom date range */}
      {mode === 'custom' && (
        <div style={{ marginBottom: 10 }}>
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
            allowClear
          />
        </div>
      )}

      {/* Single stacked percentage bar */}
      {total === 0 ? (
        <Text type="secondary" style={{ fontSize: 12 }}>暂无数据</Text>
      ) : (
        <>
          <div
            style={{
              display: 'flex',
              height: 8,
              borderRadius: 4,
              overflow: 'hidden',
              background: '#f0f0f0',
              marginBottom: 6,
            }}
          >
            {domainBreakdown.map(({ domain, percent }) => (
              <div
                key={domain}
                style={{
                  width: `${percent}%`,
                  background: DOMAIN_COLOR[domain] || '#ccc',
                  transition: 'width 0.4s ease',
                }}
                title={`${domain} ${percent.toFixed(0)}%`}
              />
            ))}
          </div>
          {/* Legend row */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
            {domainBreakdown.map(({ domain, percent }) => (
              <div key={domain} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    background: DOMAIN_COLOR[domain] || '#ccc',
                    flexShrink: 0,
                  }}
                />
                <Text style={{ fontSize: 11, color: DOMAIN_COLOR[domain] || '#888' }}>
                  {domain}
                </Text>
                <Text style={{ fontSize: 11, color: '#999' }}>
                  {percent.toFixed(0)}%
                </Text>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default StatsPanel;
