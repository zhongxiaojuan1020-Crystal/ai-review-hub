import React, { useEffect, useState } from 'react';
import { Modal, Card, Typography, Tag, Space, Divider, Spin, Button } from 'antd';
import { SendOutlined, UserOutlined, LikeOutlined, MessageOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { ContentRenderer } from '../ContentRenderer';
import HtmlRenderer from '../HtmlRenderer';
import { getTagColor } from '@ai-review/shared';
import api from '../../api/client';

const { Title, Text } = Typography;

interface Props {
  reviewId: string;
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  loading?: boolean;
}

const DistributePreview: React.FC<Props> = ({ reviewId, open, onCancel, onConfirm, loading }) => {
  const [review, setReview] = useState<any>(null);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (open && reviewId) {
      setFetching(true);
      api.get(`/api/reviews/${reviewId}`).then(res => {
        setReview(res.data);
        setFetching(false);
      }).catch(() => setFetching(false));
    }
  }, [open, reviewId]);

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      title="分发预览"
      width={640}
      footer={[
        <Button key="cancel" onClick={onCancel}>取消</Button>,
        <Button key="send" type="primary" icon={<SendOutlined />} loading={loading} onClick={onConfirm}>
          确认分发
        </Button>,
      ]}
    >
      {fetching || !review ? <Spin style={{ display: 'block', margin: '40px auto' }} /> : (
        <Card
          style={{
            border: '1px solid #FFD591',
            borderRadius: 12,
            background: 'linear-gradient(135deg, #FFFAF0 0%, #FFF7E6 100%)',
          }}
          bodyStyle={{ padding: '20px 24px' }}
        >
          {/* Header */}
          <div>
            <Title level={4} style={{ margin: 0, color: '#1a1a2e' }}>{review.company}</Title>
            <Space style={{ marginTop: 6 }}>
              <Text type="secondary" style={{ fontSize: 13 }}>
                <UserOutlined /> {review.author?.name}
              </Text>
              <Text type="secondary" style={{ fontSize: 13 }}>
                {dayjs(review.createdAt).format('YYYY-MM-DD')}
              </Text>
            </Space>
          </div>

          {/* Tags */}
          <div style={{ margin: '10px 0' }}>
            {(review.tags as string[])?.map((tag: string) => (
              <Tag key={tag} style={(() => { const c = getTagColor(tag); return { borderColor: c.border, background: c.bg, color: c.text }; })()}>
                #{tag}
              </Tag>
            ))}
          </div>

          <Divider style={{ margin: '12px 0' }} />

          {/* Body: HTML (old rich editor) or structured (description + sections) */}
          {review.body && !review.body.startsWith('{') ? (
            <HtmlRenderer html={review.body} style={{ fontSize: 14 }} />
          ) : (
            <>
              <ContentRenderer
                content={review.description}
                legacyImages={(() => { try { return review.body ? JSON.parse(review.body).descriptionImages : undefined; } catch { return undefined; } })()}
                style={{ fontSize: 14, color: '#333' }}
              />
              {(review.sections as any[])?.map((section: any, idx: number) => (
                <div key={idx} style={{ marginBottom: 12, padding: '10px 14px', background: '#fff', borderRadius: 8, borderLeft: '3px solid #FF6A00' }}>
                  <Text strong style={{ color: '#FF6A00', fontSize: 14 }}>{section.title}</Text>
                  <ContentRenderer
                    content={section.content}
                    legacyImages={section.images}
                    style={{ marginTop: 4, fontSize: 13, color: '#555' }}
                  />
                </div>
              ))}
            </>
          )}

          {/* Sources */}
          {review.sources?.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>参考来源：</Text>
              {(review.sources as string[]).map((src: string, i: number) => (
                <div key={i}><Text type="secondary" style={{ fontSize: 12 }}>{src}</Text></div>
              ))}
            </div>
          )}

          <Divider style={{ margin: '12px 0' }} dashed />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Space size={16}>
              <Space style={{ cursor: 'pointer', color: '#999', fontSize: 13 }}>
                <LikeOutlined /> <span>点赞</span>
              </Space>
              <Space style={{ cursor: 'pointer', color: '#999', fontSize: 13 }}>
                <MessageOutlined /> <span>评论</span>
              </Space>
            </Space>
            <Text type="secondary" style={{ fontSize: 11 }}>
              用户可在钉钉消息中互动
            </Text>
          </div>
        </Card>
      )}
    </Modal>
  );
};

export default DistributePreview;
