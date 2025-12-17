import { redirect } from "next/navigation";

export default function LegacyLevelCreateRedirect() {
  redirect("/loyalty/mechanics/levels");
}
