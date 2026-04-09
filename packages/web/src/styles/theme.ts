import type { ThemeConfig } from 'antd';

// AI Sight — Alibaba Orange + Apple flat design system
// Palette: #FF6900 (primary), #FF921B (warm), #F8D04C (accent), #1C1C1E (dark), #F2F2F7 (bg)
export const theme: ThemeConfig = {
  token: {
    colorPrimary: '#FF6900',
    colorLink: '#FF6900',
    colorLinkHover: '#FF921B',
    colorInfo: '#FF6900',
    borderRadius: 6,
    borderRadiusLG: 8,
    borderRadiusSM: 4,
    colorBgContainer: '#ffffff',
    colorBgLayout: '#F2F2F7',
    colorBorder: '#E5E5EA',
    colorBorderSecondary: '#F2F2F7',
    colorText: '#1C1C1E',
    colorTextSecondary: '#6C6C70',
    colorTextTertiary: '#AEAEB2',
    colorFill: '#F2F2F7',
    colorFillSecondary: '#F9F9F9',
    colorFillTertiary: '#FAFAFA',
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Helvetica Neue", "Microsoft YaHei", sans-serif',
    fontSize: 14,
    fontSizeSM: 12,
    lineHeight: 1.6,
    boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
    boxShadowSecondary: '0 4px 16px rgba(0,0,0,0.08)',
    motionDurationMid: '0.15s',
    motionDurationSlow: '0.2s',
    motionEaseInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },
  components: {
    Layout: {
      siderBg: '#1C1C1E',
      headerBg: '#ffffff',
      bodyBg: '#F2F2F7',
    },
    Menu: {
      darkItemBg: '#1C1C1E',
      darkItemSelectedBg: '#FF6900',
      darkItemHoverBg: 'rgba(255,255,255,0.06)',
      darkItemSelectedColor: '#ffffff',
      darkItemColor: 'rgba(255,255,255,0.6)',
      darkSubMenuItemBg: '#1C1C1E',
      itemHeight: 40,
    },
    Button: {
      primaryColor: '#ffffff',
      defaultBorderColor: '#E5E5EA',
      defaultColor: '#1C1C1E',
      fontWeight: 500,
    },
    Card: {
      boxShadowTertiary: 'none',
      paddingLG: 20,
    },
    Tag: {
      defaultBg: '#FFF3E8',
      defaultColor: '#FF6900',
      borderRadiusSM: 4,
    },
    Table: {
      headerBg: '#F9F9F9',
      borderColor: '#F2F2F7',
    },
    Input: {
      borderRadius: 6,
    },
    Select: {
      borderRadius: 6,
    },
    Modal: {
      borderRadiusLG: 12,
    },
    Drawer: {
      borderRadiusLG: 0,
    },
    Tabs: {
      inkBarColor: '#FF6900',
      itemSelectedColor: '#FF6900',
      itemHoverColor: '#FF921B',
    },
    Badge: {
      colorPrimary: '#FF6900',
    },
    Slider: {
      trackBg: '#FF6900',
      trackHoverBg: '#FF921B',
      handleColor: '#FF6900',
      handleActiveColor: '#FF6900',
    },
    Divider: {
      colorSplit: '#F2F2F7',
    },
  },
};
