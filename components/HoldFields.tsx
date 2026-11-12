import type { Hold } from "@/lib/types";

// Artist, type, agent and notes fields shared by the new-hold and edit forms.
export default function HoldFields({ hold }: { hold?: Partial<Hold> }) {
  return (
    <>
      <div className="row">
        <label>
          Artist or event
          <input name="title" required defaultValue={hold?.title ?? ""} placeholder="e.g. Wednesday" />
        </label>
        <label style={{ flex: "0 0 140px" }}>
          Type
          <select name="kind" defaultValue={hold?.kind ?? "show"}>
            <option value="show">Show</option>
            <option value="rental">Rental</option>
          </select>
        </label>
      </div>
      <div className="row">
        <label>
          Agent / contact
          <input name="agent_name" defaultValue={hold?.agent_name ?? ""} />
        </label>
        <label>
          Agency / company
          <input name="agent_company" defaultValue={hold?.agent_company ?? ""} />
        </label>
      </div>
      <label>
        Email
        <input name="agent_email" type="email" defaultValue={hold?.agent_email ?? ""} />
      </label>
      <label>
        Notes
        <textarea
          name="notes"
          rows={3}
          defaultValue={hold?.notes ?? ""}
          placeholder="Routing, draw estimate, ticket price, rental details…"
        />
      </label>
    </>
  );
}
