import React, { useState } from 'react';
import { Layout, Menu, Avatar, Dropdown, Typography, Space, Drawer, Button } from 'antd';
import {
  FileTextOutlined, FireOutlined, PlusOutlined, SendOutlined,
  UserOutlined, LogoutOutlined, SettingOutlined, MenuOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

const { Sider, Header, Content } = Layout;
const { Text } = Typography;

const LogoMark = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="28" height="28" rx="7" fill="#FF6900"/>
    <path d="M6 10.5C6 9.67 6.67 9 7.5 9H20.5C21.33 9 22 9.67 22 10.5V17.5C22 18.33 21.33 19 20.5 19H16.5L14 21.5L11.5 19H7.5C6.67 19 6 18.33 6 17.5V10.5Z" fill="white"/>
    <rect x="9" y="12" width="10" height="1.5" rx="0.75" fill="#FF6900"/>
    <rect x="9" y="15" width="6" height="1.5" rx="0.75" fill="#FF6900"/>
  </svg>
);

const AppLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const menuItems = [
    { key: '/ranking', icon: <FireOutlined />, label: '最热短评榜' },
    { key: '/reviews', icon: <FileTextOutlined />, label: '短评池' },
    { key: '/publish', icon: <PlusOutlined />, label: '发布短评' },
    ...(user?.role === 'supervisor'
      ? [
          { key: '/distribute', icon: <SendOutlined />, label: '分发管理' },
          { key: '/settings', icon: <SettingOutlined />, label: '系统设置' },
        ]
      : []),
  ];

  // Bottom tab bar items for mobile
  const bottomTabs = [
    { key: '/ranking', icon: <FireOutlined />, label: '热榜' },
    { key: '/reviews', icon: <FileTextOutlined />, label: '短评池' },
    { key: '/publish', icon: <PlusOutlined />, label: '发布' },
    { key: '/profile', icon: <UserOutlined />, label: '我的' },
  ];

  const userMenu = {
    items: [
      { key: 'profile', icon: <UserOutlined />, label: '个人中心', onClick: () => navigate('/profile') },
      { type: 'divider' as const },
      { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', danger: true, onClick: () => { logout(); navigate('/login'); } },
    ],
  };

  const handleMenuClick = (key: string) => {
    navigate(key);
    setMobileDrawerOpen(false);
  };

  const sidebarContent = (
    <>
      {/* Logo */}
      <div
        style={{
          height: 56, display: 'flex', alignItems: 'center',
          padding: '0 16px', gap: 10,
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          cursor: 'pointer', flexShrink: 0,
        }}
        onClick={() => handleMenuClick('/ranking')}
      >
        <LogoMark />
        <div>
          <div style={{ color: '#FFFFFF', fontSize: 15, fontWeight: 700, lineHeight: 1.25, letterSpacing: '-0.2px' }}>
            AI Sight
          </div>
          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, lineHeight: 1.4, marginTop: 1 }}>
            Collect sparks,<br />Guide strategies.
          </div>
        </div>
      </div>

      {/* Nav menu */}
      <Menu
        theme="dark"
        mode="inline"
        selectedKeys={[location.pathname]}
        items={menuItems}
        onClick={({ key }) => handleMenuClick(key)}
        style={{ marginTop: 6, background: '#1C1C1E', border: 'none', flex: 1 }}
      />
    </>
  );

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* Desktop sidebar */}
      <Sider
        width={208}
        theme="dark"
        className="desktop-sider"
        style={{
          position: 'fixed', left: 0, top: 0, bottom: 0, zIndex: 10,
          background: '#1C1C1E',
          borderRight: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {sidebarContent}
      </Sider>

      {/* Mobile sidebar drawer */}
      <Drawer
        open={mobileDrawerOpen}
        onClose={() => setMobileDrawerOpen(false)}
        placement="left"
        width={220}
        styles={{
          body: { padding: 0, background: '#1C1C1E', display: 'flex', flexDirection: 'column' },
          header: { display: 'none' },
        }}
      >
        {sidebarContent}
      </Drawer>

      <Layout className="main-layout" style={{ minHeight: '100vh' }}>
        {/* Header */}
        <Header style={{
          background: '#ffffff',
          padding: '0 16px',
          height: 50,
          lineHeight: '50px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #F2F2F7',
          position: 'sticky', top: 0, zIndex: 9,
        }}>
          {/* Mobile hamburger */}
          <Button
            className="mobile-only"
            type="text"
            icon={<MenuOutlined />}
            onClick={() => setMobileDrawerOpen(true)}
            style={{ fontSize: 18 }}
          />
          <div className="desktop-only" />

          <Dropdown menu={userMenu} placement="bottomRight" trigger={['click']}>
            <Space style={{ cursor: 'pointer', userSelect: 'none' }} size={8}>
              <div style={{ position: 'relative' }}>
                <Avatar
                  size={28}
                  icon={<UserOutlined />}
                  src={user?.avatarUrl}
                  style={{ background: '#FF6900', fontSize: 12 }}
                />
                {user?.role === 'supervisor' && (
                  <span style={{
                    position: 'absolute', top: -2, right: -2,
                    width: 8, height: 8, borderRadius: '50%',
                    background: '#F8D04C', border: '1.5px solid #fff',
                  }} />
                )}
              </div>
              <Text style={{ fontSize: 13, fontWeight: 500, color: '#1C1C1E' }}>{user?.name}</Text>
            </Space>
          </Dropdown>
        </Header>

        <Content className="main-content" style={{ margin: 20, minHeight: 'calc(100vh - 90px)' }}>
          <Outlet />
        </Content>

        {/* Mobile bottom tab bar */}
        <nav className="mobile-bottom-bar">
          {bottomTabs.map(tab => {
            const active = location.pathname === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => navigate(tab.key)}
                style={{
                  flex: 1,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: 2, border: 'none', background: 'none', cursor: 'pointer',
                  color: active ? '#FF6900' : '#999',
                  fontSize: 9, fontWeight: active ? 600 : 400,
                  padding: '8px 0',
                }}
              >
                <span style={{ fontSize: 20 }}>{tab.icon}</span>
                {tab.label}
              </button>
            );
          })}
        </nav>
      </Layout>
    </Layout>
  );
};

export default AppLayout;
