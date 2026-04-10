import { redirect } from "next/navigation";

export default async function JournalPostRedirect({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/process/${slug}`);
}
