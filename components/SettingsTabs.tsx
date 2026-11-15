"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/settings/staff", label: "Staff" },
  { href: "/settings/venues", label: "Venues to watch" },
];

export default function SettingsTabs() {
  const path = usePathname();
  return (
    <nav className="settings-tabs">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className={path.startsWith(t.href) ? "on" : ""}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
