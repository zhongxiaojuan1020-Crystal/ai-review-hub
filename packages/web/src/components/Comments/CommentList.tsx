import React, { useState, useEffect } from 'react';
import { Card, List, Input, Button, Avatar, Typography, Space, message } from 'antd';
import { UserOutlined, SendOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../../api/client';

const { TextArea } = Input;
const { Text } = Typography;

interface Props {
  reviewId: string;
  guestToken?: string;
}

const CommentList: React.FC<Props> = ({ reviewId, guestToken }) => {
  const [comments, setComments] = useState<any[]>([]);
  const [content, setContent] = useState('');
  const [guestName, setGuestName] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchComments = async () => {
    try {
      if (guestToken) {
        const res = await api.get(`/api/guest/${guestToken}`);
        setComments(res.data.comments || []);
      } else {
        const res = await api.get(`/api/reviews/${reviewId}/comments`);
        setComments(res.data);
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

  return (
    <Card title={`评论 (${comments.filter(c => !c.isLike).length})`} size="small">
      <List
        dataSource={comments.filter(c => !c.isLike)}
        locale={{ emptyText: '暂无评论' }}
        renderItem={(item: any) => (
          <List.Item>
            <List.Item.Meta
              avatar={<Avatar icon={<UserOutlined />} style={{ backgroundColor: item.authorId ? '#FF6A00' : '#bbb' }} />}
              title={
                <Space>
                  <Text strong>{item.authorName || item.guestName || '成员'}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {dayjs(item.createdAt).format('MM-DD HH:mm')}
                  </Text>
                </Space>
              }
              description={item.content}
            />
          </List.Item>
        )}
      />
      <div style={{ marginTop: 16 }}>
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
            placeholder="写下你的评论..."
            value={content}
            onChange={e => setContent(e.target.value)}
            autoSize={{ minRows: 1, maxRows: 4 }}
            onPressEnter={(e) => { if (e.ctrlKey) handleSubmit(); }}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            loading={loading}
            onClick={handleSubmit}
          />
        </Space.Compact>
        <Text type="secondary" style={{ fontSize: 12 }}>Ctrl+Enter 发送</Text>
      </div>
    </Card>
  );
};

export default CommentList;
