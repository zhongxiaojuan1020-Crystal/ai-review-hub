import React, { useEffect, useMemo, useState } from 'react';
import {
  Drawer, Input, Select, Tag, Typography, Space, Badge, Empty,
  Avatar, Tooltip, Divider,
} from 'antd';
import { FireOutlined, SendOutlined, UserOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { TAG_DOMAIN_MAP, MAIN_DOMAINS } from '@ai-review/shared';
import api from '../../api/client';

const { Text } = Typography;
const { Search } = Input;

const DOMAIN_COLOR: Record<string, string> = {
  'AI应用':  '#FF6900',
  '具身智能': '#FF921B',
  'AI Coding': '#F8A030',
  '基础模型': '#C8500A',
};

function reviewDomain(tags: string[]): string {
  for (const tag of tags) {
    const d = TAG_DOMAIN_MAP[tag];
    if (d) return d;
  }
  return '其他';
}

interface Props {
  open: boolean;
  onClose: () => void;
}

const ArchiveDrawer: React.FC<Props> = ({ open, onClose }) => {
  const [reviews, setReviews] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [filterDomain, setFilterDomain] = useState<string>('');
  const [filterAuthor, setFilterAuthor] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      api.get('/api/reviews').then(res => setReviews(res.data)).catch(() => {});
    }
  }, [open]);

  const authors = useMemo(() => {
    const map = new Map<string, string>();
    reviews.forEach(r => { if (r.author) map.set(r.author.id, r.author.name); });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [reviews]);

  const filtered = useMemo(() => {
    return reviews.filter(r => {
      if (search && !r.company.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterDomain && reviewDomain(r.tags) !== filterDomain) return false;
      if (filterAuthor && r.author?.id !== filterAuthor) return false;
      if (filterStatus === 'completed' && r.status !== 'completed') return false;
      if (filterStatus === 'in_progress' && r.status !== 'in_progress') return false;
      if (filterStatus === 'distributed' && !r.distributed) return false;
      return true;
    });
  }, [reviews, search, filterDomain, filterAuthor, filterStatus]);

  // Group by domain
  const grouped = useMemo(() => {
    const map = new Map<string, any[]>();
    const domains = [...MAIN_DOMAINS, '其他'];
    domains.forEach(d => map.set(d, []));
    filtered.forEach(r => {
      const d = reviewDomain(r.tags);
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(r);
    });
    // Only return non-empty groups in domain order
    return domains.map(d => ({ domain: d, items: map.get(d) || [] })).filter(g => g.items.length > 0);
  }, [filtered]);

  const handleClick = (id: string) => {
    navigate(`/reviews/${id}`);
    onClose();
  };

  return (
    <Drawer
      title={
        <Space>
          <Text strong>全部短评</Text>
          <Badge count={reviews.length} style={{ backgroundColor: '#FF6A00' }} />
        </Space>
      }
      placement="right"
      width={420}
      open={open}
      onClose={onClose}
      styles={{ body: { padding: '12px 16px' } }}
    >
      {/* Filters */}
      <Search
        placeholder="搜索短评标题..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ marginBottom: 10 }}
        allowClear
      />
      <Space size={8} wrap style={{ marginBottom: 14 }}>
        <Select
          placeholder="领域"
          style={{ width: 110 }}
          value={filterDomain || undefined}
          onChange={v => setFilterDomain(v || '')}
          allowClear
          size="small"
          options={MAIN_DOMAINS.map(d => ({ label: d, value: d }))}
        />
        <Select
          placeholder="作者"
          style={{ width: 110 }}
          value={filterAuthor || undefined}
          onChange={v => setFilterAuthor(v || '')}
          allowClear
          size="small"
          options={authors.map(a => ({ label: a.name, value: a.id }))}
        />
        <Select
          placeholder="状态"
          style={{ width: 100 }}
          value={filterStatus || undefined}
          onChange={v => setFilterStatus(v || '')}
          allowClear
          size="small"
          options={[
            { label: '进行中', value: 'in_progress' },
            { label: '已完成', value: 'completed' },
            { label: '已分发', value: 'distributed' },
          ]}
        />
      </Space>

      {grouped.length === 0 ? (
        <Empty description="暂无匹配短评" style={{ marginTop: 40 }} />
      ) : (
        grouped.map(({ domain, items }) => (
          <div key={domain} style={{ marginBottom: 16 }}>
            {/* Domain header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{
                width: 10, height: 10, borderRadius: '50%',
                background: DOMAIN_COLOR[domain] || '#999',
                flexShrink: 0,
              }} />
              <Text strong style={{ fontSize: 13, color: DOMAIN_COLOR[domain] || '#999' }}>{domain}</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>({items.length})</Text>
            </div>

            {/* Review items */}
            {items.map(r => (
              <div
                key={r.id}
                onClick={() => handleClick(r.id)}
                style={{
                  padding: '8px 10px',
                  marginBottom: 4,
                  borderRadius: 6,
                  cursor: 'pointer',
                  borderLeft: `3px solid ${DOMAIN_COLOR[domain] || '#eee'}`,
                  background: '#fafafa',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#FFF7E6')}
                onMouseLeave={e => (e.currentTarget.style.background = '#fafafa')}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <Text style={{ fontSize: 13, lineHeight: 1.5, flex: 1 }} ellipsis={{ tooltip: r.company }}>
                    {r.company}
                  </Text>
                  {r.heatScore != null && (
                    <Space size={2} style={{ flexShrink: 0 }}>
                      <FireOutlined style={{ color: '#FF6A00', fontSize: 11 }} />
                      <Text style={{ color: '#FF6A00', fontSize: 12, fontWeight: 700 }}>
                        {r.heatScore.toFixed(1)}
                      </Text>
                    </Space>
                  )}
                </div>
                <Space size={6} style={{ marginTop: 4 }}>
                  <Tooltip title={r.author?.name}>
                    <Avatar size={16} icon={<UserOutlined />} style={{ background: '#FFD591', fontSize: 10 }} />
                  </Tooltip>
                  <Text type="secondary" style={{ fontSize: 11 }}>{r.author?.name}</Text>
                  <Text type="secondary" style={{ fontSize: 11 }}>·</Text>
                  <Text type="secondary" style={{ fontSize: 11 }}>{dayjs(r.createdAt).format('MM/DD')}</Text>
                  {r.distributed
                    ? <Tag color="green" style={{ fontSize: 10, padding: '0 4px', margin: 0, lineHeight: '16px' }}>已分发</Tag>
                    : r.status === 'completed'
                      ? <Tag color="orange" style={{ fontSize: 10, padding: '0 4px', margin: 0, lineHeight: '16px' }}>待审阅</Tag>
                      : <Tag icon={<ClockCircleOutlined />} style={{ fontSize: 10, padding: '0 4px', margin: 0, lineHeight: '16px' }}>进行中</Tag>
                  }
                </Space>
              </div>
            ))}

            <Divider style={{ margin: '12px 0 4px' }} />
          </div>
        ))
      )}
    </Drawer>
  );
};

export default ArchiveDrawer;
