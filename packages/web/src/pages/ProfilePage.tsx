import React, { useEffect, useRef, useState } from 'react';
import {
  Card, Typography, Tabs, Empty, Spin, Tag, Space, Avatar, Statistic, Row, Col,
  Button, Input, message, Modal,
} from 'antd';
import {
  UserOutlined, FileTextOutlined, StarOutlined, EditOutlined, LockOutlined, CameraOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useAuthStore } from '../stores/authStore';
import { useFavoritesStore } from '../stores/favoritesStore';
import api from '../api/client';
import ReviewDetailDrawer from '../components/ReviewDetailDrawer';
import ReviewCard from '../components/Review/ReviewCard';

const { Title, Text } = Typography;

const ProfilePage: React.FC = () => {
  const { user, setUser } = useAuthStore();
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerReviewId, setDrawerReviewId] = useState<string | null>(null);

  // Favorites tab state
  const { hydrate } = useFavoritesStore();
  const [favorites, setFavorites] = useState<any[]>([]);
  const [favLoading, setFavLoading] = useState(false);

  // Profile edit state
  const [editName, setEditName] = useState(false);
  const [nameValue, setNameValue] = useState(user?.name || '');
  const [nameSaving, setNameSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  // Password modal state
  const [pwdOpen, setPwdOpen] = useState(false);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [newPwd2, setNewPwd2] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);

  useEffect(() => {
    api.get('/api/reviews').then(res => {
      setReviews(res.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const fetchFavorites = async () => {
    setFavLoading(true);
    try {
      const res = await api.get('/api/favorites');
      setFavorites(res.data);
    } catch { /* ignore */ }
    setFavLoading(false);
  };

  useEffect(() => {
    if (user?.name) setNameValue(user.name);
  }, [user?.name]);

  const myReviews = reviews.filter(r => r.authorId === user?.id);
  const myScoredReviews = reviews.filter(r =>
    r.scoringProgress?.scorers?.some((s: any) => s.userId === user?.id && s.hasScored)
  );

  const handleSaveName = async () => {
    const trimmed = nameValue.trim();
    if (!trimmed) {
      message.error('昵称不能为空');
      return;
    }
    if (trimmed === user?.name) {
      setEditName(false);
      return;
    }
    setNameSaving(true);
    try {
      const res = await api.put('/api/auth/profile', { name: trimmed });
      setUser(res.data);
      message.success('昵称已更新');
      setEditName(false);
    } catch (err: any) {
      message.error(err?.response?.data?.error || '保存失败');
    }
    setNameSaving(false);
  };

  const handlePickAvatar = () => fileRef.current?.click();

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      message.error('请选择图片文件');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      message.error('图片不能超过 2MB');
      return;
    }
    setAvatarUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result as string);
        fr.onerror = reject;
        fr.readAsDataURL(file);
      });
      const res = await api.put('/api/auth/profile', { avatarUrl: dataUrl });
      setUser(res.data);
      message.success('头像已更新');
    } catch (err: any) {
      message.error(err?.response?.data?.error || '上传失败');
    }
    setAvatarUploading(false);
  };

  const handleChangePassword = async () => {
    if (!oldPwd || !newPwd) {
      message.error('请输入旧密码和新密码');
      return;
    }
    if (newPwd.length < 6) {
      message.error('新密码至少 6 位');
      return;
    }
    if (newPwd !== newPwd2) {
      message.error('两次输入的新密码不一致');
      return;
    }
    setPwdSaving(true);
    try {
      await api.post('/api/auth/change-password', { oldPassword: oldPwd, newPassword: newPwd });
      message.success('密码修改成功');
      setOldPwd(''); setNewPwd(''); setNewPwd2('');
      setPwdOpen(false);
    } catch (err: any) {
      message.error(err?.response?.data?.error || '修改失败');
    }
    setPwdSaving(false);
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <Card style={{ marginBottom: 16 }}>
        <Space size="large" align="start">
          {/* Avatar with hover-to-edit */}
          <div
            onClick={handlePickAvatar}
            style={{ position: 'relative', cursor: 'pointer', width: 72, height: 72 }}
            title="点击更换头像"
          >
            <Avatar
              size={72}
              icon={<UserOutlined />}
              style={{ backgroundColor: '#FF6A00' }}
              src={user?.avatarUrl || undefined}
            />
            <div style={{
              position: 'absolute', bottom: 0, right: 0,
              width: 22, height: 22, borderRadius: '50%',
              background: '#fff', border: '1px solid #f0f0f0',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            }}>
              {avatarUploading
                ? <Spin size="small" />
                : <CameraOutlined style={{ color: '#FF6A00', fontSize: 12 }} />}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleAvatarChange}
            />
          </div>

          {/* Name + role */}
          <div style={{ flex: 1 }}>
            {editName ? (
              <Space>
                <Input
                  value={nameValue}
                  onChange={e => setNameValue(e.target.value)}
                  onPressEnter={handleSaveName}
                  maxLength={20}
                  style={{ width: 160 }}
                  autoFocus
                />
                <Button size="small" type="primary" loading={nameSaving} onClick={handleSaveName}>
                  保存
                </Button>
                <Button size="small" onClick={() => { setEditName(false); setNameValue(user?.name || ''); }}>
                  取消
                </Button>
              </Space>
            ) : (
              <Space size={6}>
                <Title level={4} style={{ margin: 0 }}>{user?.name}</Title>
                <Button
                  type="text"
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => setEditName(true)}
                  style={{ color: '#999' }}
                />
              </Space>
            )}
            <div style={{ marginTop: 6 }}>
              <Tag color={user?.role === 'supervisor' ? 'orange' : 'blue'}>
                {user?.role === 'supervisor' ? '主管' : '成员'}
              </Tag>
              <Button
                type="link"
                size="small"
                icon={<LockOutlined />}
                onClick={() => setPwdOpen(true)}
                style={{ color: '#999', fontSize: 12, padding: '0 4px' }}
              >
                修改密码
              </Button>
            </div>
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
        <Tabs
          items={[
            {
              key: 'my-reviews',
              label: '我的短评',
              children: loading ? <Spin /> : myReviews.length === 0 ? <Empty description="暂无短评" /> : (
                myReviews.map(r => (
                  <Card key={r.id} size="small" hoverable style={{ marginBottom: 8 }}
                    onClick={() => setDrawerReviewId(r.id)}>
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
                    onClick={() => setDrawerReviewId(r.id)}>
                    <Space>
                      <Text strong>{r.company}</Text>
                      <Text type="secondary">{r.author?.name}</Text>
                      <Text type="secondary">{dayjs(r.createdAt).format('MM/DD')}</Text>
                    </Space>
                  </Card>
                ))
              ),
            },
            {
              key: 'favorites',
              label: <span><StarOutlined style={{ marginRight: 4 }} />我的收藏</span>,
              children: favLoading ? <Spin /> : favorites.length === 0 ? (
                <Empty description="还没有收藏任何短评，去短评池里收藏吧 ✨" />
              ) : (
                favorites.map((r, i) => (
                  <ReviewCard
                    key={r.id}
                    review={r}
                    onClick={() => setDrawerReviewId(r.id)}
                    tiltDeg={[-0.5, 0.4, -0.25][i % 3]}
                  />
                ))
              ),
            },
          ]}
          onChange={(key) => {
            if (key === 'favorites' && favorites.length === 0) {
              fetchFavorites();
              hydrate();
            }
          }}
        />
      </Card>

      {/* Change password modal */}
      <Modal
        open={pwdOpen}
        title="修改密码"
        onCancel={() => { setPwdOpen(false); setOldPwd(''); setNewPwd(''); setNewPwd2(''); }}
        onOk={handleChangePassword}
        okText="保存"
        cancelText="取消"
        confirmLoading={pwdSaving}
      >
        <Space direction="vertical" style={{ width: '100%', marginTop: 12 }} size={10}>
          <Input.Password
            placeholder="旧密码"
            value={oldPwd}
            onChange={e => setOldPwd(e.target.value)}
          />
          <Input.Password
            placeholder="新密码（至少 6 位）"
            value={newPwd}
            onChange={e => setNewPwd(e.target.value)}
          />
          <Input.Password
            placeholder="再次输入新密码"
            value={newPwd2}
            onChange={e => setNewPwd2(e.target.value)}
            onPressEnter={handleChangePassword}
          />
        </Space>
      </Modal>

      <ReviewDetailDrawer
        reviewId={drawerReviewId}
        open={!!drawerReviewId}
        onClose={() => setDrawerReviewId(null)}
      />
    </div>
  );
};

export default ProfilePage;
