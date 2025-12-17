import { redirect } from "next/navigation";

export default function LegacyLevelRedirect() {
  redirect("/loyalty/mechanics/levels");
}
