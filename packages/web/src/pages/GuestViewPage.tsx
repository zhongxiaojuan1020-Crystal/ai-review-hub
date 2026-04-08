import React, { useEffect, useState } from 'react';
import { Tag, Typography, Space, Divider, Spin, Input, Button, Avatar, message } from 'antd';
import { LikeOutlined, LikeFilled, MessageOutlined, UserOutlined, FireOutlined } from '@ant-design/icons';
import { useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { ContentRenderer } from '../components/ContentRenderer';
import HtmlRenderer from '../components/HtmlRenderer';
import { getTagColor } from '@ai-review/shared';
import api from '../api/client';

const { Title, Text } = Typography;
const { TextArea } = Input;

const GuestViewPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [guestName, setGuestName] = useState('');
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showCommentBox, setShowCommentBox] = useState(false);
  const [localComments, setLocalComments] = useState<any[]>([]);

  useEffect(() => {
    if (!token) return;
    api.get(`/api/guest/${token}`)
      .then(res => {
        setData(res.data);
        setLikeCount(res.data.likeCount || 0);
        setLocalComments(res.data.comments?.filter((c: any) => !c.isLike) || []);
        setLoading(false);
      })
      .catch(err => {
        setError(err.response?.data?.error || '链接已失效或不存在');
        setLoading(false);
      });
  }, [token]);

  const handleLike = async () => {
    if (liked) return;
    try {
      await api.post(`/api/guest/${token}/like`, { guestName: guestName || '读者' });
      setLiked(true);
      setLikeCount(c => c + 1);
    } catch {
      message.error('点赞失败');
    }
  };

  const handleComment = async () => {
    if (!commentText.trim()) return;
    setSubmitting(true);
    try {
      await api.post(`/api/guest/${token}/comments`, {
        content: commentText,
        guestName: guestName || '读者',
      });
      setLocalComments(prev => [...prev, {
        id: Date.now().toString(),
        content: commentText,
        authorName: guestName || '读者',
        createdAt: new Date().toISOString(),
      }]);
      setCommentText('');
      setShowCommentBox(false);
      message.success('评论已发布');
    } catch {
      message.error('评论失败');
    }
    setSubmitting(false);
  };

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <Spin size="large" />
    </div>
  );

  if (error || !data) return (
    <div style={{ textAlign: 'center', padding: 80 }}>
      <Text type="secondary" style={{ fontSize: 16 }}>{error || '页面不存在'}</Text>
    </div>
  );

  const { review } = data;

  return (
    <div style={{ background: '#f7f7f7', minHeight: '100vh' }}>
      {/* Top bar */}
      <div style={{
        background: '#fff',
        borderBottom: '1px solid #eee',
        padding: '12px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        <FireOutlined style={{ color: '#FF6A00', fontSize: 18 }} />
        <Text strong style={{ color: '#FF6A00', fontSize: 15 }}>AI短评</Text>
      </div>

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '16px 16px 100px' }}>
        {/* Main article card */}
        <div style={{
          background: '#fff',
          borderRadius: 12,
          padding: '20px 20px 16px',
          marginBottom: 12,
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        }}>
          {/* Title */}
          <Title level={4} style={{ margin: '0 0 10px', lineHeight: 1.4, color: '#1a1a2e' }}>
            {review.company}
          </Title>

          {/* Meta */}
          <Space size={10} wrap style={{ marginBottom: 12 }}>
            <Text type="secondary" style={{ fontSize: 13 }}>
              <UserOutlined style={{ marginRight: 4 }} />{review.author?.name}
            </Text>
            <Text type="secondary" style={{ fontSize: 13 }}>
              {dayjs(review.createdAt).format('YYYY-MM-DD')}
            </Text>
            {review.heatScore != null && (
              <Space size={3}>
                <FireOutlined style={{ color: '#FF6A00', fontSize: 12 }} />
                <Text style={{ color: '#FF6A00', fontWeight: 700, fontSize: 13 }}>
                  热度 {review.heatScore.toFixed(2)}
                </Text>
              </Space>
            )}
          </Space>

          {/* Tags */}
          <div style={{ marginBottom: 14 }}>
            {(review.tags as string[])?.map((tag: string) => (
              <Tag key={tag} style={(() => { const c = getTagColor(tag); return { borderColor: c.border, background: c.bg, color: c.text, marginBottom: 4 }; })()}>
                #{tag}
              </Tag>
            ))}
          </div>

          <Divider style={{ margin: '12px 0' }} />

          {/* Body (new rich-text) or legacy description + sections */}
          {review.body ? (
            <HtmlRenderer html={review.body} style={{ marginBottom: 16 }} />
          ) : (
            <>
              <ContentRenderer
                content={review.description}
                style={{ fontSize: 15, color: '#333', marginBottom: 16, lineHeight: 1.8 }}
              />
              {(review.sections as any[])?.map((section: any, idx: number) => (
                <div
                  key={idx}
                  style={{
                    marginBottom: 12,
                    padding: '12px 14px',
                    background: '#FFFAF0',
                    borderRadius: 8,
                    borderLeft: '3px solid #FF6A00',
                  }}
                >
                  <Text strong style={{ color: '#FF6A00', fontSize: 14, display: 'block', marginBottom: 6 }}>
                    {section.title}
                  </Text>
                  <ContentRenderer
                    content={section.content}
                    legacyImages={section.images}
                    style={{ fontSize: 14, color: '#555' }}
                  />
                </div>
              ))}
            </>
          )}

          {/* Sources */}
          {review.sources?.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>参考来源：</Text>
              {(review.sources as string[]).map((src: string, i: number) => (
                <div key={i}>
                  <a href={src} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#FF6A00' }}>
                    {src}
                  </a>
                </div>
              ))}
            </div>
          )}

          <Divider dashed style={{ margin: '14px 0 10px' }} />

          {/* Like + Comment actions */}
          <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
            <button
              onClick={handleLike}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'none', border: 'none', cursor: liked ? 'default' : 'pointer',
                color: liked ? '#FF6A00' : '#999', fontSize: 14, padding: 0,
              }}
            >
              {liked ? <LikeFilled style={{ fontSize: 18 }} /> : <LikeOutlined style={{ fontSize: 18 }} />}
              <span>{likeCount > 0 ? likeCount : '点赞'}</span>
            </button>
            <button
              onClick={() => setShowCommentBox(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#999', fontSize: 14, padding: 0,
              }}
            >
              <MessageOutlined style={{ fontSize: 18 }} />
              <span>{localComments.length > 0 ? localComments.length : '评论'}</span>
            </button>
          </div>
        </div>

        {/* Comment input box */}
        {showCommentBox && (
          <div style={{
            background: '#fff', borderRadius: 12, padding: 16,
            marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
          }}>
            <Input
              placeholder="你的名字（可选，默认显示'读者'）"
              value={guestName}
              onChange={e => setGuestName(e.target.value)}
              style={{ marginBottom: 8 }}
              size="small"
            />
            <TextArea
              placeholder="写下你的想法..."
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              rows={3}
              style={{ marginBottom: 8 }}
            />
            <Space>
              <Button
                type="primary"
                size="small"
                loading={submitting}
                onClick={handleComment}
                style={{ background: '#FF6A00', borderColor: '#FF6A00' }}
              >
                发布
              </Button>
              <Button size="small" onClick={() => setShowCommentBox(false)}>取消</Button>
            </Space>
          </div>
        )}

        {/* Comments */}
        {localComments.length > 0 && (
          <div style={{
            background: '#fff', borderRadius: 12, padding: '16px 16px 4px',
            marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
          }}>
            <Text strong style={{ fontSize: 14, color: '#333', display: 'block', marginBottom: 12 }}>
              评论 ({localComments.length})
            </Text>
            {localComments.map(c => (
              <div key={c.id} style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                <Avatar size={28} icon={<UserOutlined />} style={{ background: '#FFD591', fontSize: 12, flexShrink: 0 }} />
                <div>
                  <Space size={8}>
                    <Text strong style={{ fontSize: 13 }}>{c.authorName}</Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {dayjs(c.createdAt).format('MM/DD HH:mm')}
                    </Text>
                  </Space>
                  <div style={{ fontSize: 14, color: '#333', marginTop: 3, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                    {c.content}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Other distributed reviews */}
        {data.otherReviews?.length > 0 && (
          <div style={{
            background: '#fff', borderRadius: 12, padding: 16,
            boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
          }}>
            <Text strong style={{ fontSize: 13, color: '#888', display: 'block', marginBottom: 10 }}>
              更多短评
            </Text>
            {data.otherReviews.map((r: any) => (
              <div key={r.id} style={{
                padding: '8px 0',
                borderBottom: '1px solid #f5f5f5',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <Text style={{ fontSize: 13 }} ellipsis>{r.company}</Text>
                {r.heatScore != null && (
                  <Space size={2} style={{ flexShrink: 0, marginLeft: 8 }}>
                    <FireOutlined style={{ color: '#FF6A00', fontSize: 11 }} />
                    <Text style={{ color: '#FF6A00', fontSize: 12 }}>{r.heatScore.toFixed(1)}</Text>
                  </Space>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default GuestViewPage;
