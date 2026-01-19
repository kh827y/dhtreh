import { redirect } from "next/navigation";

type PageProps = {
  params: { customerId?: string };
};

export default function CustomerRedirectPage({ params }: PageProps) {
  const id = params?.customerId;
  if (!id) {
    redirect("/customers");
  }
  redirect(`/customers?customerId=${encodeURIComponent(id)}`);
}
