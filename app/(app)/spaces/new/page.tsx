import { PageHeader } from "@/components/shell/page-header";
import { CreateSpaceForm } from "@/components/space/create-space-form";

export default async function NewSpacePage({ searchParams }: PageProps<"/spaces/new">) {
  const sp = await searchParams;
  const type = sp.type === "course" ? "course" : "hackathon";
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : "";
  return (
    <>
      <PageHeader
        title="Create a Matching Space"
        description="One Space per hackathon edition, or per course + term + section set + assignment. We check for duplicates before creating."
      />
      <CreateSpaceForm initialType={type} initialQuery={q} />
    </>
  );
}
