// Tickets sold over time, with lines for break-even and capacity. Plain SVG, no chart library.
export default function SalesChart({
  points,
  cap,
  breakEven,
  showDate,
}: {
  points: { at: string; sold: number }[];
  cap: number;
  breakEven: number | null;
  showDate: string;
}) {
  if (points.length === 0) return <div className="muted small">Add a count to start the chart.</div>;
  const W = 520;
  const H = 200;
  const pad = { l: 36, r: 10, t: 10, b: 24 };
  const t0 = Date.parse(points[0].at);
  const t1 = Math.max(Date.parse(`${showDate}T23:00:00Z`), Date.parse(points[points.length - 1].at), t0 + 864e5);
  const top = Math.max(cap, ...points.map((p) => p.sold), 1);
  const x = (ts: number) => pad.l + ((ts - t0) / (t1 - t0)) * (W - pad.l - pad.r);
  const y = (n: number) => H - pad.b - (n / top) * (H - pad.t - pad.b);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(Date.parse(p.at)).toFixed(1)},${y(p.sold).toFixed(1)}`).join(" ");
  const fmt = (ts: number) => new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="sales-chart" role="img" aria-label="Tickets sold over time">
      <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} className="axis" />
      {cap > 0 && (
        <>
          <line x1={pad.l} x2={W - pad.r} y1={y(cap)} y2={y(cap)} className="cap" />
          <text x={pad.l - 4} y={y(cap) + 4} textAnchor="end">
            {cap}
          </text>
        </>
      )}
      {breakEven !== null && (
        <>
          <line x1={pad.l} x2={W - pad.r} y1={y(breakEven)} y2={y(breakEven)} className="be" />
          <text x={W - pad.r} y={y(breakEven) - 4} textAnchor="end" className="be-label">
            break-even {breakEven}
          </text>
        </>
      )}
      <text x={pad.l - 4} y={y(0) + 4} textAnchor="end">
        0
      </text>
      <line x1={x(Date.parse(`${showDate}T23:00:00Z`))} x2={x(Date.parse(`${showDate}T23:00:00Z`))} y1={pad.t} y2={y(0)} className="show" />
      <path d={line} className="sold" />
      {points.map((p, i) => (
        <circle key={i} cx={x(Date.parse(p.at))} cy={y(p.sold)} r={3} className="dot">
          <title>{`${fmt(Date.parse(p.at))}: ${p.sold} sold`}</title>
        </circle>
      ))}
      <text x={pad.l} y={H - 6}>
        {fmt(t0)}
      </text>
      <text x={W - pad.r} y={H - 6} textAnchor="end">
        Show {fmt(Date.parse(`${showDate}T12:00:00Z`))}
      </text>
    </svg>
  );
}
