import React, { useState, useEffect } from 'react';
import { Card, List, Input, Button, Avatar, Typography, Space, message, Tag, Tooltip } from 'antd';
import { UserOutlined, SendOutlined, CheckOutlined, ToolOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useAuthStore } from '../../stores/authStore';
import api from '../../api/client';

const { TextArea } = Input;
const { Text } = Typography;

interface Props {
  reviewId: string;
  reviewAuthorId?: string;
  guestToken?: string;
  onRevisionResolved?: () => void;
}

const CommentList: React.FC<Props> = ({ reviewId, reviewAuthorId, guestToken, onRevisionResolved }) => {
  const [comments, setComments] = useState<any[]>([]);
  const [content, setContent] = useState('');
  const [guestName, setGuestName] = useState('');
  const [loading, setLoading] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const { user } = useAuthStore();

  const fetchComments = async () => {
    try {
      if (guestToken) {
        const res = await api.get(`/api/guest/${guestToken}`);
        setComments((res.data.comments || []).filter((c: any) => !c.isLike));
      } else {
        const res = await api.get(`/api/reviews/${reviewId}/comments`);
        setComments((res.data || []).filter((c: any) => !c.isLike));
      }
    } catch { /* ignore */ }
  };

  useEffect(() => { fetchComments(); }, [reviewId]);

  const handleSubmit = async () => {
    if (!content.trim()) return;
    setLoading(true);
    try {
      if (guestToken) {
        await api.post(`/api/guest/${guestToken}/comments`, {
          content: content.trim(),
          guestName: guestName.trim() || '游客',
        });
      } else {
        await api.post(`/api/reviews/${reviewId}/comments`, { content: content.trim() });
      }
      setContent('');
      message.success('评论已发布');
      fetchComments();
    } catch (err: any) {
      message.error(err.response?.data?.error || '发布失败');
    }
    setLoading(false);
  };

  const handleResolve = async (commentId: string) => {
    setResolvingId(commentId);
    try {
      await api.put(`/api/reviews/${reviewId}/comments/${commentId}/resolve`);
      message.success('已标记为已解决');
      fetchComments();
      onRevisionResolved?.();
    } catch (err: any) {
      message.error(err.response?.data?.error || '操作失败');
    }
    setResolvingId(null);
  };

  const isAuthor = !!(reviewAuthorId && user?.id === reviewAuthorId);
  const isSupervisor = user?.role === 'supervisor';

  const regularComments = comments.filter(c => !c.isRevisionRequest);
  const revisionComments = comments.filter(c => c.isRevisionRequest);
  const pendingRevisions = revisionComments.filter(c => !c.isResolved);

  return (
    <Card
      title={
        <Space size={8}>
          <span>评论</span>
          {regularComments.length > 0 && (
            <Text type="secondary" style={{ fontWeight: 400, fontSize: 12 }}>({regularComments.length})</Text>
          )}
          {pendingRevisions.length > 0 && (
            <Tag color="red" icon={<ToolOutlined />} style={{ margin: 0, fontWeight: 400 }}>
              {pendingRevisions.length} 条修改建议
            </Tag>
          )}
        </Space>
      }
      size="small"
    >
      {/* Revision request comments (shown first, highlighted) */}
      {revisionComments.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {revisionComments.map((item: any) => (
            <div
              key={item.id}
              style={{
                padding: '10px 12px',
                marginBottom: 8,
                borderRadius: 6,
                background: item.isResolved ? '#f9f9f9' : '#FFF7E6',
                border: `1px solid ${item.isResolved ? '#f0f0f0' : '#FFD591'}`,
                opacity: item.isResolved ? 0.7 : 1,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <Space size={6} align="start">
                  <Avatar
                    size={24}
                    icon={<UserOutlined />}
                    src={item.authorAvatar}
                    style={{ backgroundColor: '#FF6A00', fontSize: 10, flexShrink: 0 }}
                  />
                  <div>
                    <Space size={6}>
                      <Text strong style={{ fontSize: 13 }}>{item.authorName}</Text>
                      <Tag color="orange" style={{ fontSize: 11, padding: '0 5px', margin: 0, lineHeight: '18px' }}>修改建议</Tag>
                      {item.isResolved && <Tag color="success" style={{ fontSize: 11, padding: '0 5px', margin: 0, lineHeight: '18px' }}>已解决</Tag>}
                      <Text type="secondary" style={{ fontSize: 11 }}>{dayjs(item.createdAt).format('MM-DD HH:mm')}</Text>
                    </Space>
                    <div style={{ marginTop: 4, fontSize: 13, color: '#333', whiteSpace: 'pre-wrap' }}>
                      {/* Strip the [修改建议] prefix for display */}
                      {item.content.replace(/^\[修改建议\]\s*/, '')}
                    </div>
                  </div>
                </Space>
                {!item.isResolved && (isAuthor || isSupervisor) && (
                  <Tooltip title="标记为已解决">
                    <Button
                      size="small"
                      type="primary"
                      icon={<CheckOutlined />}
                      loading={resolvingId === item.id}
                      onClick={() => handleResolve(item.id)}
                      style={{ flexShrink: 0 }}
                    >
                      已解决
                    </Button>
                  </Tooltip>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Regular comments */}
      <List
        dataSource={regularComments}
        locale={{ emptyText: '暂无评论' }}
        renderItem={(item: any) => (
          <List.Item style={{ padding: '8px 0' }}>
            <List.Item.Meta
              avatar={
                <Avatar
                  icon={<UserOutlined />}
                  src={item.authorAvatar}
                  style={{ backgroundColor: item.authorId ? '#FF6A00' : '#bbb' }}
                />
              }
              title={
                <Space>
                  <Text strong>{item.authorName || item.guestName || '成员'}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {dayjs(item.createdAt).format('MM-DD HH:mm')}
                  </Text>
                </Space>
              }
              description={<span style={{ whiteSpace: 'pre-wrap' }}>{item.content}</span>}
            />
          </List.Item>
        )}
      />

      {/* Input */}
      <div style={{ marginTop: 12 }}>
        {guestToken && (
          <Input
            placeholder="你的名字"
            value={guestName}
            onChange={e => setGuestName(e.target.value)}
            style={{ marginBottom: 8 }}
          />
        )}
        <Space.Compact style={{ width: '100%' }}>
          <TextArea
            placeholder="写下你的评论… (Ctrl+Enter 发送)"
            value={content}
            onChange={e => setContent(e.target.value)}
            autoSize={{ minRows: 1, maxRows: 4 }}
            onKeyDown={e => { if (e.ctrlKey && e.key === 'Enter') handleSubmit(); }}
          />
          <Button type="primary" icon={<SendOutlined />} loading={loading} onClick={handleSubmit} />
        </Space.Compact>
      </div>
    </Card>
  );
};

export default CommentList;
