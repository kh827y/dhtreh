import { redirect } from "next/navigation";

export default function BirthdaysAnalyticsRedirect() {
  redirect("/loyalty/mechanics/birthday?tab=stats");
}
