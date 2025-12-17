import { redirect } from "next/navigation";

export default function LegacyLevelEditRedirect() {
  redirect("/loyalty/mechanics/levels");
}
