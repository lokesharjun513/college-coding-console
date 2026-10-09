/* Sparkline Chart Component */
export default function Sparkline({ data, color }) {
  if (!data || data.length < 2) return null;
  const maxVal = Math.max(...data, 1);

  // Smooth cubic bezier path generation
  const points = data.map((val, i) => ({
    x: (i / (data.length - 1)) * 200,
    y: 42 - (val / maxVal) * 36
  }));

  let d = `M ${points[0].x} ${points[0].y}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const cp1x = p0.x + (p1.x - p0.x) / 2;
    d += ` C ${cp1x} ${p0.y}, ${cp1x} ${p1.y}, ${p1.x} ${p1.y}`;
  }

  const areaPath = `${d} L 200 42 L 0 42 Z`;

  return (
    <svg width="100%" height="100%" viewBox="0 0 200 42" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`gradient-${color}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#gradient-${color})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
