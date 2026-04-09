import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { Radio, Typography, DatePicker } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { reviewDomainFromTags } from '@ai-review/shared';

const { Text } = Typography;
const { RangePicker } = DatePicker;

const reviewDomain = (tags: string[]): string => reviewDomainFromTags(tags || []);

type PeriodMode = 'week' | 'month' | 'custom';

function getWeekRange(): [Dayjs, Dayjs] {
  const today = dayjs();
  const dow = today.day();
  const daysFromMonday = dow === 0 ? 6 : dow - 1;
  const monday = today.subtract(daysFromMonday, 'day').startOf('day');
  const sunday = monday.add(6, 'day').endOf('day');
  return [monday, sunday];
}

function getMonthRange(): [Dayjs, Dayjs] {
  const today = dayjs();
  return [today.startOf('month'), today.endOf('month')];
}

// ─── Treemap ──────────────────────────────────────────────────────────────────

const ORANGE_PALETTE = ['#FF6900', '#FF8233', '#FF9D5C', '#FFB880', '#FFD3A8', '#FFE8C8'];

interface Rect { x: number; y: number; w: number; h: number }
interface TItem { domain: string; count: number; percent: number; colorIdx: number }
interface TRect extends Rect, TItem {}

function layoutTreemap(
  items: TItem[], x: number, y: number, w: number, h: number
): TRect[] {
  if (items.length === 0) return [];
  if (items.length === 1) return [{ ...items[0], x, y, w, h }];
  const total = items.reduce((s, i) => s + i.count, 0);
  let cumSum = 0, splitIdx = 1;
  for (let i = 0; i < items.length - 1; i++) {
    cumSum += items[i].count;
    if (cumSum * 2 >= total) { splitIdx = i + 1; break; }
    splitIdx = i + 1;
  }
  const g1 = items.slice(0, splitIdx);
  const g2 = items.slice(splitIdx);
  const frac = g1.reduce((s, i) => s + i.count, 0) / total;
  if (w >= h) {
    const w1 = w * frac;
    return [...layoutTreemap(g1, x, y, w1, h), ...layoutTreemap(g2, x + w1, y, w - w1, h)];
  } else {
    const h1 = h * frac;
    return [...layoutTreemap(g1, x, y, w, h1), ...layoutTreemap(g2, x, y + h1, w, h - h1)];
  }
}

interface MekkoChartProps {
  data: Array<{ domain: string; count: number; percent: number }>;
  height: number;
}

const MekkoChart: React.FC<MekkoChartProps> = ({ data, height }) => {
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const items: TItem[] = useMemo(
    () =>
      data.map((d, i) => ({
        ...d,
        colorIdx: Math.min(i, ORANGE_PALETTE.length - 1),
      })),
    [data]
  );

  // We lay out against a fixed logical width; the container uses that same width
  // via position:relative so absolute children align correctly.
  const logicalW = 100; // percent-based: we'll use percentages below
  const rects: TRect[] = useMemo(
    () => layoutTreemap(items, 0, 0, logicalW, height),
    [items, height]
  );

  if (data.length === 0) return null;

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width: '100%', height, borderRadius: 6, overflow: 'hidden' }}
      onMouseLeave={() => setTooltip(null)}
    >
      {rects.map((cell) => {
        const color = ORANGE_PALETTE[cell.colorIdx];
        const showText = cell.percent >= 12;
        // cell coords are in [0, logicalW] x [0, height]
        return (
          <div
            key={cell.domain}
            style={{
              position: 'absolute',
              left: `calc(${(cell.x / logicalW) * 100}% + 1px)`,
              top: cell.y + 1,
              width: `calc(${(cell.w / logicalW) * 100}% - 2px)`,
              height: cell.h - 2,
              background: color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              cursor: 'default',
              overflow: 'hidden',
            }}
            onMouseEnter={(e) => {
              const rect = containerRef.current?.getBoundingClientRect();
              if (!rect) return;
              setTooltip({
                text: `${cell.domain}: ${cell.count}篇 (${cell.percent.toFixed(0)}%)`,
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
              });
            }}
            onMouseMove={(e) => {
              const rect = containerRef.current?.getBoundingClientRect();
              if (!rect) return;
              setTooltip((prev) =>
                prev ? { ...prev, x: e.clientX - rect.left, y: e.clientY - rect.top } : prev
              );
            }}
          >
            {showText && (
              <>
                <span style={{ color: '#fff', fontSize: 11, fontWeight: 700, lineHeight: 1.2, textAlign: 'center', padding: '0 2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                  {cell.domain}
                </span>
                <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 10, lineHeight: 1.2 }}>
                  {cell.percent.toFixed(0)}%
                </span>
              </>
            )}
          </div>
        );
      })}
      {tooltip && (
        <div
          style={{
            position: 'absolute',
            left: tooltip.x + 8,
            top: tooltip.y - 28,
            background: 'rgba(0,0,0,0.72)',
            color: '#fff',
            fontSize: 11,
            padding: '3px 7px',
            borderRadius: 4,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            zIndex: 10,
          }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
};

// ─── Word cloud (brain shape) ─────────────────────────────────────────────────

function extractKeywords(reviews: ReviewLike[]): Array<{ text: string; value: number }> {
  const freq = new Map<string, number>();
  const stopWords = new Set([
    '的','了','是','在','和','与','也','这','那','有','为','等','对','中','上','下',
    '不','人','个','年','月','日','一','来','到','从','以','但','因','而','其','已',
    '将','可','于','被','或','时','如','所','则','都','使','通过','进行','可以','没有',
    '需要','他们','我们','这个','这些','那些','什么','如何','已经','非常','主要','包括',
    'that','this','with','have','from','they','been','will','would','could','should',
    'more','also','into','their','about','which','when','then','than','some','such',
    'each','many','most','other','very','just','like','make','made','said',
  ]);
  reviews.forEach(r => {
    const body = (r.body || '') + ' ' + (r.description || '');
    const text = body.replace(/<[^>]+>/g, ' ').replace(/&[^;]+;/g, ' ');
    const zh = text.match(/[\u4e00-\u9fa5]{2,6}/g) || [];
    const en = text.match(/[a-zA-Z]{4,}/g) || [];
    [...zh, ...en].forEach(w => {
      if (!stopWords.has(w) && !stopWords.has(w.toLowerCase())) {
        freq.set(w, (freq.get(w) || 0) + 1);
      }
    });
  });
  return Array.from(freq.entries())
    .map(([text, value]) => ({ text, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 80);
}

const CANVAS_W = 360;
const CANVAS_H = 210;

interface WordEntry { text: string; value: number }

interface WordCloudCanvasProps {
  words: WordEntry[];
}

const WordCloudCanvas: React.FC<WordCloudCanvasProps> = ({ words }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = CANVAS_W * dpr;
    canvas.height = CANVAS_H * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const W = CANVAS_W;
    const H = CANVAS_H;

    // Build brain path helper
    const buildBrainPath = () => {
      ctx.beginPath();
      ctx.moveTo(W * 0.5, H * 0.1);
      ctx.bezierCurveTo(W * 0.42, H * 0.03, W * 0.18, H * 0.04, W * 0.08, H * 0.22);
      ctx.bezierCurveTo(W * 0.01, H * 0.38, W * 0.02, H * 0.62, W * 0.1, H * 0.76);
      ctx.bezierCurveTo(W * 0.18, H * 0.91, W * 0.36, H * 0.95, W * 0.46, H * 0.9);
      ctx.bezierCurveTo(W * 0.49, H * 0.96, W * 0.51, H * 0.96, W * 0.54, H * 0.9);
      ctx.bezierCurveTo(W * 0.64, H * 0.95, W * 0.82, H * 0.91, W * 0.9, H * 0.76);
      ctx.bezierCurveTo(W * 0.98, H * 0.62, W * 0.99, H * 0.38, W * 0.92, H * 0.22);
      ctx.bezierCurveTo(W * 0.82, H * 0.04, W * 0.58, H * 0.03, W * 0.5, H * 0.1);
      ctx.closePath();
    };

    // Draw background fill + stroke (before clip)
    buildBrainPath();
    ctx.fillStyle = 'rgba(255, 240, 224, 0.5)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 105, 0, 0.15)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Clip to brain shape
    ctx.save();
    buildBrainPath();
    ctx.clip();

    if (words.length === 0) {
      ctx.restore();
      return;
    }

    const maxValue = words[0].value;
    const limit = Math.min(words.length, 60);

    type PlacedBox = { x: number; y: number; w: number; h: number };
    const placed: PlacedBox[] = [];

    for (let wi = 0; wi < limit; wi++) {
      const { text, value } = words[wi];
      const t = value / maxValue;
      const fontSize = Math.min(10 + t * 26, 36);
      const fontWeight = value > maxValue * 0.4 ? 'bold' : 'normal';
      const r2 = Math.round(212 - 107 * t);
      const b2 = Math.round(184 - 184 * t);
      const color = `rgb(255, ${r2}, ${b2})`;

      ctx.font = `${fontWeight} ${fontSize}px sans-serif`;
      const tm = ctx.measureText(text);
      const tw = tm.width;
      const th = fontSize;

      let placed_flag = false;
      const maxR = Math.min(W, H) * 0.46;

      outerLoop:
      for (let r = 0; r <= maxR; r += 3) {
        const steps = r === 0 ? 1 : Math.max(8, Math.ceil(2 * Math.PI * r / 12));
        for (let si = 0; si < steps; si++) {
          const angle = (si / steps) * 2 * Math.PI + r * 0.4;
          const cx = W / 2 + r * Math.cos(angle);
          const cy = H / 2 + r * Math.sin(angle) * 0.73;
          const x = cx - tw / 2;
          const y = cy - th / 2;

          // Bounds check
          if (x <= 5 || x + tw >= W - 5 || y <= 5 || y + th >= H - 5) continue;

          // Approx brain shape check
          const normX = (cx - W * 0.5) / (W * 0.43);
          const normY = (cy - H * 0.52) / (H * 0.41);
          if (normX * normX + normY * normY >= 0.92) continue;

          // Overlap check
          let overlaps = false;
          for (const pb of placed) {
            if (
              x - 3 < pb.x + pb.w &&
              x + tw + 3 > pb.x &&
              y - 3 < pb.y + pb.h &&
              y + th + 3 > pb.y
            ) {
              overlaps = true;
              break;
            }
          }
          if (overlaps) continue;

          // Place word
          ctx.fillStyle = color;
          ctx.fillText(text, x, y + th * 0.85);
          placed.push({ x, y, w: tw, h: th });
          placed_flag = true;
          break outerLoop;
        }
      }

      // suppress unused variable warning
      void placed_flag;
    }

    ctx.restore();
  }, [words]);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  );
};

// ─── Main StatsPanel ──────────────────────────────────────────────────────────

interface ReviewLike {
  createdAt?: string;
  tags?: string[];
  body?: string;
  description?: string;
}

interface Props {
  reviews: ReviewLike[];
}

const CHART_H = 200;

const StatsPanel: React.FC<Props> = ({ reviews }) => {
  const [mode, setMode] = useState<PeriodMode>('week');
  const [customRange, setCustomRange] = useState<[Dayjs, Dayjs] | null>(null);

  const dateRange = useMemo((): [Dayjs, Dayjs] | null => {
    if (mode === 'week') return getWeekRange();
    if (mode === 'month') return getMonthRange();
    return customRange;
  }, [mode, customRange]);

  const periodReviews = useMemo(() => {
    if (!dateRange) return [];
    const [start, end] = dateRange;
    return reviews.filter(r => {
      const t = dayjs(r.createdAt);
      return !t.isBefore(start) && !t.isAfter(end);
    });
  }, [reviews, dateRange]);

  const domainBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    periodReviews.forEach(r => {
      const d = reviewDomain(r.tags ?? []);
      map.set(d, (map.get(d) || 0) + 1);
    });
    const total = periodReviews.length;
    return Array.from(map.entries())
      .map(([domain, count]) => ({
        domain,
        count,
        percent: total > 0 ? (count / total) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }, [periodReviews]);

  const keywords = useMemo(() => extractKeywords(periodReviews), [periodReviews]);

  const total = periodReviews.length;

  return (
    <div
      style={{
        marginBottom: 12,
        padding: '10px 14px',
        background: '#FFFAF0',
        border: '1px solid #FFE7BA',
        borderRadius: 8,
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: mode === 'custom' ? 8 : 10,
        }}
      >
        <Text style={{ fontSize: 12, color: '#888' }}>
          领域分布 · <Text style={{ color: '#FF6A00', fontWeight: 600 }}>{total}</Text> 篇
        </Text>
        <Radio.Group
          size="small"
          value={mode}
          onChange={e => setMode(e.target.value as PeriodMode)}
          buttonStyle="solid"
          optionType="button"
          options={[
            { label: '本周', value: 'week' },
            { label: '本月', value: 'month' },
            { label: '自定义', value: 'custom' },
          ]}
        />
      </div>

      {/* Custom range picker */}
      {mode === 'custom' && (
        <div style={{ marginBottom: 10 }}>
          <RangePicker
            size="small"
            style={{ width: '100%' }}
            value={customRange}
            onChange={val => {
              if (val && val[0] && val[1]) {
                setCustomRange([val[0].startOf('day'), val[1].endOf('day')]);
              } else {
                setCustomRange(null);
              }
            }}
            allowClear
          />
        </div>
      )}

      {/* Two-column content */}
      {total === 0 ? (
        <Text type="secondary" style={{ fontSize: 12 }}>暂无数据</Text>
      ) : (
        <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
          {/* Left: Mekko treemap */}
          <div style={{ flex: '0 0 58%' }}>
            <MekkoChart data={domainBreakdown} height={CHART_H} />
          </div>
          {/* Right: Word cloud */}
          <div style={{ flex: 1, minHeight: CHART_H }}>
            <WordCloudCanvas words={keywords} />
          </div>
        </div>
      )}
    </div>
  );
};

export default StatsPanel;
