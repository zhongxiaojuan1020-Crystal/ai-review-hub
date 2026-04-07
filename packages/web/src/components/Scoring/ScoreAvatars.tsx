import React, { useState } from 'react';
import { Avatar, Popover, Tooltip, Descriptions, Spin } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import api from '../../api/client';
import { SCORE_DIMENSIONS } from '@ai-review/shared';

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
    <div style={{ minWidth: 200 }}>
      <Descriptions column={1} size="small" bordered>
        {SCORE_DIMENSIONS.map(dim => (
          <Descriptions.Item key={dim.key} label={dim.label}>
            <span style={{ color: '#FF6A00', fontWeight: 600 }}>{data[dim.key]}</span> / 5
          </Descriptions.Item>
        ))}
      </Descriptions>
      <div style={{ marginTop: 8, textAlign: 'right', fontWeight: 600, color: '#FF6A00' }}>
        总分: {data.totalScore} / 25
      </div>
    </div>
  ) : null;

  return (
    <Popover
      title={`${scorer.name} 的评分`}
      content={content}
      trigger="click"
      onOpenChange={(open) => { if (open) fetchBreakdown(); }}
    >
      <Tooltip title={`${scorer.name} — 总分: ${scorer.totalScore}`}>
        <Avatar
          style={{
            backgroundColor: '#FF6A00',
            cursor: 'pointer',
            border: '2px solid #FF6A00',
          }}
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

const ScoreAvatars: React.FC<Props> = ({ reviewId, scorers }) => {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {scorers.map(scorer => (
        scorer.hasScored ? (
          <ScoreBreakdownPopover key={scorer.userId} reviewId={reviewId} scorer={scorer} />
        ) : (
          <Tooltip key={scorer.userId} title={`${scorer.name} — 未评分`}>
            <Avatar
              style={{
                filter: 'grayscale(1)',
                opacity: 0.4,
                border: '2px solid #d9d9d9',
              }}
              icon={<UserOutlined />}
              src={scorer.avatarUrl}
              size={36}
            >
              {scorer.name?.[0]}
            </Avatar>
          </Tooltip>
        )
      ))}
    </div>
  );
};

export default ScoreAvatars;
