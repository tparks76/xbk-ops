import { deleteRental } from "@/lib/actions";

// Two-step delete: open, then confirm. The rental's holds stay on the calendar.
export default function DeleteRental({ id, title, returnTo }: { id: string; title: string; returnTo: string }) {
  return (
    <details className="delete-offer">
      <summary>Delete</summary>
      <form action={deleteRental} className="inline-form">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <span className="small">Delete the rental for {title}? Holds stay on the calendar.</span>
        <button className="danger">Yes, delete</button>
      </form>
    </details>
  );
}
