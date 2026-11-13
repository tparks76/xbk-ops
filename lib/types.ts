export type HoldStatus = "hold" | "offer_out" | "confirmed" | "released";
export type HoldKind = "show" | "rental";

export type Room = { id: string; name: string; sort: number };

export type Hold = {
  id: string;
  room_id: string;
  date: string; // YYYY-MM-DD
  rank: number | null;
  status: HoldStatus;
  kind: HoldKind;
  title: string;
  agent_name: string | null;
  agent_company: string | null;
  agent_email: string | null;
  notes: string | null;
  group_id: string | null;
  challenge_deadline: string | null;
  challenged_by: string | null;
  released_reason: string | null;
  placed_by: string;
  created_at: string;
  updated_at: string;
};

export type HoldEvent = {
  id: number;
  hold_id: string;
  room_id: string;
  date: string;
  action: string;
  detail: string | null;
  actor: string;
  created_at: string;
};

export type Staff = {
  email: string;
  name: string;
  role: string;
  canBook: boolean;
};

export const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  booker: "Booker",
  venue_manager: "Venue Manager",
  marketing: "Marketing",
  advance: "Advance",
  production: "Production",
  mod: "MOD",
};

export type Offer = {
  id: string;
  hold_ids: string[];
  room_id: string;
  title: string;
  agent_name: string | null;
  agent_company: string | null;
  agent_email: string | null;
  terms: unknown;
  status: "draft" | "sent" | "accepted" | "declined";
  created_by: string;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};
