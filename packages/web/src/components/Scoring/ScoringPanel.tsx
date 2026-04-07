import React, { useState, useEffect } from 'react';
import { Card, Button, Typography, Space, message, Slider, InputNumber, Tooltip, Tag } from 'antd';
import { InfoCircleOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { SCORE_DIMENSIONS } from '@ai-review/shared';
import dayjs from 'dayjs';
import api from '../../api/client';

const { Text } = Typography;

interface Props {
  reviewId: string;
  isAuthor: boolean;
  onScoreSubmitted?: () => void;
}

const ScoringPanel: React.FC<Props> = ({ reviewId, isAuthor, onScoreSubmitted }) => {
  const [scores, setScores] = useState<Record<string, number>>({
    relevance: 0, necessity: 0, importance: 0, urgency: 0, logic: 0,
  });
  const [loading, setLoading] = useState(false);
  const [hasExisting, setHasExisting] = useState(false);
  const [scoredAt, setScoredAt] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthor) return;
    api.get(`/api/reviews/${reviewId}/my-score`).then(res => {
      if (res.data) {
        setScores(res.data);
        setHasExisting(true);
        setScoredAt(res.data.updatedAt || null);
      }
    }).catch(() => {});
  }, [reviewId, isAuthor]);

  if (isAuthor) {
    return (
      <Card size="small" style={{ background: '#FFF7E6', borderColor: '#FFD591' }}>
        <Text type="secondary">这是你发布的短评，无需打分</Text>
      </Card>
    );
  }

  const setScore = (key: string, val: number | null) => {
    const v = val ?? 0;
    const rounded = Math.round(v * 10) / 10;
    setScores(prev => ({ ...prev, [key]: rounded }));
  };

  const handleSubmit = async () => {
    for (const dim of SCORE_DIMENSIONS) {
      if (scores[dim.key] <= 0) {
        message.warning(`请完成「${dim.label}」的评分（需大于 0）`);
        return;
      }
    }
    setLoading(true);
    try {
      await api.post(`/api/reviews/${reviewId}/scores`, scores);
      const now = new Date().toISOString();
      message.success(hasExisting ? '评分已更新' : '评分提交成功');
      setHasExisting(true);
      setScoredAt(now);
      onScoreSubmitted?.();
    } catch (err: any) {
      message.error(err.response?.data?.error || '提交失败');
    }
    setLoading(false);
  };

  return (
    <Card
      title={
        <Space size={8}>
          <span>评分</span>
          {hasExisting && (
            <Tag icon={<CheckCircleOutlined />} color="success" style={{ margin: 0, fontWeight: 400 }}>
              已评分
            </Tag>
          )}
        </Space>
      }
      size="small"
      style={{ borderColor: '#FFD591' }}
      extra={hasExisting && scoredAt && (
        <Text type="secondary" style={{ fontSize: 11 }}>
          {dayjs(scoredAt).format('MM/DD HH:mm')} 已提交
        </Text>
      )}
    >
      <Space direction="vertical" style={{ width: '100%' }} size={20}>
        {SCORE_DIMENSIONS.map(dim => (
          <div key={dim.key}>
            {/* Label row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Space size={6}>
                <Text strong style={{ fontSize: 14 }}>{dim.label}</Text>
                <Tooltip title={dim.description}>
                  <InfoCircleOutlined style={{ color: '#bbb', fontSize: 13, cursor: 'pointer' }} />
                </Tooltip>
              </Space>
              <InputNumber
                min={0}
                max={5}
                step={0.1}
                precision={1}
                value={scores[dim.key]}
                onChange={(val) => setScore(dim.key, val)}
                style={{ width: 72 }}
                size="small"
                controls={false}
                addonAfter={<Text style={{ fontSize: 11, color: '#aaa' }}>/5</Text>}
              />
            </div>
            {/* Slider */}
            <Slider
              min={0}
              max={5}
              step={0.1}
              value={scores[dim.key]}
              onChange={(val) => setScore(dim.key, val)}
              tooltip={{ formatter: (v) => `${v?.toFixed(1)}` }}
              styles={{
                track: { background: '#FF6A00' },
                handle: { borderColor: '#FF6A00' },
              }}
            />
          </div>
        ))}

        <Button
          type="primary"
          block
          loading={loading}
          onClick={handleSubmit}
          style={{ marginTop: 4 }}
        >
          {hasExisting ? '更新评分' : '提交评分'}
        </Button>
      </Space>
    </Card>
  );
};

export default ScoringPanel;
