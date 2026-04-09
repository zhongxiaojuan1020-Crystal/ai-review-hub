import React, { useState } from 'react';
import { Avatar, Popover, Tooltip, Spin } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import { NEW_SCORE_DIMENSIONS } from '@ai-review/shared';
import api from '../../api/client';

interface ScorerStatus {
  userId: string;
  name: string;
  avatarUrl: string | null;
  hasScored: boolean;
  totalScore: number | null;
}

interface Props {
  reviewId: string;
  scorers: ScorerStatus[];
}

const STAR_LABEL = ['—', '一般', '不错', '很好'];

const ScoreBreakdownPopover: React.FC<{ reviewId: string; scorer: ScorerStatus }> = ({ reviewId, scorer }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchBreakdown = async () => {
    if (data) return;
    setLoading(true);
    try {
      const res = await api.get(`/api/reviews/${reviewId}/scores/${scorer.userId}`);
      setData(res.data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  const content = loading ? <Spin size="small" /> : data ? (
    <div style={{ minWidth: 180 }}>
      {NEW_SCORE_DIMENSIONS.map(dim => {
        const val = Math.round(data[dim.key] ?? 0);
        return (
          <div key={dim.key} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ color: '#666', fontSize: 12 }}>{dim.label}</span>
            <span style={{ color: '#FF6A00', fontWeight: 600, fontSize: 12 }}>
              {'★'.repeat(val)}{'☆'.repeat(3 - val)} {STAR_LABEL[val] || '—'}
            </span>
          </div>
        );
      })}
      {data.needs_revision && (
        <div style={{ marginTop: 6, fontSize: 11, color: '#FF4D4F', borderTop: '1px dashed #ffd591', paddingTop: 6 }}>
          建议修改
        </div>
      )}
    </div>
  ) : null;

  const scoreDisplay = scorer.totalScore != null ? `${scorer.totalScore.toFixed(1)} / 5` : null;

  return (
    <Popover
      title={`${scorer.name} 的评分`}
      content={content}
      trigger="click"
      onOpenChange={(open) => { if (open) fetchBreakdown(); }}
    >
      <Tooltip title={scoreDisplay ? `${scorer.name} — ${scoreDisplay}` : scorer.name}>
        <Avatar
          style={{ backgroundColor: '#FF6A00', cursor: 'pointer', border: '2px solid #FF6A00' }}
          icon={<UserOutlined />}
          src={scorer.avatarUrl}
          size={36}
        >
          {scorer.name?.[0]}
        </Avatar>
      </Tooltip>
    </Popover>
  );
};

const ScoreAvatars: React.FC<Props> = ({ reviewId, scorers }) => (
  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
    {scorers.map(scorer =>
      scorer.hasScored ? (
        <ScoreBreakdownPopover key={scorer.userId} reviewId={reviewId} scorer={scorer} />
      ) : (
        <Tooltip key={scorer.userId} title={`${scorer.name} — 未评分`}>
          <Avatar
            style={{ filter: 'grayscale(1)', opacity: 0.4, border: '2px solid #d9d9d9' }}
            icon={<UserOutlined />}
            src={scorer.avatarUrl}
            size={36}
          >
            {scorer.name?.[0]}
          </Avatar>
        </Tooltip>
      )
    )}
  </div>
);

export default ScoreAvatars;
