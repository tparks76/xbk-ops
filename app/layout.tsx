import type { Metadata } from "next";
import Link from "next/link";
import { getStaff } from "@/lib/session";
import { signOut } from "@/lib/actions";
import { ROLE_LABELS } from "@/lib/types";
import "./globals.css";

export const metadata: Metadata = {
  title: "xBk Ops",
  description: "Booking calendar for xBk, The Annex and Ideal Dress Club",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const staff = await getStaff();
  return (
    <html lang="en">
      <body>
        {staff && (
          <header className="topbar">
            <Link href="/" className="brand">
              xBk Ops
            </Link>
            <nav>
              <Link href="/">Calendar</Link>
              <Link href="/action-list">Action list</Link>
              {staff.canBook && <Link href="/new">+ New hold</Link>}
            </nav>
            <div className="who">
              {staff.name} · {ROLE_LABELS[staff.role] ?? staff.role}
              <form action={signOut}>
                <button className="link">Sign out</button>
              </form>
            </div>
          </header>
        )}
        <main>{children}</main>
      </body>
    </html>
  );
}
