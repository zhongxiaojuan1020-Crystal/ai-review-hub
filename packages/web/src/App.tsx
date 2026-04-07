import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, Spin } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { theme } from './styles/theme';
import { useAuthStore } from './stores/authStore';
import AppLayout from './components/Layout/AppLayout';
import LoginPage from './pages/LoginPage';
import ReviewPoolPage from './pages/ReviewPoolPage';
import ReviewDetailPage from './pages/ReviewDetailPage';
import RankingPage from './pages/RankingPage';
import PublishPage from './pages/PublishPage';
import DistributePage from './pages/DistributePage';
import SettingsPage from './pages/SettingsPage';
import ProfilePage from './pages/ProfilePage';
import GuestViewPage from './pages/GuestViewPage';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, loading } = useAuthStore();
  if (loading) return <Spin style={{ display: 'block', margin: '200px auto' }} size="large" />;
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const App: React.FC = () => {
  const { fetchMe } = useAuthStore();

  useEffect(() => { fetchMe(); }, []);

  return (
    <ConfigProvider theme={theme} locale={zhCN}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/guest/:token" element={<GuestViewPage />} />
          <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            <Route index element={<Navigate to="/ranking" replace />} />
            <Route path="reviews" element={<ReviewPoolPage />} />
            <Route path="reviews/:id" element={<ReviewDetailPage />} />
            <Route path="ranking" element={<RankingPage />} />
            <Route path="publish" element={<PublishPage />} />
            <Route path="distribute" element={<DistributePage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="profile" element={<ProfilePage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  );
};

export default App;
