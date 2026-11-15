import { redirect } from "next/navigation";

// Moved to Settings.
export default function Moved() {
  redirect("/settings/staff");
}
