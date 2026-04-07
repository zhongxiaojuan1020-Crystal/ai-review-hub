import React, { useEffect, useState } from 'react';
import { Card, Typography, Tabs, Empty, Spin, Tag, Space, Avatar, Statistic, Row, Col } from 'antd';
import { UserOutlined, FileTextOutlined, StarOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { useAuthStore } from '../stores/authStore';
import api from '../api/client';

const { Title, Text } = Typography;

const ProfilePage: React.FC = () => {
  const { user } = useAuthStore();
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/api/reviews').then(res => {
      setReviews(res.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const myReviews = reviews.filter(r => r.authorId === user?.id);
  const myScoredReviews = reviews.filter(r =>
    r.scoringProgress?.scorers?.some((s: any) => s.userId === user?.id && s.hasScored)
  );

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <Card style={{ marginBottom: 16 }}>
        <Space size="large">
          <Avatar size={64} icon={<UserOutlined />} style={{ backgroundColor: '#FF6A00' }} src={user?.avatarUrl} />
          <div>
            <Title level={4} style={{ margin: 0 }}>{user?.name}</Title>
            <Tag color={user?.role === 'supervisor' ? 'orange' : 'blue'}>
              {user?.role === 'supervisor' ? '主管' : '成员'}
            </Tag>
          </div>
        </Space>
        <Row gutter={24} style={{ marginTop: 24 }}>
          <Col span={8}>
            <Statistic title="我的短评" value={myReviews.length} prefix={<FileTextOutlined />} />
          </Col>
          <Col span={8}>
            <Statistic title="已评分" value={myScoredReviews.length} prefix={<StarOutlined />} />
          </Col>
          <Col span={8}>
            <Statistic
              title="待评分"
              value={reviews.filter(r => r.status === 'in_progress' && r.authorId !== user?.id &&
                r.scoringProgress?.scorers?.some((s: any) => s.userId === user?.id && !s.hasScored)
              ).length}
              valueStyle={{ color: '#FF6A00' }}
            />
          </Col>
        </Row>
      </Card>

      <Card>
        <Tabs items={[
          {
            key: 'my-reviews',
            label: '我的短评',
            children: loading ? <Spin /> : myReviews.length === 0 ? <Empty description="暂无短评" /> : (
              myReviews.map(r => (
                <Card key={r.id} size="small" hoverable style={{ marginBottom: 8 }}
                  onClick={() => navigate(`/reviews/${r.id}`)}>
                  <Space>
                    <Text strong>{r.company}</Text>
                    <Tag>{r.status === 'completed' ? '已完成' : '评分中'}</Tag>
                    <Text type="secondary">{dayjs(r.createdAt).format('MM/DD')}</Text>
                  </Space>
                </Card>
              ))
            ),
          },
          {
            key: 'my-scores',
            label: '我的评分记录',
            children: loading ? <Spin /> : myScoredReviews.length === 0 ? <Empty description="暂无评分" /> : (
              myScoredReviews.map(r => (
                <Card key={r.id} size="small" hoverable style={{ marginBottom: 8 }}
                  onClick={() => navigate(`/reviews/${r.id}`)}>
                  <Space>
                    <Text strong>{r.company}</Text>
                    <Text type="secondary">{r.author?.name}</Text>
                    <Text type="secondary">{dayjs(r.createdAt).format('MM/DD')}</Text>
                  </Space>
                </Card>
              ))
            ),
          },
        ]} />
      </Card>
    </div>
  );
};

export default ProfilePage;
