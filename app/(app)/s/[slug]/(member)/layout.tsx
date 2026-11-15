import { notFound, redirect } from "next/navigation";
import { getSpace } from "@/lib/spaces";

/** Member-only Space pages. Non-members are sent to the Space detail/join page. */
export default async function SpaceMemberLayout({ children, params }: LayoutProps<"/s/[slug]">) {
  const { slug } = await params;
  const space = await getSpace(slug);
  if (!space) notFound();
  if (!space.is_member) redirect(`/s/${slug}`);
  return <>{children}</>;
}
