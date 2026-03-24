import { redirect } from "next/navigation";

export default async function StudioRequestRedirect({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  redirect(`/studio?project=${encodeURIComponent(reference)}`);
}
