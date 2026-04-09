import React, { useEffect, useMemo, useState } from 'react';
import { Tag, Typography, Space, Card, Empty, Spin, Button, Radio, DatePicker } from 'antd';
import { FireOutlined, SendOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { useAuthStore } from '../stores/authStore';
import DistributePreview from '../components/Distribution/DistributePreview';
import ReviewDetailDrawer from '../components/ReviewDetailDrawer';
import { getTagColor } from '@ai-review/shared';
import api from '../api/client';

const { Text, Title, Paragraph } = Typography;
const { RangePicker } = DatePicker;

const MEDALS = ['🥇', '🥈', '🥉'];

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

const RankingPage: React.FC = () => {
  const [allRanking, setAllRanking] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<PeriodMode>('month');
  const [customRange, setCustomRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [selectedReviewId, setSelectedReviewId] = useState<string>('');
  const [distributing, setDistributing] = useState(false);
  const [drawerReviewId, setDrawerReviewId] = useState<string | null>(null);
  const { user } = useAuthStore();

  useEffect(() => {
    api.get('/api/ranking').then(res => {
      setAllRanking(res.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const dateRange = useMemo((): [Dayjs, Dayjs] | null => {
    if (mode === 'week') return getWeekRange();
    if (mode === 'month') return getMonthRange();
    return customRange;
  }, [mode, customRange]);

  const ranking = useMemo(() => {
    if (!dateRange) return allRanking;
    const [start, end] = dateRange;
    return allRanking.filter(r => {
      const t = dayjs(r.createdAt);
      return !t.isBefore(start) && !t.isAfter(end);
    });
  }, [allRanking, dateRange]);

  const periodLabel = dateRange
    ? `${dateRange[0].format('MM/DD')} – ${dateRange[1].format('MM/DD')}`
    : '全部';

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FireOutlined style={{ fontSize: 22, color: '#FF6A00' }} />
            <Title level={4} style={{ margin: 0 }}>最热短评榜</Title>
            <Text type="secondary" style={{ marginLeft: 4, fontSize: 13 }}>{periodLabel}</Text>
          </div>
          <Space wrap size={8}>
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
            {mode === 'custom' && (
              <RangePicker
                size="small"
                value={customRange}
                onChange={val => {
                  if (val && val[0] && val[1]) {
                    setCustomRange([val[0].startOf('day'), val[1].endOf('day')]);
                  } else {
                    setCustomRange(null);
                  }
                }}
                placeholder={['开始', '结束']}
                allowClear
                style={{ width: 220 }}
              />
            )}
          </Space>
        </div>
      </Card>

      {loading ? <Spin style={{ display: 'block', marginTop: 60, textAlign: 'center' }} /> :
        ranking.length === 0 ? (
          <Empty description={mode === 'custom' && !customRange ? '请选择日期范围' : '该时间段内暂无已完成评分的短评'} />
        ) :
        ranking.map((record, index) => {
          const sections: any[] = record.sections || [];
          const medal = index < 3 ? MEDALS[index] : null;

          return (
            <Card
              key={record.id}
              hoverable
              onClick={() => setDrawerReviewId(record.id)}
              style={{ marginBottom: 12, borderLeft: '4px solid #FF6A00', cursor: 'pointer' }}
              styles={{ body: { padding: '16px 20px' } }}
            >
              {/* Row 1: rank + title + heat score */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 6 }}>
                {/* Rank badge */}
                <div style={{ flexShrink: 0, width: 32, textAlign: 'center', paddingTop: 2 }}>
                  {medal
                    ? <span style={{ fontSize: 22 }}>{medal}</span>
                    : <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 24, height: 24, borderRadius: '50%',
                        background: '#f0f0f0', color: '#888', fontSize: 12, fontWeight: 700,
                      }}>{index + 1}</span>
                  }
                </div>

                {/* Title + status */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Space size={8} wrap>
                    <Text strong style={{ fontSize: 15 }}>{record.company}</Text>
                    {record.distributed
                      ? <Tag color="green" icon={<SendOutlined />} style={{ margin: 0 }}>已分发</Tag>
                      : <Tag color="orange" style={{ margin: 0 }}>待审阅</Tag>
                    }
                  </Space>
                </div>

                {/* Heat score */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  <FireOutlined style={{ color: '#FF6A00', fontSize: 14 }} />
                  <Text style={{ color: '#FF6A00', fontSize: 22, fontWeight: 700, lineHeight: 1 }}>
                    {record.heatScore?.toFixed(2) || '-'}
                  </Text>
                </div>
              </div>

              {/* Row 2: description */}
              <div style={{ paddingLeft: 44 }}>
                <Paragraph
                  ellipsis={{ rows: 1 }}
                  style={{ color: '#888', fontSize: 13, marginBottom: 10, lineHeight: 1.6 }}
                >
                  {record.description}
                </Paragraph>

                {/* Row 3: section titles */}
                {sections.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}>
                    {sections.map((sec: any, i: number) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <span style={{
                          flexShrink: 0, marginTop: 2,
                          width: 18, height: 18, borderRadius: '50%',
                          background: '#FF6A00', color: '#fff',
                          fontSize: 11, fontWeight: 700,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {i + 1}
                        </span>
                        <Text style={{ fontSize: 13, color: '#333', lineHeight: 1.5 }} ellipsis>
                          {sec.title}
                        </Text>
                      </div>
                    ))}
                  </div>
                )}

                {/* Row 4: tags + author + distribute button */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f5f5f5', paddingTop: 10 }}>
                  <Space size={4} wrap>
                    {(record.tags as string[])?.map((tag: string) => (
                      <Tag key={tag} style={(() => { const c = getTagColor(tag); return { borderColor: c.border, background: c.bg, color: c.text, fontSize: 11, margin: 0 }; })()}>
                        #{tag}
                      </Tag>
                    ))}
                    <Text type="secondary" style={{ fontSize: 12, marginLeft: 4 }}>
                      {record.author?.name} · {dayjs(record.createdAt).format('MM/DD HH:mm')}
                    </Text>
                  </Space>

                  {user?.role === 'supervisor' && !record.distributed && (
                    <Button
                      type="primary"
                      size="small"
                      icon={<SendOutlined />}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedReviewId(record.id);
                        setPreviewOpen(true);
                      }}
                    >
                      分发
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          );
        })
      }

      <DistributePreview
        reviewId={selectedReviewId}
        open={previewOpen}
        onCancel={() => setPreviewOpen(false)}
        loading={distributing}
        onConfirm={async () => {
          setDistributing(true);
          try {
            await api.post('/api/distribute', { reviewId: selectedReviewId });
            setAllRanking(prev => prev.map(r => r.id === selectedReviewId ? { ...r, distributed: true } : r));
            setPreviewOpen(false);
          } catch { /* ignore */ }
          setDistributing(false);
        }}
      />

      <ReviewDetailDrawer
        reviewId={drawerReviewId}
        open={!!drawerReviewId}
        onClose={() => setDrawerReviewId(null)}
      />
    </div>
  );
};

export default RankingPage;
