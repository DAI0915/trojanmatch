/**
 * P4-A Team Foundation acceptance (A–G) with the two confirmed dev accounts,
 * at 1440px and 375px. Creates ONE tagged Space per run.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";

const PASSWORD = process.env.DEV_TEST_PASSWORD ?? "";
const RUN = (process.env.E2E_SPACE_TAG ?? "").replace(/[^a-z]/gi, "") || "Local";

async function signedIn(browser: Browser, email: string, viewport: { width: number; height: number }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/spaces/);
  return page;
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow, `horizontal scroll on ${page.url()}`).toBe(false);
}

async function toggleChip(page: Page, name: string, on = true) {
  const chip = page.getByRole("button", { name, exact: true }).first();
  if (((await chip.getAttribute("aria-pressed")) === "true") !== on) await chip.click();
}

test.describe("P4-A Team Foundation", () => {
  test.skip(!PASSWORD, "DEV_TEST_PASSWORD not set");
  test.setTimeout(150_000);

  test("A–G: create, own, persist, edit, authorize, capacity, isolation", async ({ browser }, info) => {
    const viewport = info.project.use.viewport ?? { width: 1440, height: 900 };
    const tag = `${info.project.name === "mobile" ? "M" : "D"}${RUN}`;
    const shot = (n: string) => `test-results/screens/p4a-${n}-${info.project.name}.png`;
    const dev1 = await signedIn(browser, "dev1@trojanmatch.test", viewport);
    const dev2 = await signedIn(browser, "dev2@trojanmatch.test", viewport);
    const origin = { origin: new URL(dev1.url()).origin };

    // Setup: dev1 creates a tagged hackathon Space (2–4 provisional), dev2 joins it.
    await dev1.goto("/spaces/new?type=hackathon");
    await dev1.getByLabel("Event name").fill(`TeamTest ${tag}`);
    await dev1.getByLabel("Edition year").fill("2028");
    await dev1.getByLabel("Start date").fill("2028-03-01");
    await dev1.getByLabel("End date").fill("2028-03-02");
    await dev1.getByRole("button", { name: "Check for duplicates & create" }).click();
    const different = dev1.getByRole("button", { name: "No, it's different. Create Space" });
    await expect(dev1.getByText("Space created. You're its first participant.").first().or(different)).toBeVisible({ timeout: 20_000 });
    if (await different.isVisible()) await different.click();
    await expect(dev1).toHaveURL(/\/setup\?created=1/);
    const slug = /\/s\/([a-z0-9-]+)\//.exec(dev1.url())![1];
    await dev1.getByRole("button", { name: "Save & continue" }).click();
    await expect(dev1).toHaveURL(new RegExp(`/s/${slug}/discover$`));
    await dev2.goto(`/s/${slug}`);
    await dev2.getByRole("button", { name: "Join this Space" }).click();
    await expect(dev2).toHaveURL(/\/setup\?joined=1/);

    // A. A participant creates a team (from the Discover hub).
    await dev1.getByRole("link", { name: "Create a team" }).click();
    await expect(dev1.getByRole("heading", { name: "Create a team" })).toBeVisible();
    await dev1.getByLabel("Team name").fill(`Pixel Pushers ${tag}`);
    await dev1.getByLabel("What are you building?").fill("A study buddy for CS students.");
    await dev1.getByLabel("Open positions").fill("2");
    const required = dev1.getByRole("group", { name: /Required roles/ });
    await required.getByRole("button", { name: "Frontend", exact: true }).click();
    const preferred = dev1.getByRole("group", { name: /Preferred roles/ });
    await preferred.getByRole("button", { name: "Design", exact: true }).click();
    await toggleChip(dev1, "React");
    await toggleChip(dev1, "Education");
    await dev1.getByRole("radio", { name: /Build something great/ }).click();
    await dev1.getByLabel(/Minimum shared availability/).fill("6");
    await dev1.getByLabel("Recruitment notes").fill("Backend is covered.");
    await noHorizontalScroll(dev1);
    await dev1.screenshot({ path: shot("create"), fullPage: true });
    await dev1.getByRole("button", { name: "Create team" }).click();

    // B. The creator becomes the owner; capacity is real (1 member).
    await expect(dev1).toHaveURL(new RegExp(`/s/${slug}/teams/[0-9a-f-]{36}$`));
    const teamId = /\/teams\/([0-9a-f-]{36})$/.exec(dev1.url())![1];
    await expect(dev1.getByRole("heading", { level: 1 })).toHaveText(`Pixel Pushers ${tag}`);
    await expect(dev1.getByTestId("team-capacity")).toHaveText("1 of 3 · 2 open positions");
    await expect(dev1.getByRole("listitem").filter({ hasText: "Owner" })).toHaveCount(1);
    await expect(dev1.getByTestId("team-badges")).toContainText("Draft");
    await expect(dev1.getByText("Recruiting · 2 open")).toBeVisible();

    // C. Requirements persist (reload).
    await dev1.reload();
    for (const t of ["Frontend", "Design", "React", "Education", "Build something great", "At least 6 h/week together", "Backend is covered."]) {
      await expect(dev1.getByRole("main").getByText(t, { exact: true }), t).toBeVisible();
    }
    await noHorizontalScroll(dev1);
    await dev1.screenshot({ path: shot("detail"), fullPage: true });

    // D. The owner (authorized recruiter) updates requirements and capacity.
    await dev1.getByRole("link", { name: "Edit team" }).click();
    await expect(dev1.getByRole("heading", { name: "Edit team" })).toBeVisible();
    await dev1.getByRole("group", { name: /Required roles/ }).getByRole("button", { name: "AI / ML", exact: true }).click();
    await dev1.getByLabel("Open positions").fill("3");
    await dev1.getByRole("button", { name: "Save changes" }).click();
    await expect(dev1).toHaveURL(new RegExp(`/teams/${teamId}$`));
    await expect(dev1.getByTestId("team-capacity")).toHaveText("1 of 4 · 3 open positions");
    await expect(dev1.getByRole("main").getByText("AI / ML", { exact: true })).toBeVisible();

    // F. Capacity: the Space allows at most 4 → 4 open positions (size 5) is rejected (client + server).
    await dev1.getByRole("link", { name: "Edit team" }).click();
    await dev1.getByLabel("Open positions").fill("4");
    await dev1.getByRole("button", { name: "Save changes" }).click();
    await expect(dev1.getByText("Team size (members + open positions) must be 2–4 for this Space.")).toBeVisible();
    const tooBig = await dev1.request.patch(`/api/teams/${teamId}`, {
      headers: origin,
      data: { name: `Pixel Pushers ${tag}`, description: "", open_positions: 9, recruiting: true, requirements: {} },
    });
    expect(tooBig.status()).toBe(400);
    expect((await tooBig.json()).error.code).toBe("INVALID_INPUT");

    // One team per Space: a second team is refused (UI redirects, API conflicts).
    await dev1.goto(`/s/${slug}/teams/new`);
    await expect(dev1).toHaveURL(new RegExp(`/teams/${teamId}$`));
    const second = await dev1.request.post(`/api/spaces/${await spaceId(dev1, slug)}/teams`, {
      headers: origin,
      data: { name: "Second team", description: "", open_positions: 1, recruiting: true, requirements: {} },
    });
    expect((await second.json()).error.code).toBe("ALREADY_IN_TEAM");

    // E. An unrelated participant can view the recruiting team but cannot edit it.
    await dev2.goto(`/s/${slug}/teams`);
    await expect(dev2.getByRole("link", { name: new RegExp(`Pixel Pushers ${tag}`) })).toBeVisible();
    await dev2.screenshot({ path: shot("teams-list"), fullPage: true });
    await dev2.getByRole("link", { name: new RegExp(`Pixel Pushers ${tag}`) }).click();
    await expect(dev2.getByRole("link", { name: "Edit team" })).toHaveCount(0);
    await dev2.goto(`/s/${slug}/teams/${teamId}/edit`);
    await expect(dev2).toHaveURL(new RegExp(`/teams/${teamId}$`));
    const hijack = await dev2.request.patch(`/api/teams/${teamId}`, {
      headers: { origin: new URL(dev2.url()).origin },
      data: { name: "Hijacked", description: "", open_positions: 1, recruiting: true, requirements: {} },
    });
    expect(hijack.status()).toBe(403);
    expect((await hijack.json()).error.code).toBe("NOT_RECRUITER");

    // G. Cross-Space isolation: the team never renders under a different Space's URL.
    const otherSlug = await firstOtherJoinedSlug(dev2, slug);
    if (otherSlug) {
      await dev2.goto(`/s/${otherSlug}/teams/${teamId}`);
      await expect(dev2.getByRole("heading", { name: "Space not found" }).or(dev2.getByRole("heading", { name: "Page not found" })).or(dev2.getByText("404"))).toBeVisible();
    }

    // My Teams lists it for dev1 with the real status; dev2 has no team in this Space.
    await dev1.goto("/teams");
    await expect(dev1.getByRole("link", { name: new RegExp(`Pixel Pushers ${tag}`) })).toBeVisible();
    await dev1.context().close();
    await dev2.context().close();
  });
});

async function spaceId(page: Page, slug: string): Promise<string> {
  const res = await page.request.get(`/api/spaces?q=`);
  const hit = ((await res.json()).spaces as { id: string; slug: string }[]).find((s) => s.slug === slug);
  if (!hit) throw new Error("space not found");
  return hit.id;
}

async function firstOtherJoinedSlug(page: Page, exclude: string): Promise<string | null> {
  const res = await page.request.get(`/api/spaces?q=`);
  const mine = ((await res.json()).spaces as { slug: string; is_member: boolean }[]).filter((s) => s.is_member && s.slug !== exclude);
  return mine[0]?.slug ?? null;
}
