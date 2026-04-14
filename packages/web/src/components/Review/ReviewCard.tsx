import React from 'react';
import { Card, Tag, Typography, Space, Badge, Avatar, Tooltip } from 'antd';
import {
  FireOutlined, SendOutlined, CheckCircleOutlined, ToolOutlined,
  UserOutlined, StarOutlined, StarFilled,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { getTagColor } from '@ai-review/shared';
import { useFavoritesStore } from '../../stores/favoritesStore';

const { Text, Paragraph } = Typography;

export const MiniScoreAvatars: React.FC<{ scorers: any[] }> = ({ scorers }) => (
  <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
    {scorers.map((s: any) => (
      <Tooltip key={s.userId} title={`${s.name}${s.hasScored ? ' (已评)' : ''}`}>
        <Avatar
          size={22}
          icon={<UserOutlined />}
          src={s.avatarUrl}
          style={s.hasScored
            ? { backgroundColor: '#FF6A00', fontSize: 10 }
            : { filter: 'grayscale(1)', opacity: 0.3, fontSize: 10 }
          }
        >
          {s.name?.[0]}
        </Avatar>
      </Tooltip>
    ))}
  </div>
);

/** Strip HTML tags and extract plain text from a rich-text body. */
export function plainTextFromHtml(html: string): string {
  if (!html) return '';
  if (typeof document === 'undefined') return html.replace(/<[^>]*>/g, '');
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return (tmp.textContent || '').trim();
}

interface ReviewCardProps {
  review: any;
  onClick: () => void;
  /** inline tilt angle (deg) — replaces nth-child CSS for virtualizer compat */
  tiltDeg?: number;
}

const ReviewCard: React.FC<ReviewCardProps> = ({ review, onClick, tiltDeg }) => {
  const progress = review.scoringProgress;
  const sections: any[] = review.sections || [];
  const hasBody = !!review.body;
  const bodyPreview = hasBody ? plainTextFromHtml(review.body) : '';

  const { isFavorited, toggle } = useFavoritesStore();
  const favorited = isFavorited(review.id);

  const tiltStyle = tiltDeg !== undefined
    ? { transform: `rotate(${tiltDeg}deg)` }
    : undefined;

  return (
    <Card
      hoverable
      onClick={onClick}
      className="paper-card"
      style={{
        marginBottom: 16,
        borderLeft: '4px solid #FF6900',
        background: '#FDFCF8',
        ...tiltStyle,
      }}
      styles={{ body: { padding: '16px 20px' } }}
    >
      {/* Row 1: title + status badge + heat score */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div style={{ flex: 1, marginRight: 16 }}>
          <Space size={8} wrap>
            <Text strong style={{ fontSize: 15, lineHeight: 1.4 }}>{review.company}</Text>
            {review.distributed && <Tag color="green" icon={<SendOutlined />} style={{ margin: 0 }}>已分发</Tag>}
            {review.status === 'completed' && !review.distributed && (
              <Tag color="orange" icon={<CheckCircleOutlined />} style={{ margin: 0 }}>待审阅</Tag>
            )}
            {review.hasUnresolvedRevision && (
              <Badge dot color="red" offset={[0, 0]}>
                <Tag icon={<ToolOutlined />} color="error" style={{ margin: 0 }}>修改建议</Tag>
              </Badge>
            )}
          </Space>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {review.status === 'completed' && review.heatScore !== null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <FireOutlined style={{ color: '#FF6A00', fontSize: 14 }} />
              <Text style={{ color: '#FF6A00', fontSize: 20, fontWeight: 700, lineHeight: 1 }}>
                {review.heatScore.toFixed(2)}
              </Text>
            </div>
          )}
          {/* Bookmark button */}
          <Tooltip title={favorited ? '取消收藏' : '收藏'}>
            <span
              onClick={(e) => { e.stopPropagation(); toggle(review.id); }}
              style={{
                cursor: 'pointer',
                color: favorited ? '#FF6900' : '#bbb',
                fontSize: 17,
                lineHeight: 1,
                transition: 'color 0.2s',
              }}
            >
              {favorited ? <StarFilled /> : <StarOutlined />}
            </span>
          </Tooltip>
        </div>
      </div>

      {/* Row 2: event description */}
      <Paragraph
        ellipsis={{ rows: 2 }}
        style={{ color: '#888', fontSize: 13, marginBottom: 10, lineHeight: 1.6 }}
      >
        {hasBody ? bodyPreview : review.description}
      </Paragraph>

      {/* Row 3: section titles as viewpoint pills (legacy reviews only) */}
      {!hasBody && sections.length > 0 && (
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

      {/* Row 4: tags + author + avatars */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f5f5f5', paddingTop: 10 }}>
        <Space size={4} wrap>
          {(review.tags as string[])?.map((tag: string) => {
            const c = getTagColor(tag);
            return (
              <Tag key={tag} style={{ borderColor: c.border, background: c.bg, color: c.text, fontSize: 11, margin: 0 }}>
                #{tag}
              </Tag>
            );
          })}
        </Space>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, marginLeft: 12 }}>
          <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
            {review.author?.name} · {dayjs(review.createdAt).format('MM/DD HH:mm')}
          </Text>
          <MiniScoreAvatars scorers={progress.scorers} />
        </div>
      </div>
    </Card>
  );
};

export default ReviewCard;
