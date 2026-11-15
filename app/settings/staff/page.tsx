import Flash from "@/components/Flash";
import { saveStaff } from "@/lib/actions";
import { requireStaff } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABELS } from "@/lib/types";

type Row = { email: string; name: string; role: string; active: boolean };
type Search = Promise<{ ok?: string; error?: string }>;

function RoleSelect({ value, disabled }: { value: string; disabled?: boolean }) {
  return (
    <select name="role" defaultValue={value} aria-label="Role" disabled={disabled}>
      {Object.entries(ROLE_LABELS).map(([k, v]) => (
        <option key={k} value={k}>
          {v}
        </option>
      ))}
    </select>
  );
}

// Everyone who can sign in. Owners can add people and change names, roles and access.
export default async function StaffPage({ searchParams }: { searchParams: Search }) {
  const me = await requireStaff();
  const sp = await searchParams;
  const owner = me.role === "owner";
  const supabase = await createClient();
  const { data } = await supabase.from("staff").select("email,name,role,active").order("active", { ascending: false }).order("name");
  const rows = (data ?? []) as Row[];

  return (
    <>
      <div className="day-head">
        <h1>Staff</h1>
      </div>
      <p className="muted" style={{ marginTop: -6 }}>
        Everyone here can sign in with Microsoft using the email shown. Owners and bookers can place holds, offers and rentals.
        The name is what prints on offers and rental contracts.
        {!owner && " Only an owner can make changes."}
      </p>
      <Flash ok={sp.ok} error={sp.error} />

      <div className="panel">
        <div className="staff-row staff-head">
          <span>Name</span>
          <span>Email (sign-in)</span>
          <span>Role</span>
          <span>Active</span>
          <span />
        </div>
        {rows.map((r) => {
          const self = r.email === me.email;
          return (
            <form key={r.email} action={saveStaff} className={`staff-row ${r.active ? "" : "inactive"}`}>
              <input type="hidden" name="returnTo" value="/settings/staff" />
              <input type="hidden" name="email" value={r.email} />
              <input name="name" defaultValue={r.name} aria-label="Name" required disabled={!owner} />
              <span className="small">{r.email}</span>
              {/* Owners can't change their own role or access, so they can't lock themselves out. */}
              {self ? (
                <>
                  <input type="hidden" name="role" value={r.role} />
                  <span className="small">{ROLE_LABELS[r.role] ?? r.role} (you)</span>
                  <input type="hidden" name="active" value="1" />
                  <span className="small">Yes</span>
                </>
              ) : (
                <>
                  <RoleSelect value={r.role} disabled={!owner} />
                  <select name="active" defaultValue={r.active ? "1" : "0"} aria-label="Active" disabled={!owner}>
                    <option value="1">Yes</option>
                    <option value="0">No (can’t sign in)</option>
                  </select>
                </>
              )}
              {owner ? <button>Save</button> : <span />}
            </form>
          );
        })}

        {owner && (
          <>
            <h2 style={{ marginTop: 18 }}>Add someone</h2>
            <form action={saveStaff} className="staff-row">
              <input type="hidden" name="returnTo" value="/settings/staff" />
              <input type="hidden" name="new" value="1" />
              <input type="hidden" name="active" value="1" />
              <input name="name" placeholder="Full name" aria-label="Name" required />
              <input name="email" type="email" placeholder="name@xbklive.com" aria-label="Email" required />
              <RoleSelect value="mod" />
              <span />
              <button className="primary">Add</button>
            </form>
            <div className="muted small" style={{ marginTop: 6 }}>
              To remove someone, set Active to No. They stay in the list so their past holds keep their name.
            </div>
          </>
        )}
      </div>
    </>
  );
}
