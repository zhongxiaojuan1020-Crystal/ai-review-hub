import React from 'react';
import { Card, Tag, Typography, Space, Badge, Avatar, Tooltip } from 'antd';
import {
  FireOutlined, SendOutlined, CheckCircleOutlined, ToolOutlined,
  UserOutlined, StarOutlined, StarFilled,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { getTagColor } from '@ai-review/shared';
import { useFavoritesStore } from '../../stores/favoritesStore';
import { extractSectionTitles, hasNewBody } from '../../utils/reviewBody';

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

/** Strip HTML tags and extract plain text from a rich-text body.
 *
 * Handles three input shapes robustly:
 *   1. Normal HTML: `<p><strong>x</strong></p>` → `x`
 *   2. Double-encoded HTML: `&lt;p&gt;&lt;strong&gt;x&lt;/strong&gt;&lt;/p&gt;`
 *      — innerHTML decodes one layer to literal `<p>...`, which we then
 *      strip via regex. This previously leaked raw tags onto the card.
 *   3. Plain text: returned as-is.
 */
export function plainTextFromHtml(html: string): string {
  if (!html) return '';
  let s = html;
  if (typeof document !== 'undefined') {
    const tmp = document.createElement('div');
    tmp.innerHTML = s;
    s = tmp.textContent || '';
  }
  // Second pass: strip any literal tag-looking text that survived entity
  // decoding (double-encoded inputs), or any that we never parsed in SSR.
  s = s.replace(/<\/?[a-zA-Z][^>]*>/g, '');
  return s.trim();
}

interface ReviewCardProps {
  review: any;
  onClick: () => void;
  /** inline tilt angle (deg) — replaces nth-child CSS for virtualizer compat */
  tiltDeg?: number;
  /** optional node rendered in Row 4 before the author+avatars (e.g. supervisor actions) */
  actionSlot?: React.ReactNode;
}

const ReviewCard: React.FC<ReviewCardProps> = ({ review, onClick, tiltDeg, actionSlot }) => {
  const progress = review.scoringProgress;
  const legacySections: any[] = review.sections || [];
  // body can be HTML (new unified editor) or JSON metadata (legacy) or null.
  const newBody = hasNewBody(review);
  // For new-format reviews, extract inline <h3 class="section-title"> as the
  // numbered circle list, and use the rest of the body (minus those headings)
  // as the paragraph preview.
  const bodyTitles = newBody ? extractSectionTitles(review.body) : [];
  const bodyPreview = newBody
    ? plainTextFromHtml(
        String(review.body).replace(
          /<h3[^>]*class=['"][^'"]*section-title[^'"]*['"][^>]*>[\s\S]*?<\/h3>/gi,
          ''
        )
      )
    : '';

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

      {/* Row 2: body / description preview (plain text, first couple lines) */}
      <Paragraph
        ellipsis={{ rows: 2 }}
        style={{ color: '#888', fontSize: 13, marginBottom: 10, lineHeight: 1.6 }}
      >
        {newBody ? bodyPreview : plainTextFromHtml(review.description || '')}
      </Paragraph>

      {/* Row 3: numbered subtitle list — works for both new body (h3 titles)
          and legacy sections[]. */}
      {(newBody ? bodyTitles : legacySections.map((s: any) => plainTextFromHtml(s.title))).filter(Boolean).length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}>
          {(newBody
            ? bodyTitles
            : legacySections.map((s: any) => plainTextFromHtml(s.title || ''))
          )
            .filter(Boolean)
            .map((t: string, i: number) => (
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
                  {t}
                </Text>
              </div>
            ))}
        </div>
      )}

      {/* Row 4: tags | [actionSlot] author · date · avatars */}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, marginLeft: 12 }}>
          {actionSlot && (
            <span onClick={e => e.stopPropagation()}>
              {actionSlot}
            </span>
          )}
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
