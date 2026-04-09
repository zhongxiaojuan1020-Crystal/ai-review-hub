import type { ThemeConfig } from 'antd';

// AI Sight — Alibaba Orange + Apple flat design system
// Palette: #FF6900 (primary), #FF921B (warm), #F8D04C (accent), #1C1C1E (dark), #F2F2F7 (bg)
export const theme: ThemeConfig = {
  token: {
    colorPrimary: '#FF6900',
    colorLink: '#FF6900',
    colorLinkHover: '#FF921B',
    colorInfo: '#FF6900',
    borderRadius: 3,
    borderRadiusLG: 4,
    borderRadiusSM: 2,
    // ── Paper palette ──────────────────────────────────────
    colorBgContainer: '#FDFAF2',       // warm off-white (card surface)
    colorBgLayout: '#EDE0C4',          // aged paper background
    colorBorder: '#D4BF98',            // antique border
    colorBorderSecondary: '#E8D9BE',
    colorText: '#2A1A08',              // warm espresso text
    colorTextSecondary: '#6B5540',     // warm brown-gray
    colorTextTertiary: '#A8906C',
    colorFill: '#E8D9BE',
    colorFillSecondary: '#F5EDD8',
    colorFillTertiary: '#FAF5E8',
    fontFamily: '"Microsoft YaHei", "PingFang SC", "Helvetica Neue", sans-serif',
    fontSize: 13,
    fontSizeSM: 12,
    lineHeight: 1.7,
    // Warm brownish shadows (not cool gray)
    boxShadow: '2px 2px 0 #C4AA80, 0 3px 8px rgba(80,45,5,0.10)',
    boxShadowSecondary: '3px 5px 0 #C4AA80, 0 6px 20px rgba(80,45,5,0.14)',
    motionDurationMid: '0.18s',
    motionDurationSlow: '0.25s',
    motionEaseInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },
  components: {
    Layout: {
      siderBg: '#1A0E05',             // espresso book-spine brown
      headerBg: '#FDFAF2',
      bodyBg: '#EDE0C4',
    },
    Menu: {
      darkItemBg: '#1A0E05',
      darkItemSelectedBg: '#FF6900',
      darkItemHoverBg: 'rgba(255,150,50,0.10)',
      darkItemSelectedColor: '#ffffff',
      darkItemColor: 'rgba(255,220,170,0.55)',
      darkSubMenuItemBg: '#1A0E05',
      itemHeight: 40,
    },
    Button: {
      primaryColor: '#ffffff',
      defaultBorderColor: '#E5E5EA',
      defaultColor: '#1C1C1E',
      fontWeight: 500,
    },
    Card: {
      colorBgContainer: '#FDFAF2',
      paddingLG: 18,
    },
    Tag: {
      defaultBg: '#F5E8D0',
      defaultColor: '#B85000',
      borderRadiusSM: 2,
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
