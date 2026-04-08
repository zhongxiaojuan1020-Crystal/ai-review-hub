import React, { useEffect, useState } from 'react';
import {
  Card, Button, Typography, Space, message, Slider, Table, Tag, Modal,
  Form, Input, Select, Badge,
} from 'antd';
import { SettingOutlined, UserAddOutlined, PauseCircleOutlined, PlayCircleOutlined, BellOutlined } from '@ant-design/icons';
import { MAIN_DOMAINS, DOMAIN_COLOR } from '@ai-review/shared';
import api from '../api/client';

const { Title, Text } = Typography;

const SettingsPage: React.FC = () => {
  const [supervisorShare, setSupervisorShare] = useState(40);
  const [shareLoading, setShareLoading] = useState(false);

  const [members, setMembers] = useState<any[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);

  const [addOpen, setAddOpen] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [form] = Form.useForm();

  const [webhook, setWebhook] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [webhookTesting, setWebhookTesting] = useState(false);

  useEffect(() => {
    api.get('/api/ranking/config').then(res => {
      setSupervisorShare(Math.round((res.data.supervisorShare ?? 0.4) * 100));
    }).catch(() => {});
    api.get('/api/config').then(res => {
      setWebhook(res.data.dingtalk_webhook || '');
      setWebhookSecret(res.data.dingtalk_secret || '');
    }).catch(() => {});
    loadMembers();
  }, []);

  const loadMembers = () => {
    setMembersLoading(true);
    api.get('/api/users').then(res => {
      setMembers(res.data);
      setMembersLoading(false);
    }).catch(() => setMembersLoading(false));
  };

  const handleSaveShare = async () => {
    setShareLoading(true);
    try {
      await api.put('/api/ranking/config', { supervisorShare: supervisorShare / 100 });
      message.success('权重已保存');
    } catch {
      message.error('保存失败');
    }
    setShareLoading(false);
  };

  const handleToggle = async (id: string) => {
    try {
      await api.put(`/api/users/${id}/toggle`);
      loadMembers();
    } catch {
      message.error('操作失败');
    }
  };

  const handleSaveWebhook = async () => {
    setWebhookLoading(true);
    try {
      await api.put('/api/config', {
        dingtalk_webhook: webhook,
        dingtalk_secret: webhookSecret,
      });
      message.success('Webhook 已保存');
    } catch {
      message.error('保存失败');
    }
    setWebhookLoading(false);
  };

  const handleTestWebhook = async () => {
    setWebhookTesting(true);
    try {
      await api.post('/api/config/dingtalk/test');
      message.success('测试消息已发送，请检查群聊');
    } catch (err: any) {
      const e = err?.response?.data;
      const hint = e?.errcode === 310000
        ? '（提示：可能是自定义关键词或加签密钥未匹配）'
        : e?.errcode === 300001
          ? '（提示：Webhook URL 无效或已被删除）'
          : '';
      message.error(`发送失败：${e?.error || '未知错误'} ${hint}`);
    }
    setWebhookTesting(false);
  };

  const handleAddMember = async () => {
    try {
      const values = await form.validateFields();
      setAddLoading(true);
      await api.post('/api/users', values);
      message.success('成员已添加');
      setAddOpen(false);
      form.resetFields();
      loadMembers();
    } catch (err: any) {
      if (err?.response?.data?.error) message.error(err.response.data.error);
    }
    setAddLoading(false);
  };

  const domainLabel = (weights: any) => {
    if (!weights) return <Text type="secondary">—</Text>;
    const w = typeof weights === 'string' ? JSON.parse(weights) : weights;
    const primary = MAIN_DOMAINS.find(d => w[d] === 1.0);
    const secondary = MAIN_DOMAINS.find(d => w[d] === 0.7);
    return (
      <Space size={4} wrap>
        {primary && <Tag style={{ background: DOMAIN_COLOR[primary] + '20', color: DOMAIN_COLOR[primary], borderColor: DOMAIN_COLOR[primary] + '40' }}>{primary}</Tag>}
        {secondary && <Tag style={{ background: DOMAIN_COLOR[secondary] + '14', color: DOMAIN_COLOR[secondary], borderColor: DOMAIN_COLOR[secondary] + '30', opacity: 0.85 }}>{secondary}</Tag>}
      </Space>
    );
  };

  const columns = [
    {
      title: '姓名',
      key: 'name',
      render: (r: any) => (
        <Space>
          <Text strong>{r.name}</Text>
          {r.role === 'supervisor' && <Tag color="orange">主管</Tag>}
        </Space>
      ),
    },
    {
      title: '专业领域',
      key: 'domain',
      render: (r: any) => r.role === 'supervisor'
        ? <Text type="secondary" style={{ fontSize: 12 }}>全领域覆盖</Text>
        : domainLabel(r.domainWeights),
    },
    {
      title: '状态',
      key: 'status',
      width: 100,
      render: (r: any) => (
        <span style={{ whiteSpace: 'nowrap' }}>
          {r.isActive
            ? <Badge status="success" text="正常使用" />
            : <Badge status="default" text="已停用" />}
        </span>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (r: any) => (
        r.role !== 'supervisor' ? (
          <Button
            type="text"
            size="small"
            icon={r.isActive ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
            onClick={() => handleToggle(r.id)}
          >
            {r.isActive ? '停用' : '恢复'}
          </Button>
        ) : <Text type="secondary" style={{ fontSize: 12 }}>—</Text>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      <Title level={4} style={{ marginBottom: 20 }}>
        <SettingOutlined style={{ color: '#FF6A00', marginRight: 8 }} />系统设置
      </Title>

      {/* Supervisor weight */}
      <Card
        title="我的评分权重"
        size="small"
        style={{ marginBottom: 16, borderColor: '#FFD591' }}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 16, fontSize: 13 }}>
          你的评分在最终热度分中的占比。剩余权重由其他成员按领域专长自动分配。
        </Text>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <Slider
              min={10} max={70} step={5}
              value={supervisorShare}
              onChange={setSupervisorShare}
              marks={{ 10: '10%', 40: '40%', 70: '70%' }}
              tooltip={{ formatter: v => `${v}%` }}
              styles={{ track: { background: '#FF6A00' }, handle: { borderColor: '#FF6A00' } }}
            />
          </div>
          <Text style={{ fontSize: 24, fontWeight: 700, color: '#FF6A00', width: 52 }}>
            {supervisorShare}%
          </Text>
        </div>
        <Button
          type="primary"
          loading={shareLoading}
          onClick={handleSaveShare}
          style={{ marginTop: 8 }}
        >
          保存
        </Button>
      </Card>

      {/* DingTalk webhook */}
      <Card
        title={<Space><BellOutlined style={{ color: '#FF6A00' }} /><span>钉钉群通知</span></Space>}
        size="small"
        style={{ marginBottom: 16, borderColor: '#FFD591' }}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={10}>
          <div>
            <Text style={{ fontSize: 12, color: '#999', display: 'block', marginBottom: 4 }}>
              Webhook 地址
            </Text>
            <Input
              placeholder="https://oapi.dingtalk.com/robot/send?access_token=..."
              value={webhook}
              onChange={e => setWebhook(e.target.value)}
            />
          </div>
          <div>
            <Text style={{ fontSize: 12, color: '#999', display: 'block', marginBottom: 4 }}>
              加签密钥（可选，机器人安全设置为"加签"时填写，以 SEC 开头）
            </Text>
            <Input.Password
              placeholder="SECxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              value={webhookSecret}
              onChange={e => setWebhookSecret(e.target.value)}
            />
          </div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            提示：若机器人安全设置为"自定义关键词"，请包含关键词 <Text code>短评</Text>。
          </Text>
          <Space>
            <Button type="primary" loading={webhookLoading} onClick={handleSaveWebhook}>
              保存
            </Button>
            <Button loading={webhookTesting} onClick={handleTestWebhook}>
              发送测试消息
            </Button>
          </Space>
        </Space>
      </Card>

      {/* Team members */}
      <Card
        title="团队成员"
        size="small"
        extra={
          <Button
            type="primary"
            size="small"
            icon={<UserAddOutlined />}
            onClick={() => setAddOpen(true)}
          >
            新增成员
          </Button>
        }
      >
        <Table
          dataSource={members}
          columns={columns}
          rowKey="id"
          loading={membersLoading}
          pagination={false}
          size="small"
        />
      </Card>

      {/* Add member modal */}
      <Modal
        open={addOpen}
        title="新增团队成员"
        onCancel={() => { setAddOpen(false); form.resetFields(); }}
        onOk={handleAddMember}
        okText="添加"
        cancelText="取消"
        confirmLoading={addLoading}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input placeholder="如：张三" />
          </Form.Item>
          <Form.Item name="dingtalkUserId" label="钉钉账号 ID" rules={[{ required: true, message: '请输入钉钉账号' }]}>
            <Input placeholder="钉钉 userid" />
          </Form.Item>
          <Form.Item name="role" label="角色" initialValue="member">
            <Select>
              <Select.Option value="member">成员</Select.Option>
              <Select.Option value="supervisor">主管</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="primaryDomain" label="主领域">
            <Select placeholder="选择主要擅长方向" allowClear>
              {MAIN_DOMAINS.map(d => (
                <Select.Option key={d} value={d}>{d}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="secondaryDomain" label="副领域">
            <Select placeholder="选择次要擅长方向（可不选）" allowClear>
              {MAIN_DOMAINS.map(d => (
                <Select.Option key={d} value={d}>{d}</Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default SettingsPage;
