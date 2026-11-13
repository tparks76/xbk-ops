"use client";

export default function PrintButton() {
  return (
    <button className="primary" onClick={() => window.print()}>
      Print / Save as PDF
    </button>
  );
}
