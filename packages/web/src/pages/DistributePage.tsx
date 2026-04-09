import React, { useEffect, useState } from 'react';
import { Card, Table, Tag, Button, Typography, Space, Tabs, message, Empty } from 'antd';
import { SendOutlined, HistoryOutlined, CheckCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../api/client';
import ReviewDetailDrawer from '../components/ReviewDetailDrawer';

const { Title, Text } = Typography;

const DistributePage: React.FC = () => {
  const [pending, setPending] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerReviewId, setDrawerReviewId] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [rankRes, histRes] = await Promise.all([
        api.get('/api/ranking'),
        api.get('/api/distribute/history'),
      ]);
      setPending(rankRes.data.filter((r: any) => !r.distributed));
      setHistory(histRes.data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleDistribute = async (reviewId: string) => {
    try {
      const res = await api.post('/api/distribute', { reviewId });
      const dt = res.data?.dingtalk;
      if (dt && !dt.ok) {
        const hint = dt.errcode === 310000
          ? '（提示：自定义关键词或加签密钥不匹配）'
          : dt.errcode === 300001
            ? '（提示：Webhook URL 无效）'
            : dt.reason === 'not_configured'
              ? '（请在系统设置中配置 Webhook）'
              : '';
        message.warning(`已标记为已分发，但钉钉推送失败：${dt.errmsg || dt.reason || '未知'} ${hint}`);
      } else {
        message.success('分发成功');
      }
      fetchData();
    } catch (err: any) {
      message.error(err.response?.data?.error || '分发失败');
    }
  };

  const columns = [
    {
      title: '短评', key: 'info',
      render: (r: any) => (
        <Text style={{ cursor: 'pointer', color: '#FF6A00' }} onClick={() => setDrawerReviewId(r.id)}>
          {r.company}
        </Text>
      ),
    },
    {
      title: '热度分', key: 'score', width: 100,
      render: (r: any) => <Text strong style={{ color: '#FF6A00' }}>{r.heatScore?.toFixed(2)}</Text>,
    },
    {
      title: '标签', key: 'tags',
      render: (r: any) => (r.tags as string[])?.map((t: string) => <Tag key={t}>#{t}</Tag>),
    },
    {
      title: '时间', key: 'time', width: 120,
      render: (r: any) => dayjs(r.createdAt).format('MM/DD HH:mm'),
    },
  ];

  const pendingColumns = [
    ...columns,
    {
      title: '操作', key: 'action', width: 100,
      render: (r: any) => (
        <Button type="primary" size="small" icon={<SendOutlined />} onClick={() => handleDistribute(r.id)}>
          分发
        </Button>
      ),
    },
  ];

  const historyColumns = [
    ...columns,
    {
      title: '分发时间', key: 'distributedAt', width: 140,
      render: (r: any) => r.distributedAt ? dayjs(r.distributedAt).format('MM/DD HH:mm') : '-',
    },
  ];

  return (
    <Card>
      <Title level={4}><SendOutlined style={{ color: '#FF6A00' }} /> 分发管理</Title>
      <Tabs items={[
        {
          key: 'pending',
          label: <Space><CheckCircleOutlined /> 待分发 ({pending.length})</Space>,
          children: pending.length === 0 ? <Empty description="暂无待分发短评" /> : (
            <Table dataSource={pending} columns={pendingColumns} rowKey="id" pagination={false} loading={loading} />
          ),
        },
        {
          key: 'history',
          label: <Space><HistoryOutlined /> 历史记录 ({history.length})</Space>,
          children: history.length === 0 ? <Empty description="暂无分发记录" /> : (
            <Table dataSource={history} columns={historyColumns} rowKey="id" pagination={false} loading={loading} />
          ),
        },
      ]} />

      <ReviewDetailDrawer
        reviewId={drawerReviewId}
        open={!!drawerReviewId}
        onClose={() => setDrawerReviewId(null)}
        onChange={fetchData}
      />
    </Card>
  );
};

export default DistributePage;
