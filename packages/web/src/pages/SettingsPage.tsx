import React, { useEffect, useState } from 'react';
import {
  Card, Button, Typography, Space, message, Slider, Table, Tag, Modal,
  Form, Input, Select, Badge,
} from 'antd';
import { SettingOutlined, UserAddOutlined, PauseCircleOutlined, PlayCircleOutlined, BellOutlined, KeyOutlined, LockOutlined } from '@ant-design/icons';
import { MAIN_DOMAINS } from '@ai-review/shared';
import api from '../api/client';

const { Title, Text } = Typography;

const DOMAIN_COLOR: Record<string, string> = {
  'AI应用':  '#FF6900',
  '具身智能': '#FF921B',
  'AI Coding': '#F8A030',
  '基础模型': '#C8500A',
};

const SettingsPage: React.FC = () => {
  const [supervisorShare, setSupervisorShare] = useState(40);
  const [shareLoading, setShareLoading] = useState(false);

  const [members, setMembers] = useState<any[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);

  const [addOpen, setAddOpen] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [form] = Form.useForm();

  const [webhook, setWebhook] = useState('');
  const [webhookLoading, setWebhookLoading] = useState(false);

  const [pwdTarget, setPwdTarget] = useState<{ id: string; name: string } | null>(null);
  const [pwdValue, setPwdValue] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);

  const [myOldPwd, setMyOldPwd] = useState('');
  const [myNewPwd, setMyNewPwd] = useState('');
  const [myNewPwd2, setMyNewPwd2] = useState('');
  const [myPwdLoading, setMyPwdLoading] = useState(false);

  useEffect(() => {
    api.get('/api/ranking/config').then(res => {
      setSupervisorShare(Math.round((res.data.supervisorShare ?? 0.4) * 100));
    }).catch(() => {});
    api.get('/api/config').then(res => {
      setWebhook(res.data.dingtalk_webhook || '');
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

  const handleSetPassword = async () => {
    if (!pwdTarget) return;
    if (!pwdValue || pwdValue.length < 6) {
      message.error('密码至少6位');
      return;
    }
    setPwdLoading(true);
    try {
      await api.put(`/api/users/${pwdTarget.id}/password`, { password: pwdValue });
      message.success(`${pwdTarget.name} 的密码已设置`);
      setPwdTarget(null);
      setPwdValue('');
    } catch (err: any) {
      message.error(err?.response?.data?.error || '设置失败');
    }
    setPwdLoading(false);
  };

  const handleChangeMyPassword = async () => {
    if (!myOldPwd || !myNewPwd) {
      message.error('请输入旧密码和新密码');
      return;
    }
    if (myNewPwd.length < 6) {
      message.error('新密码至少 6 位');
      return;
    }
    if (myNewPwd !== myNewPwd2) {
      message.error('两次输入的新密码不一致');
      return;
    }
    setMyPwdLoading(true);
    try {
      await api.post('/api/auth/change-password', { oldPassword: myOldPwd, newPassword: myNewPwd });
      message.success('密码修改成功');
      setMyOldPwd(''); setMyNewPwd(''); setMyNewPwd2('');
    } catch (err: any) {
      message.error(err?.response?.data?.error || '修改失败');
    }
    setMyPwdLoading(false);
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
      await api.put('/api/config', { dingtalk_webhook: webhook });
      message.success('Webhook 已保存');
    } catch {
      message.error('保存失败');
    }
    setWebhookLoading(false);
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
      width: 140,
      render: (r: any) => (
        <Space size={4}>
          <Button
            type="text"
            size="small"
            icon={<KeyOutlined />}
            onClick={() => { setPwdTarget({ id: r.id, name: r.name }); setPwdValue(''); }}
          >
            设置密码
          </Button>
          {r.role !== 'supervisor' && (
            <Button
              type="text"
              size="small"
              icon={r.isActive ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
              onClick={() => handleToggle(r.id)}
            >
              {r.isActive ? '停用' : '恢复'}
            </Button>
          )}
        </Space>
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

      {/* Change my password */}
      <Card
        title={<Space><LockOutlined style={{ color: '#FF6A00' }} /><span>修改我的密码</span></Space>}
        size="small"
        style={{ marginBottom: 16, borderColor: '#FFD591' }}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={10}>
          <Input.Password
            placeholder="旧密码"
            value={myOldPwd}
            onChange={e => setMyOldPwd(e.target.value)}
          />
          <Input.Password
            placeholder="新密码（至少 6 位）"
            value={myNewPwd}
            onChange={e => setMyNewPwd(e.target.value)}
          />
          <Input.Password
            placeholder="再次输入新密码"
            value={myNewPwd2}
            onChange={e => setMyNewPwd2(e.target.value)}
            onPressEnter={handleChangeMyPassword}
          />
          <Button type="primary" loading={myPwdLoading} onClick={handleChangeMyPassword}>
            保存新密码
          </Button>
        </Space>
      </Card>

      {/* DingTalk webhook */}
      <Card
        title={<Space><BellOutlined style={{ color: '#FF6A00' }} /><span>钉钉群通知</span></Space>}
        size="small"
        style={{ marginBottom: 16, borderColor: '#FFD591' }}
      >
        <Space.Compact style={{ width: '100%' }}>
          <Input
            placeholder="https://oapi.dingtalk.com/robot/send?access_token=..."
            value={webhook}
            onChange={e => setWebhook(e.target.value)}
          />
          <Button type="primary" loading={webhookLoading} onClick={handleSaveWebhook}>
            保存
          </Button>
        </Space.Compact>
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

      {/* Set password modal */}
      <Modal
        open={!!pwdTarget}
        title={`设置密码 · ${pwdTarget?.name}`}
        onCancel={() => { setPwdTarget(null); setPwdValue(''); }}
        onOk={handleSetPassword}
        okText="确认设置"
        cancelText="取消"
        confirmLoading={pwdLoading}
      >
        <div style={{ marginTop: 16 }}>
          <Text type="secondary" style={{ fontSize: 13 }}>设置后该成员可用姓名+密码登录，至少 6 位。</Text>
          <Input.Password
            style={{ marginTop: 12 }}
            placeholder="输入新密码"
            value={pwdValue}
            onChange={e => setPwdValue(e.target.value)}
            onPressEnter={handleSetPassword}
          />
        </div>
      </Modal>

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
