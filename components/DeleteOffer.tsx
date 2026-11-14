import { deleteOffer } from "@/lib/actions";

// Two-step delete: open, then confirm. The offer's holds stay on the calendar.
export default function DeleteOffer({ id, title, returnTo }: { id: string; title: string; returnTo: string }) {
  return (
    <details className="delete-offer">
      <summary>Delete</summary>
      <form action={deleteOffer} className="inline-form">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <span className="small">Delete the offer for {title}? Holds stay on the calendar.</span>
        <button className="danger">Yes, delete</button>
      </form>
    </details>
  );
}
