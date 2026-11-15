import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Info, Lock } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { JoinSpaceForm } from "@/components/space/join-with-code";
import { SpaceFacts, SpaceHeader } from "@/components/space/space-header";
import { getSpace } from "@/lib/spaces";

export default async function SpaceDetailPage({ params }: PageProps<"/s/[slug]">) {
  const { slug } = await params;
  const space = await getSpace(slug);
  if (!space) notFound();

  return (
    <>
      <SpaceHeader space={space} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <SpaceFacts space={space} />
        <aside className="flex flex-col gap-4">
          <section data-space-id={space.id} className="rounded-xl border bg-card p-4 sm:p-5" aria-labelledby="join-heading">
            {space.is_member ? (
              <>
                <h2 id="join-heading" className="font-medium">You&apos;re in this Space</h2>
                <p className="mt-1 text-sm text-muted-foreground">Set your goals and visibility, then find teammates.</p>
                <div className="mt-4 flex flex-col gap-2">
                  <Link href={`/s/${space.slug}/discover`} className={buttonVariants()}>
                    Go to Space <ArrowRight data-icon="inline-end" aria-hidden />
                  </Link>
                  <Link href={`/s/${space.slug}/setup`} className={buttonVariants({ variant: "outline" })}>
                    Edit my preferences
                  </Link>
                </div>
              </>
            ) : space.status !== "open" ? (
              <>
                <h2 id="join-heading" className="font-medium">Not accepting new participants</h2>
                <p className="mt-1 text-sm text-muted-foreground">This Space is {space.status}.</p>
              </>
            ) : (
              <>
                <h2 id="join-heading" className="flex items-center gap-2 font-medium">
                  {space.requires_code && <Lock className="size-4 text-primary" aria-hidden />}
                  Join this Matching Space
                </h2>
                <p className="mb-4 mt-1 text-sm text-muted-foreground">
                  {space.requires_code
                    ? "This Space is invite-only. Enter the join code from a classmate."
                    : "Join to set your preferences and find teammates for this event."}
                </p>
                <JoinSpaceForm spaceId={space.id} requiresCode={space.requires_code} />
              </>
            )}
          </section>
          <p className="flex gap-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Joining is not event registration or proof of course enrollment. Eligibility and team rules are set by the
            organizer or instructor.
          </p>
        </aside>
      </div>
    </>
  );
}
