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

const STOP_WORDS = new Set([
  '的','了','是','在','和','与','也','这','那','有','为','等','对','中','上','下',
  '不','人','个','年','月','日','一','来','到','从','以','但','因','而','其','已',
  '将','可','于','被','或','时','如','所','则','都','使','通过','进行','可以','没有',
  '需要','他们','我们','这个','这些','那些','什么','如何','已经','非常','主要','包括',
  '发布','提供','支持','能够','目前','未来','实现','方面','相关','短评','目前','全面',
  'that','this','with','have','from','they','been','will','would','could','should',
  'more','also','into','their','about','which','when','then','than','some','such',
  'each','many','most','other','very','just','like','make','made','said','your',
  'model','models','using','used','user','users','open','based','data','large',
]);

function extractKeywords(reviews: ReviewLike[]): Array<{ text: string; value: number }> {
  const freq = new Map<string, number>();
  reviews.forEach(r => {
    // Include title (company field), body, and description
    const raw = [
      (r as any).company || '',
      r.body || '',
      r.description || '',
    ].join(' ');
    const text = raw.replace(/<[^>]+>/g, ' ').replace(/&[^;]+;/g, ' ').replace(/【[^】]+】/g, ' ');
    // Chinese: 2-5 chars
    const zh = text.match(/[\u4e00-\u9fa5]{2,5}/g) || [];
    // English: 3+ chars
    const en = text.match(/[a-zA-Z]{3,}/g) || [];
    const enSet = new Set(en);
    [...zh, ...en].forEach(w => {
      const key = enSet.has(w) ? w.toLowerCase() : w;
      if (!STOP_WORDS.has(w) && !STOP_WORDS.has(key) && key.length >= 2) {
        freq.set(key, (freq.get(key) || 0) + 1);
      }
    });
  });
  return Array.from(freq.entries())
    .map(([text, value]) => ({ text, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 120);
}

// Logical canvas dimensions
const CANVAS_W = 420;
const CANVAS_H = 240;

/**
 * Draw the two-lobe brain silhouette (dorsal view) on ctx.
 * W/H are the logical canvas dimensions.
 */
function traceBrainPath(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const p = (nx: number, ny: number): [number, number] => [nx * W, ny * H];
  ctx.beginPath();

  // ── top-center dip (interhemispheric fissure, front) ──
  ctx.moveTo(...p(0.500, 0.068));

  // ── left hemisphere ───────────────────────────────────
  // frontal pole
  ctx.bezierCurveTo(...p(0.390, 0.018), ...p(0.190, 0.026), ...p(0.090, 0.145));
  // frontal gyrus bump
  ctx.bezierCurveTo(...p(0.040, 0.210), ...p(0.015, 0.310), ...p(0.025, 0.410));
  // parietal
  ctx.bezierCurveTo(...p(0.010, 0.490), ...p(0.020, 0.580), ...p(0.070, 0.660));
  // parieto-occipital
  ctx.bezierCurveTo(...p(0.030, 0.730), ...p(0.070, 0.840), ...p(0.160, 0.900));
  // occipital pole
  ctx.bezierCurveTo(...p(0.255, 0.958), ...p(0.375, 0.970), ...p(0.462, 0.928));
  // bottom-center dip (interhemispheric fissure, rear)
  ctx.bezierCurveTo(...p(0.488, 0.970), ...p(0.512, 0.970), ...p(0.538, 0.928));

  // ── right hemisphere ──────────────────────────────────
  // occipital pole
  ctx.bezierCurveTo(...p(0.625, 0.970), ...p(0.745, 0.958), ...p(0.840, 0.900));
  // parieto-occipital
  ctx.bezierCurveTo(...p(0.930, 0.840), ...p(0.970, 0.730), ...p(0.930, 0.660));
  // parietal
  ctx.bezierCurveTo(...p(0.980, 0.580), ...p(0.990, 0.490), ...p(0.975, 0.410));
  // frontal gyrus bump
  ctx.bezierCurveTo(...p(0.985, 0.310), ...p(0.960, 0.210), ...p(0.910, 0.145));
  // frontal pole back to top-center
  ctx.bezierCurveTo(...p(0.810, 0.026), ...p(0.610, 0.018), ...p(0.500, 0.068));
  ctx.closePath();
}

/** Build a pixel-level mask for fast in-brain checks. */
function buildBrainMask(W: number, H: number): Uint8ClampedArray {
  const offscreen = document.createElement('canvas');
  offscreen.width = W;
  offscreen.height = H;
  const mctx = offscreen.getContext('2d')!;
  traceBrainPath(mctx, W, H);
  mctx.fillStyle = '#fff';
  mctx.fill();
  return mctx.getImageData(0, 0, W, H).data;
}

/** Check whether a word bounding-box (cx,cy centre) is fully inside the brain mask. */
function wordFitsInBrain(
  mask: Uint8ClampedArray, W: number, H: number,
  cx: number, cy: number, tw: number, th: number,
  pad = 4,
): boolean {
  const x0 = cx - tw / 2 - pad;
  const y0 = cy - th / 2 - pad;
  const x1 = cx + tw / 2 + pad;
  const y1 = cy + th / 2 + pad;
  // sample corners + midpoints of each edge
  const pts: [number, number][] = [
    [x0, y0], [x1, y0], [x0, y1], [x1, y1],
    [(x0 + x1) / 2, y0], [(x0 + x1) / 2, y1],
    [x0, (y0 + y1) / 2], [x1, (y0 + y1) / 2],
  ];
  for (const [px, py] of pts) {
    const ix = Math.round(px), iy = Math.round(py);
    if (ix < 0 || ix >= W || iy < 0 || iy >= H) return false;
    // alpha channel of white fill → 255 means inside
    if (mask[(iy * W + ix) * 4 + 3] < 128) return false;
  }
  return true;
}

interface WordEntry { text: string; value: number }
interface WordCloudCanvasProps { words: WordEntry[] }

const WordCloudCanvas: React.FC<WordCloudCanvasProps> = ({ words }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = CANVAS_W, H = CANVAS_H;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    // 1 · Draw brain background (no stroke — just a very faint fill)
    traceBrainPath(ctx, W, H);
    ctx.fillStyle = 'rgba(255, 237, 218, 0.55)';
    ctx.fill();

    if (words.length === 0) return;

    // 2 · Build pixel mask at logical resolution for accurate boundary detection
    const mask = buildBrainMask(W, H);

    // 3 · Clip to brain so words at the edges are naturally trimmed
    ctx.save();
    traceBrainPath(ctx, W, H);
    ctx.clip();

    const maxVal = words[0].value;
    type Box = { x: number; y: number; w: number; h: number };
    const placed: Box[] = [];

    const maxR = Math.min(W, H) * 0.47;

    for (let wi = 0; wi < Math.min(words.length, 100); wi++) {
      const { text, value } = words[wi];
      const t = value / maxVal;                              // 1 = most frequent
      const fontSize = Math.round(11 + t * 30);             // 11 – 41 px
      const bold = t > 0.35;
      // gradient: deep orange (#FF6900) → light peach (#FFDCBC)
      const g = Math.round(105 + (220 - 105) * (1 - t));
      const b = Math.round(0   + (188 -   0) * (1 - t));
      const color = `rgb(255,${g},${b})`;

      ctx.font = `${bold ? 700 : 400} ${fontSize}px "Microsoft YaHei",sans-serif`;
      const tw = ctx.measureText(text).width;
      const th = fontSize * 1.15;

      // phase offset per word index so consecutive words spread differently
      const phase = wi * 1.618;   // golden-angle-ish

      let placed_ = false;
      outer:
      for (let r = 0; r <= maxR && !placed_; r += 1.5) {
        const circ = Math.max(1, 2 * Math.PI * r);
        const steps = r < 2 ? 1 : Math.max(16, Math.ceil(circ / 7));
        for (let si = 0; si < steps && !placed_; si++) {
          const angle = (si / steps) * 2 * Math.PI + phase + r * 0.45;
          const cx = W / 2 + r * Math.cos(angle);
          const cy = H / 2 + r * Math.sin(angle) * 0.78;  // slight vertical squeeze

          if (!wordFitsInBrain(mask, W, H, cx, cy, tw, th)) continue;

          // Overlap check (2 px gap)
          const x0 = cx - tw / 2, y0 = cy - th / 2;
          let hit = false;
          for (const pb of placed) {
            if (x0 - 2 < pb.x + pb.w && x0 + tw + 2 > pb.x &&
                y0 - 2 < pb.y + pb.h && y0 + th + 2 > pb.y) {
              hit = true; break;
            }
          }
          if (hit) continue;

          ctx.fillStyle = color;
          ctx.fillText(text, x0, y0 + th * 0.82);
          placed.push({ x: x0, y: y0, w: tw, h: th });
          placed_ = true;
          break outer;
        }
      }
    }

    ctx.restore();
  }, [words]);

  useEffect(() => { draw(); }, [draw]);

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

      {total === 0 ? (
        <Text type="secondary" style={{ fontSize: 12 }}>暂无数据</Text>
      ) : (
        <MekkoChart data={domainBreakdown} height={CHART_H} />
      )}
    </div>
  );
};

export default StatsPanel;
