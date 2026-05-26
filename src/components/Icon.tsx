import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

// Travel-Expenses icon set — single-file registry, ported from
// .claude/skills/travel-expenses-design/ui-kit/icons.jsx.
// All icons: 24×24 viewBox, stroke 1.8 default, currentColor, rounded
// caps/joins.

const ICONS: Record<string, string> = {
  // ─── Categories — built-ins (8) ─────────────────────────
  food:
    'M4 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2 M8 2v20 ' +
    'M20 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3 M20 15v7',

  transport:
    'M5 16h14 M6.5 16l1-5.4A2 2 0 0 1 9.46 9h5.08a2 2 0 0 1 1.96 1.6L17.5 16 ' +
    'M4 16h16v3a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-1H8v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z',

  hotel:
    'M2 5v14 M2 19h20 M22 19v-7 M2 12h20 M5 12V9h4v3',

  flight:
    'M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 ' +
    'L4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 ' +
    'l3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.2.6-.6.5-1.1z',

  coffee:
    'M4 8h12v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z M16 10h2.5a2.5 2.5 0 0 1 0 5H16 ' +
    'M7.5 3.5c0 1.2.8 1.6.8 2.8s-.8 1.6-.8 2.7 M11.5 3.5c0 1.2.8 1.6.8 2.8s-.8 1.6-.8 2.7',

  shopping:
    'M5 8h14a1 1 0 0 1 1 1v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a1 1 0 0 1 1-1z ' +
    'M8.5 8V5.5a3.5 3.5 0 0 1 7 0V8',

  activities:
    'M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z',

  other:
    'M3 7.5l9-4.5 9 4.5v9l-9 4.5-9-4.5z M3 7.5l9 4.5 9-4.5 M12 12v9 M7.5 5.25l9 4.5',

  // ─── More categories — for user-custom buckets (22) ─────
  bar: 'M5 4h14l-7 8z M12 12v6 M9 18h6',
  groceries: 'M3 4h2 M5 4l3 12h10l2.5-9H7',
  gas: 'M4 22h10V3H4z M4 10h10 M14 10h3v9a2 2 0 0 1-2 2 M14 8v-2',
  taxi:
    'M5 17h14 M6 17l1-5h10l1 5 M9 6h6 M10 4v2 M14 4v2 ' +
    'M4 17h16v3a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-1H8v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z',
  train:
    'M5 5h14a1 1 0 0 1 1 1v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V6a1 1 0 0 1 1-1z M4 11h16 M7 21l-2 1 M17 21l2 1',
  bus:
    'M5 5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z M5 11h14 M8 21v1 M16 21v1',
  bike: 'M6 16l5-9h6 M14 7l4 9 M11 7h3',
  gift:
    'M4 9h16v4H4z M5 13h14v8H5z M12 9v12 ' +
    'M8 9c-2 0-3-2-2-3.5s3-.5 4 1.5v2 M16 9c2 0 3-2 2-3.5s-3-.5-4 1.5v2',
  entertainment: 'M3 9h18v12H3z M3 9l2-4h2l-2 4 M7 9l2-4h2l-2 4 M11 9l2-4h2l-2 4 M15 9l2-4h2l-2 4',
  music: 'M9 17V4l11-1v13',
  gym: 'M3 9v6 M5 6v12 M19 6v12 M21 9v6 M5 12h14',
  beach: 'M12 3v18 M3 11c1.5-5 5.5-7 9-7s7.5 2 9 7 M10 21h4',
  mountain: 'M3 20l5-9 4 6 3-3 6 6z',
  health: 'M9 3h6v6h6v6h-6v6h-6v-6H3V9h6z',
  phone: 'M7 2h10a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z M11 18h2',
  wifi: 'M2 9c5-5 15-5 20 0 M5 13c3-3 11-3 14 0 M9 17a3 3 0 0 1 6 0',
  laundry: 'M5 3h14v18H5z M5 8h14',
  tip:
    'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z ' +
    'M9 9h4a2 2 0 0 1 0 4h-2a2 2 0 0 0 0 4h4 M12 6v2 M12 16v2',
  book: 'M3 5c2-1 5-1 9 1 4-2 7-2 9-1v14c-2-1-5-1-9 1-4-2-7-2-9-1z M12 6v15',
  camera:
    'M4 7a2 2 0 0 1 2-2h2l2-2h4l2 2h2a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z',
  parking: 'M5 3h14v18H5z M9 7v10 M9 7h4a3 3 0 0 1 0 6H9',
  insurance: 'M12 2l9 4v6c0 5-3 9-9 10-6-1-9-5-9-10V6z M9 12l2 2 4-4',

  // ─── Nav ─────────────────────────────────────────────────
  list: 'M4 6h16 M4 12h16 M4 18h10 M3.5 5.8h0.5 M3.5 11.8h0.5 M3.5 17.8h0.5',
  'map-pin':
    'M12 22s7-7.5 7-13a7 7 0 0 0-14 0c0 5.5 7 13 7 13z M12 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  sparkles:
    'M11 3.5L13 9l5.5 2-5.5 2L11 18.5 9 13 3.5 11 9 9z ' +
    'M19 3l.8 2.2L22 6l-2.2.8L19 9l-.8-2.2L16 6l2.2-.8z',
  'bar-chart': 'M4 20h16 M7 16V9 M12 16V5 M17 16v-7',

  // ─── UI controls ─────────────────────────────────────────
  plus: 'M12 5v14 M5 12h14',
  x: 'M6 6l12 12 M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  'chevron-left': 'M14.5 18l-6-6 6-6',
  'chevron-right': 'M9.5 6l6 6-6 6',
  'chevron-down': 'M6 9.5l6 6 6-6',
  'chevron-up': 'M6 14.5l6-6 6 6',
  'arrow-right': 'M5 12h14 M13 6l6 6-6 6',
  'arrow-left': 'M19 12H5 M11 18l-6-6 6-6',
  'arrow-up': 'M12 19V5 M6 11l6-6 6 6',
  'arrow-down': 'M12 5v14 M6 13l6 6 6-6',
  backspace:
    'M22 4H9l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z M18 9l-6 6 M12 9l6 6',
  settings:
    'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4 ' +
    'a1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06 ' +
    'a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9 ' +
    'a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3 ' +
    'a2 2 0 0 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9 ' +
    'a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z ' +
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M20 20l-4.35-4.35',
  sync: 'M3 12a9 9 0 0 1 15.3-6.4L21 7 M21 3v4h-4 M21 12a9 9 0 0 1-15.3 6.4L3 17 M3 21v-4h4',
  edit: 'M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4z',
  trash:
    'M4 7h16 M9 7V4h6v3 M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13 M10 11v7 M14 11v7',
  more: 'M5 12h0.01 M12 12h0.01 M19 12h0.01',
  sun:
    'M12 4V2 M12 22v-2 M4 12H2 M22 12h-2 M5.5 5.5L4 4 M20 20l-1.5-1.5 M5.5 18.5L4 20 M20 4l-1.5 1.5 ' +
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  moon: 'M21 14a9 9 0 1 1-11-11 7 7 0 0 0 11 11z',
  bell:
    'M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9 M10 21a2 2 0 0 0 4 0',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21a8 8 0 0 1 16 0',
  users:
    'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M17 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z ' +
    'M2 21a7 7 0 0 1 14 0 M22 21a5 5 0 0 0-7-4.6',
  share:
    'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6z ' +
    'M8.6 13.5l6.8 4 M15.4 6.5l-6.8 4',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 8v0.01 M11 12h1v5h1',
  warn: 'M12 3 L22 20 H2 z M12 10v5 M12 17.5v0.01',
  filter: 'M3 5h18 M6 12h12 M10 19h4',
  external: 'M14 4h6v6 M20 4l-9 9 M20 14v6H4V4h6',

  // ─── Money / payment ─────────────────────────────────────
  cash:
    'M3 7.5h18a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1z ' +
    'M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z M5.5 10v4 M18.5 10v4',
  card: 'M3 7h18a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z M2 11h20 M6 16h3',
  bill:
    'M3 7h18a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z ' +
    'M10 10h3a1 1 0 0 1 0 2h-2a1 1 0 0 0 0 2h3 M12 9v7 M5 10v4 M19 10v4',
  'currency-swap': 'M3 7h14 M14 4l3 3-3 3 M21 17H7 M10 14l-3 3 3 3',
  wallet:
    'M3 7a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M17 12.5a1.5 1.5 0 1 0 0 .01z',
  receipt:
    'M6 3h12v15l-1.5 1.5l-1.5-1.5l-1.5 1.5l-1.5-1.5l-1.5 1.5l-1.5-1.5l-1.5 1.5l-1.5-1.5z ' +
    'M9 7.5h6 M9 11h6 M9 14.5h4',

  // ─── Status ──────────────────────────────────────────────
  refund: 'M9 14L4 9l5-5 M4 9h11a5 5 0 0 1 0 10h-4',
  exclude: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M5.6 5.6l12.8 12.8',
  calendar: 'M3 6.5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M3 10h18 M8 3v4 M16 3v4',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l3 2',
  lock: 'M6 11h12v9H6z M8 11V8a4 4 0 0 1 8 0v3',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  'eye-off':
    'M2 12s4-7 10-7c2.5 0 4.7 1.1 6.4 2.6 M22 12s-4 7-10 7c-2.5 0-4.7-1.1-6.4-2.6 M3 3l18 18',
  send: 'M22 2L11 13 M22 2l-7 20-4-9-9-4z',

  // ─── Brand / misc ────────────────────────────────────────
  globe:
    'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M3 12h18 ' +
    'M12 3c2.5 3 4 6.5 4 9s-1.5 6-4 9 M12 3c-2.5 3-4 6.5-4 9s1.5 6 4 9',
  photo:
    'M3 5h18v14H3z M3 17l5-5 4 4 3-3 6 6 M16 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
};

// Extra inline overlays — paths can't express disconnected circles/dashed
// lines cleanly. Keys mirror the EXTRAS block in ui-kit/icons.jsx.
interface Extra {
  shape: 'circle' | 'line';
  cx?: number;
  cy?: number;
  r?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  fill?: 'currentColor' | 'none';
  stroke?: 'currentColor';
  strokeWidth?: number;
  strokeDasharray?: string;
  strokeLinecap?: 'round';
}

const EXTRAS: Record<string, Extra[]> = {
  transport: [
    { shape: 'circle', cx: 8, cy: 18, r: 1.4, fill: 'currentColor' },
    { shape: 'circle', cx: 16, cy: 18, r: 1.4, fill: 'currentColor' },
  ],
  list: [
    { shape: 'circle', cx: 3.2, cy: 6, r: 0.6, fill: 'currentColor' },
    { shape: 'circle', cx: 3.2, cy: 12, r: 0.6, fill: 'currentColor' },
    { shape: 'circle', cx: 3.2, cy: 18, r: 0.6, fill: 'currentColor' },
  ],
  activities: [
    {
      shape: 'line',
      x1: 11,
      y1: 6,
      x2: 11,
      y2: 18,
      stroke: 'currentColor',
      strokeWidth: 1.4,
      strokeDasharray: '1.6 2',
      strokeLinecap: 'round',
    },
  ],
  groceries: [
    { shape: 'circle', cx: 9, cy: 20, r: 1.5, fill: 'currentColor' },
    { shape: 'circle', cx: 17, cy: 20, r: 1.5, fill: 'currentColor' },
  ],
  taxi: [
    { shape: 'circle', cx: 8, cy: 19, r: 1.3, fill: 'currentColor' },
    { shape: 'circle', cx: 16, cy: 19, r: 1.3, fill: 'currentColor' },
  ],
  train: [
    { shape: 'circle', cx: 8, cy: 14, r: 1.2, fill: 'currentColor' },
    { shape: 'circle', cx: 16, cy: 14, r: 1.2, fill: 'currentColor' },
  ],
  bus: [
    { shape: 'circle', cx: 8, cy: 19, r: 1.4, fill: 'currentColor' },
    { shape: 'circle', cx: 16, cy: 19, r: 1.4, fill: 'currentColor' },
  ],
  bike: [
    { shape: 'circle', cx: 6, cy: 17, r: 3, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 },
    { shape: 'circle', cx: 18, cy: 17, r: 3, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 },
  ],
  music: [
    { shape: 'circle', cx: 6, cy: 17, r: 3, fill: 'currentColor' },
    { shape: 'circle', cx: 17, cy: 16, r: 3, fill: 'currentColor' },
  ],
  laundry: [
    { shape: 'circle', cx: 8, cy: 6, r: 0.8, fill: 'currentColor' },
    { shape: 'circle', cx: 11, cy: 6, r: 0.8, fill: 'currentColor' },
    { shape: 'circle', cx: 14, cy: 15, r: 4, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 },
  ],
  wifi: [{ shape: 'circle', cx: 12, cy: 20, r: 1.1, fill: 'currentColor' }],
  mountain: [{ shape: 'circle', cx: 16, cy: 7, r: 2, fill: 'currentColor' }],
  camera: [{ shape: 'circle', cx: 12, cy: 13, r: 4, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 }],
};

export type IconName = keyof typeof ICONS | (string & {});

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  stroke?: number;
  style?: StyleProp<ViewStyle>;
}

export function Icon({ name, size = 24, color, stroke = 1.8, style }: IconProps) {
  const d = ICONS[name as string];
  if (!d) {
    return <Svg width={size} height={size} viewBox="0 0 24 24" style={style} />;
  }
  const extras = EXTRAS[name as string] ?? [];
  const tint = color ?? 'currentColor';
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={tint}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      <Path d={d} />
      {extras.map((e, i) => {
        if (e.shape === 'circle') {
          const cfill = e.fill === 'currentColor' ? tint : 'none';
          const cstroke = e.stroke === 'currentColor' ? tint : undefined;
          return (
            <Circle
              key={i}
              cx={e.cx}
              cy={e.cy}
              r={e.r}
              fill={cfill}
              stroke={cstroke}
              strokeWidth={e.strokeWidth}
            />
          );
        }
        return (
          <Line
            key={i}
            x1={e.x1}
            y1={e.y1}
            x2={e.x2}
            y2={e.y2}
            stroke={e.stroke === 'currentColor' ? tint : undefined}
            strokeWidth={e.strokeWidth}
            strokeDasharray={e.strokeDasharray}
            strokeLinecap={e.strokeLinecap}
          />
        );
      })}
    </Svg>
  );
}

// Maps default-category slugs to icons in the registry. Used by render-time
// helpers so default categories drop their emoji in favor of an SVG icon.
// Custom user categories (tripId !== null) are NOT in this map — they fall
// back to their stored emoji, which is allowed per the design system rule
// of "emoji only on user-supplied content".
export const DEFAULT_CATEGORY_ICONS: Record<string, IconName> = {
  food: 'food',
  transport: 'transport',
  hotel: 'hotel',
  flight: 'flight',
  coffee: 'coffee',
  shopping: 'shopping',
  activities: 'activities',
  other: 'other',
};
