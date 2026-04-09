import React, { useState, useEffect } from 'react';
import { Card, Button, Typography, Space, message, Tag, Switch, Input } from 'antd';
import { CheckCircleOutlined, StarFilled, StarOutlined } from '@ant-design/icons';
import { NEW_SCORE_DIMENSIONS } from '@ai-review/shared';
import dayjs from 'dayjs';
import api from '../../api/client';

const { Text } = Typography;
const { TextArea } = Input;

const STAR_LABELS = ['', '一般', '不错', '很好'];

interface Props {
  reviewId: string;
  isAuthor: boolean;
  onScoreSubmitted?: () => void;
}

/** Inline 3-star row — hover shows label tooltip above each star */
const StarRow: React.FC<{ value: number; onChange: (v: number) => void }> = ({ value, onChange }) => {
  const [hovered, setHovered] = useState(0);
  const active = hovered || value;

  return (
    <Space size={10} align="center">
      {[1, 2, 3].map(n => (
        <div
          key={n}
          style={{ position: 'relative', display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}
          onMouseEnter={() => setHovered(n)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => onChange(value === n ? 0 : n)}
        >
          <span style={{ cursor: 'pointer', fontSize: 28, color: n <= active ? '#FF6A00' : '#d9d9d9', lineHeight: 1 }}>
            {n <= active ? <StarFilled /> : <StarOutlined />}
          </span>
          {hovered === n && (
            <span style={{
              position: 'absolute', bottom: '110%', left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(0,0,0,0.6)', color: '#fff', borderRadius: 4,
              padding: '2px 6px', fontSize: 11, whiteSpace: 'nowrap', pointerEvents: 'none',
            }}>
              {STAR_LABELS[n]}
            </span>
          )}
        </div>
      ))}
      {value > 0 && (
        <Text type="secondary" style={{ fontSize: 12, color: '#bfbfbf' }}>
          {STAR_LABELS[value]}
        </Text>
      )}
    </Space>
  );
};

const ScoringPanel: React.FC<Props> = ({ reviewId, isAuthor, onScoreSubmitted }) => {
  const [qualityScore, setQualityScore] = useState(0);
  const [importanceScore, setImportanceScore] = useState(0);
  const [needsRevision, setNeedsRevision] = useState(false);
  const [revisionNote, setRevisionNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasExisting, setHasExisting] = useState(false);
  const [scoredAt, setScoredAt] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthor) return;
    api.get(`/api/reviews/${reviewId}/my-score`).then(res => {
      if (res.data) {
        setQualityScore(res.data.quality_score ?? 0);
        setImportanceScore(res.data.importance_score ?? 0);
        setNeedsRevision(res.data.needs_revision ?? false);
        setRevisionNote(res.data.revision_note ?? '');
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

  const handleSubmit = async () => {
    if (qualityScore === 0 || importanceScore === 0) {
      message.warning('请完成两个维度的评分（至少 1 星）');
      return;
    }
    if (needsRevision && !revisionNote.trim()) {
      message.warning('请填写修改建议内容');
      return;
    }
    setLoading(true);
    try {
      await api.post(`/api/reviews/${reviewId}/scores`, {
        quality_score: qualityScore,
        importance_score: importanceScore,
        needs_revision: needsRevision,
        revision_note: revisionNote.trim(),
      });
      message.success(hasExisting ? '评分已更新' : '评分提交成功');
      setHasExisting(true);
      setScoredAt(new Date().toISOString());
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
        <Text type="secondary" style={{ fontSize: 11 }}>{dayjs(scoredAt).format('MM/DD HH:mm')}</Text>
      )}
    >
      <Space direction="vertical" style={{ width: '100%' }} size={16}>
        {NEW_SCORE_DIMENSIONS.map(dim => (
          <div key={dim.key}>
            {/* Label + stars on the same line */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 3 }}>
              <Text strong style={{ fontSize: 13, minWidth: 48 }}>{dim.label}</Text>
              <StarRow
                value={dim.key === 'quality_score' ? qualityScore : importanceScore}
                onChange={dim.key === 'quality_score' ? setQualityScore : setImportanceScore}
              />
            </div>
            <Text type="secondary" italic style={{ fontSize: 11, color: '#bfbfbf', lineHeight: 1.5, display: 'block', paddingLeft: 60 }}>
              {dim.description}
            </Text>
          </div>
        ))}

        {/* Revision request */}
        <div style={{ borderTop: '1px dashed #FFD591', paddingTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: needsRevision ? 10 : 0 }}>
            <Switch size="small" checked={needsRevision} onChange={setNeedsRevision}
              style={needsRevision ? { background: '#FF6A00' } : {}} />
            <Text style={{ fontSize: 13 }}>短评需要修改</Text>
          </div>
          {needsRevision && (
            <TextArea
              placeholder="请描述修改建议，会通知给作者..."
              value={revisionNote}
              onChange={e => setRevisionNote(e.target.value)}
              rows={3}
              style={{ borderColor: '#FFD591' }}
            />
          )}
        </div>

        <Button type="primary" block loading={loading} onClick={handleSubmit}>
          {hasExisting ? '更新评分' : '提交评分'}
        </Button>
      </Space>
    </Card>
  );
};

export default ScoringPanel;
