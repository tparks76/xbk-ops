"use client";

import { useRouter } from "next/navigation";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Jump straight to a month and year; keeps the current view and room filter.
export default function MonthPicker({
  m,
  view,
  room,
  thisYear,
}: {
  m: string;
  view: string;
  room: string;
  thisYear: number;
}) {
  const router = useRouter();
  const [y, mo] = m.split("-").map(Number);
  const start = Math.min(thisYear - 1, y);
  const end = Math.max(thisYear + 4, y);
  const years = Array.from({ length: end - start + 1 }, (_, i) => start + i);

  function go(year: number, month: number) {
    const p = new URLSearchParams({ m: `${year}-${String(month).padStart(2, "0")}`, view, room });
    router.push(`/?${p.toString()}`);
  }

  return (
    <div className="month-picker">
      <select aria-label="Month" value={mo} onChange={(e) => go(y, Number(e.target.value))}>
        {MONTHS.map((name, i) => (
          <option key={name} value={i + 1}>
            {name}
          </option>
        ))}
      </select>
      <select aria-label="Year" value={y} onChange={(e) => go(Number(e.target.value), mo)}>
        {years.map((yr) => (
          <option key={yr} value={yr}>
            {yr}
          </option>
        ))}
      </select>
    </div>
  );
}
