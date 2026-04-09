import React, { useState } from 'react';
import { Button, Input, Typography, message, Form } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

const { Text } = Typography;

const LogoMark = () => (
  <svg width="44" height="44" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="28" height="28" rx="7" fill="#FF6900"/>
    <path
      d="M6 10.5C6 9.67 6.67 9 7.5 9H20.5C21.33 9 22 9.67 22 10.5V17.5C22 18.33 21.33 19 20.5 19H16.5L14 21.5L11.5 19H7.5C6.67 19 6 18.33 6 17.5V10.5Z"
      fill="white"
    />
    <rect x="9" y="12" width="10" height="1.5" rx="0.75" fill="#FF6900"/>
    <rect x="9" y="15" width="6" height="1.5" rx="0.75" fill="#FF6900"/>
  </svg>
);

const LoginPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const { login } = useAuthStore();
  const navigate = useNavigate();

  const handleLogin = async (values: { name: string; password: string }) => {
    setLoading(true);
    try {
      await login(values.name.trim(), values.password);
      navigate('/reviews');
    } catch (err: any) {
      const msg = err?.response?.data?.error || '登录失败，请检查姓名和密码';
      message.error(msg);
    }
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#F2F2F7',
    }}>
      <div style={{
        width: 340,
        background: '#fff',
        borderRadius: 16,
        border: '1px solid #E5E5EA',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '28px 24px 20px',
          borderBottom: '1px solid #F2F2F7',
          textAlign: 'center',
        }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            <LogoMark />
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#1C1C1E', letterSpacing: '-0.3px' }}>
            AI Sight
          </div>
          <div style={{ fontSize: 12, color: '#AEAEB2', marginTop: 4 }}>
            请登录以继续
          </div>
        </div>

        {/* Login form */}
        <div style={{ padding: '20px 20px 16px' }}>
          <Form form={form} onFinish={handleLogin} layout="vertical" requiredMark={false}>
            <Form.Item name="name" rules={[{ required: true, message: '请输入姓名' }]} style={{ marginBottom: 12 }}>
              <Input
                prefix={<UserOutlined style={{ color: '#AEAEB2' }} />}
                placeholder="姓名"
                size="large"
                style={{ borderRadius: 10 }}
              />
            </Form.Item>
            <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]} style={{ marginBottom: 16 }}>
              <Input.Password
                prefix={<LockOutlined style={{ color: '#AEAEB2' }} />}
                placeholder="密码"
                size="large"
                style={{ borderRadius: 10 }}
              />
            </Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              size="large"
              style={{ borderRadius: 10, fontWeight: 600 }}
            >
              登录
            </Button>
          </Form>
        </div>

        <div style={{ padding: '4px 20px 16px', textAlign: 'center' }}>
          <Text style={{ fontSize: 11, color: '#C7C7CC' }}>AI Sight · 内部使用</Text>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
