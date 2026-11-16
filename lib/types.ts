export type HoldStatus = "hold" | "offer_out" | "confirmed" | "released";
export type HoldKind = "show" | "rental" | "promoter" | "copro";

export const KIND_LABEL: Record<HoldKind, string> = { show: "Show", rental: "Private Rental", promoter: "Promoter Rental", copro: "Co-Pro" };
// Short tag for calendar chips.
export const KIND_TAG: Record<HoldKind, string> = { show: "", rental: "Rental", promoter: "Promoter", copro: "Co-Pro" };
export const parseKind = (v: string): HoldKind =>
  v === "rental" || v === "promoter" || v === "copro" ? v : "show";
// Hold types whose form hasn't been built yet.
export const FORM_PENDING: HoldKind[] = ["promoter", "copro"];

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
  artist_id?: string | null;
  drive_folder_url?: string | null;
  drive_note?: string | null;
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

export type DateNote = {
  id: string;
  date: string;
  body: string;
  source?: string; // "manual" or "ticketmaster"
  venue?: string | null;
  url?: string | null;
  hidden?: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type Rental = {
  id: string;
  hold_ids: string[];
  room_id: string;
  title: string; // client / organization
  contact_name: string | null;
  contact_email: string | null;
  event_date: string | null;
  details: unknown;
  status: "draft" | "sent" | "signed" | "cancelled";
  created_by: string;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Artist = {
  id: string;
  name: string;
  key: string;
  aliases: string[];
  genres: string[];
  image_url: string | null;
  deezer_id: string | null;
  not_on_deezer?: boolean;
  musicbrainz_id: string | null;
  links: Record<string, string>;
  agent_name: string | null;
  agent_company: string | null;
  agent_email: string | null;
  notes: string | null;
  looked_up_at: string | null;
  lookup_note: string | null;
  created_at: string;
  updated_at: string;
};
