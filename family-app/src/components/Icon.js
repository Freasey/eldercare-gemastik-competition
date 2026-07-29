/**
 * Ikon garis, dipindahkan apa adanya dari `mockup-keluarga/app.js`.
 * Semua digambar di kanvas 24x24 dengan stroke 1.8 supaya bobotnya seragam.
 *
 * Sengaja tidak memakai @expo/vector-icons: set ikon di mockup sudah dipilih
 * dan disetujui, dan menggambarnya sendiri membuat ukuran bundle tetap kecil.
 */
import { Circle, Line, Path, Polyline, Rect, Svg } from 'react-native-svg';
import { useColors } from '../theme/theme.js';

/** Tiap ikon adalah fungsi (props stroke) => elemen SVG. */
const SHAPES = {
  check: (p) => <Polyline {...p} points="20 6 9 17 4 12" />,
  clock: (p) => (
    <>
      <Circle {...p} cx="12" cy="12" r="9" />
      <Polyline {...p} points="12 7 12 12 15.5 14" />
    </>
  ),
  alert: (p) => (
    <>
      <Path {...p} d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <Line {...p} x1="12" y1="9" x2="12" y2="13.5" />
      <Line {...p} x1="12" y1="17" x2="12.01" y2="17" />
    </>
  ),
  minus: (p) => <Line {...p} x1="6" y1="12" x2="18" y2="12" />,
  pill: (p) => (
    <>
      <Path {...p} d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" />
      <Path {...p} d="m8.5 8.5 7 7" />
    </>
  ),
  walk: (p) => (
    <>
      <Circle {...p} cx="13" cy="4" r="1.6" />
      <Path {...p} d="m9 20 2.5-6-2-1.5V9l4-1.5 2.5 3 2.5 1" />
      <Path {...p} d="M11.5 13 8 16.5" />
    </>
  ),
  moon: (p) => <Path {...p} d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />,
  bed: (p) => (
    <>
      <Path {...p} d="M3 20V8m0 5h18v7" />
      <Path {...p} d="M21 13a3 3 0 0 0-3-3h-7v3" />
      <Circle {...p} cx="7" cy="11" r="2" />
    </>
  ),
  bowl: (p) => (
    <>
      <Path {...p} d="M3 11h18a9 9 0 0 1-18 0Z" />
      <Path {...p} d="M12 7c0-1.5-1.5-1.5-1.5-3" />
    </>
  ),
  stethoscope: (p) => (
    <>
      <Path {...p} d="M5 3v5a4 4 0 0 0 8 0V3" />
      <Path {...p} d="M9 12v3a5 5 0 0 0 10 0v-2" />
      <Circle {...p} cx="19" cy="10" r="2" />
    </>
  ),
  chat: (p) => <Path {...p} d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-5A8 8 0 1 1 21 12Z" />,
  phone: (p) => (
    <Path
      {...p}
      d="M6.6 3.5 9 3l2 4.5-2 1.5a12 12 0 0 0 6 6l1.5-2L21 15l-.5 2.4A2 2 0 0 1 18.4 19 15.5 15.5 0 0 1 5 5.6a2 2 0 0 1 1.6-2.1Z"
    />
  ),
  phoneOff: (p) => (
    <>
      <Path
        {...p}
        d="M6.6 3.5 9 3l2 4.5-2 1.5a12 12 0 0 0 6 6l1.5-2L21 15l-.5 2.4A2 2 0 0 1 18.4 19 15.5 15.5 0 0 1 5 5.6a2 2 0 0 1 1.6-2.1Z"
      />
      <Line {...p} x1="3" y1="3" x2="21" y2="21" />
    </>
  ),
  mic: (p) => (
    <>
      <Rect {...p} x="9" y="2.5" width="6" height="11" rx="3" />
      <Path {...p} d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <Line {...p} x1="12" y1="17.5" x2="12" y2="21" />
    </>
  ),
  micOff: (p) => (
    <>
      <Rect {...p} x="9" y="2.5" width="6" height="11" rx="3" />
      <Path {...p} d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <Line {...p} x1="12" y1="17.5" x2="12" y2="21" />
      <Line {...p} x1="3" y1="3" x2="21" y2="21" />
    </>
  ),
  speaker: (p) => (
    <>
      <Path {...p} d="M11 5 6.5 9H3v6h3.5L11 19Z" />
      <Path {...p} d="M15.5 8.5a5 5 0 0 1 0 7" />
      <Path {...p} d="M18.5 5.5a9 9 0 0 1 0 13" />
    </>
  ),
  chevron: (p) => <Polyline {...p} points="9 5 16 12 9 19" />,
  back: (p) => <Polyline {...p} points="15 5 8 12 15 19" />,
  plus: (p) => (
    <>
      <Line {...p} x1="12" y1="5" x2="12" y2="19" />
      <Line {...p} x1="5" y1="12" x2="19" y2="12" />
    </>
  ),
  close: (p) => (
    <>
      <Line {...p} x1="6" y1="6" x2="18" y2="18" />
      <Line {...p} x1="18" y1="6" x2="6" y2="18" />
    </>
  ),
  home: (p) => <Path {...p} d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1Z" />,
  calendar: (p) => (
    <>
      <Rect {...p} x="3" y="5" width="18" height="16" rx="2.5" />
      <Line {...p} x1="3" y1="10" x2="21" y2="10" />
      <Line {...p} x1="8" y1="3" x2="8" y2="6.5" />
      <Line {...p} x1="16" y1="3" x2="16" y2="6.5" />
    </>
  ),
  chart: (p) => (
    <>
      <Line {...p} x1="4" y1="20" x2="20" y2="20" />
      <Rect {...p} x="6" y="11" width="3.4" height="6" rx="1" />
      <Rect {...p} x="12" y="7" width="3.4" height="10" rx="1" />
    </>
  ),
  siren: (p) => (
    <>
      <Path {...p} d="M6 19v-6a6 6 0 0 1 12 0v6" />
      <Rect {...p} x="3.5" y="19" width="17" height="3" rx="1.5" />
      <Line {...p} x1="12" y1="3" x2="12" y2="5" />
      <Line {...p} x1="5" y1="6" x2="6.4" y2="7.4" />
      <Line {...p} x1="19" y1="6" x2="17.6" y2="7.4" />
    </>
  ),
  user: (p) => (
    <>
      <Circle {...p} cx="12" cy="8" r="3.6" />
      <Path {...p} d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  lock: (p) => (
    <>
      <Rect {...p} x="4.5" y="10.5" width="15" height="10" rx="2.5" />
      <Path {...p} d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" />
    </>
  ),
  shield: (p) => <Path {...p} d="M12 3 5 6v5.5c0 4.3 2.9 8.2 7 9.5 4.1-1.3 7-5.2 7-9.5V6Z" />,
  bell: (p) => (
    <>
      <Path {...p} d="M6.5 10a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5H5S6.5 14 6.5 10Z" />
      <Path {...p} d="M10 19a2.2 2.2 0 0 0 4 0" />
    </>
  ),
  heart: (p) => (
    <Path {...p} d="M12 20s-7.5-4.6-7.5-9.6A4.4 4.4 0 0 1 12 7.7a4.4 4.4 0 0 1 7.5 2.7C19.5 15.4 12 20 12 20Z" />
  ),
  sync: (p) => (
    <>
      <Path {...p} d="M4 11a8 8 0 0 1 13.3-5.9L20 7.5" />
      <Polyline {...p} points="20 3 20 8 15 8" />
      <Path {...p} d="M20 13a8 8 0 0 1-13.3 5.9L4 16.5" />
      <Polyline {...p} points="4 21 4 16 9 16" />
    </>
  ),
  battery: (p) => (
    <>
      <Rect {...p} x="2.5" y="7.5" width="16" height="9" rx="2.5" />
      <Path {...p} d="M21 11v2" />
    </>
  ),
  info: (p) => (
    <>
      <Circle {...p} cx="12" cy="12" r="9" />
      <Line {...p} x1="12" y1="11" x2="12" y2="16.5" />
      <Line {...p} x1="12" y1="7.7" x2="12.01" y2="7.7" />
    </>
  ),
  trash: (p) => (
    <>
      <Path {...p} d="M5 7h14" />
      <Path {...p} d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" />
      <Path {...p} d="M6.5 7 7.4 19a1.6 1.6 0 0 0 1.6 1.5h6a1.6 1.6 0 0 0 1.6-1.5L17.5 7" />
    </>
  ),
  edit: (p) => (
    <>
      <Path {...p} d="M4 20h4l10-10-4-4L4 16Z" />
      <Path {...p} d="m14.5 5.5 4 4" />
    </>
  ),
};

/** Logo Google — satu-satunya ikon berwarna solid, bukan garis. */
function GoogleMark({ size }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill="#4285F4"
        d="M21 12.2c0-.7-.06-1.2-.2-1.8H12v3.4h5.1a4.4 4.4 0 0 1-1.9 2.9v2.4h3.1c1.8-1.7 2.7-4.1 2.7-6.9Z"
      />
      <Path
        fill="#34A853"
        d="M12 21.5c2.4 0 4.5-.8 6-2.2l-3-2.3a5.6 5.6 0 0 1-8.4-3H3.5v2.4A9.5 9.5 0 0 0 12 21.5Z"
      />
      <Path fill="#FBBC05" d="M6.6 14a5.7 5.7 0 0 1 0-3.6V8H3.5a9.5 9.5 0 0 0 0 8.5Z" />
      <Path
        fill="#EA4335"
        d="M12 6.4c1.3 0 2.5.5 3.5 1.4l2.6-2.6A9.5 9.5 0 0 0 3.5 8l3.1 2.4A5.6 5.6 0 0 1 12 6.4Z"
      />
    </Svg>
  );
}

/**
 * @param {{name: string, size?: number, color?: string}} props
 */
export function Icon({ name, size = 18, color }) {
  const c = useColors();
  if (name === 'google') return <GoogleMark size={size} />;

  const shape = SHAPES[name];
  if (!shape) return null;

  const strokeProps = {
    stroke: color || c.ink,
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    fill: 'none',
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {shape(strokeProps)}
    </Svg>
  );
}
