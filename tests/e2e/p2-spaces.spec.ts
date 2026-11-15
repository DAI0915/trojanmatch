/**
 * P2 acceptance (A–J) with the two confirmed dev accounts, at 1440px and 375px.
 *
 * Names: locally (fresh DB) the desktop project uses the real names
 * ("TreeHacks 2027", "CSCI 567"); the mobile project uses its own names so both
 * can run in parallel. Against production set E2E_SPACE_TAG (letters only) so
 * real event names stay free for real students.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";

const PASSWORD = process.env.DEV_TEST_PASSWORD ?? "";
const RUN_TAG = (process.env.E2E_SPACE_TAG ?? "").replace(/[^a-z]/gi, "");

function names(project: string) {
  const t = `${project === "mobile" ? "Mobile" : ""}${RUN_TAG}`;
  const compact = t.toLowerCase();
  return {
    event: `TreeHacks${t ? ` ${t}` : ""}`, // edition year is a separate field
    url: compact ? `https://${compact}.treehacks.example.com` : "https://www.treehacks.com",
    courseCode: compact ? `CSCI 567 ${t}`.slice(0, 30) : "CSCI 567",
  };
}

async function signedInPage(browser: Browser, email: string, viewport: { width: number; height: number }) {
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

/** Submits the create form; if only "similar" Spaces are found, confirms it's different. */
async function submitCreate(page: Page) {
  await page.getByRole("button", { name: "Check for duplicates & create" }).click();
  const different = page.getByRole("button", { name: "No, it's different. Create Space" });
  await expect(page.getByText("Space created. You're its first participant.").first().or(different)).toBeVisible({ timeout: 20_000 });
  if (await different.isVisible()) {
    await expect(page.getByRole("heading", { name: "This Space already exists" })).toHaveCount(0);
    await different.click();
  }
  await expect(page).toHaveURL(/\/setup\?created=1/);
}

async function createHackathon(page: Page, n: ReturnType<typeof names>, year: number) {
  await page.goto(`/spaces/new?type=hackathon`);
  await page.getByLabel("Event name").fill(n.event);
  await page.getByLabel("Edition year").fill(String(year));
  await page.getByLabel("Host / organizer").fill("Stanford University");
  await page.getByLabel("Official URL").fill(n.url);
  await page.getByLabel("Start date").fill(`${year}-02-14`);
  await page.getByLabel("End date").fill(`${year}-02-16`);
  await page.getByLabel("Event time zone").selectOption("America/Los_Angeles");
  await submitCreate(page);
}

test.describe("P2 acceptance: Spaces, joining, participation", () => {
  test.skip(!PASSWORD, "DEV_TEST_PASSWORD not set");
  test.setTimeout(150_000);

  test("A–J end to end with two accounts", async ({ browser }, info) => {
    const viewport = info.project.use.viewport ?? { width: 1440, height: 900 };
    const n = names(info.project.name);
    const shots = (name: string) => `test-results/screens/p2-${name}-${info.project.name}.png`;

    const dev1 = await signedInPage(browser, "dev1@trojanmatch.test", viewport);
    const dev2 = await signedInPage(browser, "dev2@trojanmatch.test", viewport);

    // A. Search for TreeHacks 2027 → no such Space. On a fresh DB this is the empty state;
    //    on persistent environments similar earlier test Spaces may be listed, but never this one.
    await dev1.goto(`/spaces?type=hackathon&q=${encodeURIComponent(`${n.event} 2027`)}`);
    await expect(dev1.getByRole("link", { name: new RegExp(`^${escapeRe(n.event)} 2027`) })).toHaveCount(0);
    if (!RUN_TAG) await expect(dev1.getByRole("heading", { name: "No matching spaces found" }).first()).toBeVisible();
    await noHorizontalScroll(dev1);
    await dev1.screenshot({ path: shots("A-search-empty"), fullPage: true });

    // B. Create TreeHacks 2027 (from the empty-state CTA, which pre-fills the form).
    await dev1.getByRole("link", { name: "Create New Space" }).first().click();
    await expect(dev1.getByLabel("Event name")).toHaveValue(n.event);
    await expect(dev1.getByLabel("Edition year")).toHaveValue("2027");
    await noHorizontalScroll(dev1);
    await dev1.screenshot({ path: shots("B-create-form"), fullPage: true });
    await dev1.getByLabel("Official URL").fill(n.url);
    await dev1.getByLabel("Host / organizer").fill("Stanford University");
    await dev1.getByLabel("Start date").fill("2027-02-14");
    await dev1.getByLabel("End date").fill("2027-02-16");
    await dev1.getByLabel("Event time zone").selectOption("America/Los_Angeles");
    await submitCreate(dev1);

    // C. Creator is enrolled automatically.
    await expect(dev1).toHaveURL(/\/s\/[a-z0-9-]+\/setup\?created=1/);
    await expect(dev1.getByText("Space created. You're its first participant.").first()).toBeVisible();
    await expect(dev1.getByRole("heading", { level: 1 })).toHaveText(`${n.event} 2027`);
    const slug2027 = /\/s\/([a-z0-9-]+)\//.exec(dev1.url())![1];

    // E. Copy its link (read the displayed share URL).
    const inviteUrl = (await dev1.getByTestId("invite-url").innerText()).trim();
    expect(inviteUrl).toMatch(new RegExp(`/s/${slug2027}$`));
    await noHorizontalScroll(dev1);
    await dev1.screenshot({ path: shots("C-created-setup"), fullPage: true });

    // Save dev1's TreeHacks preferences: Competitive + visible to members.
    await dev1.getByRole("radio", { name: /Competitive/ }).click();
    await dev1.getByRole("switch", { name: "Show my profile to members of this Space" }).click();
    await dev1.getByRole("button", { name: "Save & continue" }).click();
    await expect(dev1).toHaveURL(new RegExp(`/s/${slug2027}/discover$`));
    await expect(dev1.getByTestId("participant-count")).toHaveText("1 member (you) · No teammates available yet");
    await expect(dev1.getByRole("heading", { name: "You're the first one here!" })).toBeVisible();
    await noHorizontalScroll(dev1);
    await dev1.screenshot({ path: shots("C-cold-start"), fullPage: true });

    // D. No team was created.
    await dev1.goto("/teams");
    await expect(dev1.getByRole("heading", { name: "No teams yet" })).toBeVisible();

    // F. Join with the second account via the shared link.
    const path = new URL(inviteUrl).pathname;
    await dev2.goto(path);
    await expect(dev2.getByRole("heading", { name: "Join this Matching Space" })).toBeVisible();
    await noHorizontalScroll(dev2);
    await dev2.screenshot({ path: shots("F-join"), fullPage: true });
    await dev2.getByRole("button", { name: "Join this Space" }).click();
    await expect(dev2).toHaveURL(new RegExp(`/s/${slug2027}/setup\\?joined=1`));
    await dev2.getByRole("button", { name: "Save & continue" }).click();
    await expect(dev2).toHaveURL(new RegExp(`/s/${slug2027}/discover$`));
    // Re-joining is idempotent (no duplicate participation).
    const rejoin = await dev2.request.post(`/api/spaces/${await spaceIdFromApi(dev2, slug2027)}/join`, {
      data: {},
      headers: { origin: new URL(dev2.url()).origin },
    });
    expect(rejoin.status()).toBe(200);
    expect((await rejoin.json()).joined).toBe(false);

    // G. Participant count is real.
    await dev1.goto(`/s/${slug2027}/discover`);
    await expect(dev1.getByTestId("participant-count")).toHaveText("2 participants in this Space");
    await dev2.goto(`/s/${slug2027}/discover`);
    await expect(dev2.getByTestId("participant-count")).toHaveText("2 participants in this Space");

    // H. TreeHacks 2026 is a distinct Space; a 2027 spelling variant is caught as a duplicate.
    await createHackathon(dev1, n, 2026);
    const slug2026 = /\/s\/([a-z0-9-]+)\//.exec(dev1.url())![1];
    expect(slug2026).not.toBe(slug2027);
    await expect(dev1.getByRole("heading", { level: 1 })).toHaveText(`${n.event} 2026`);

    await dev1.goto(`/spaces/new?type=hackathon`);
    await dev1.getByLabel("Event name").fill(n.event.replace("TreeHacks", "Tree Hacks"));
    await dev1.getByLabel("Edition year").fill("2027");
    await dev1.getByLabel("Start date").fill("2027-02-14");
    await dev1.getByLabel("End date").fill("2027-02-16");
    await dev1.getByRole("button", { name: "Check for duplicates & create" }).click();
    await expect(dev1.getByRole("heading", { name: "This Space already exists" })).toBeVisible();
    await expect(dev1.getByText(`${n.event} 2027`, { exact: true })).toBeVisible();
    await expect(dev1.getByRole("button", { name: /Create Space/ })).toHaveCount(0);
    await noHorizontalScroll(dev1);
    await dev1.screenshot({ path: shots("H-duplicate-review"), fullPage: true });

    await dev1.goto(`/spaces?type=hackathon&q=${encodeURIComponent(n.event)}`);
    await expect(dev1.getByRole("link", { name: new RegExp(`${n.event} 2027`) })).toBeVisible();
    await expect(dev1.getByRole("link", { name: new RegExp(`${n.event} 2026`) })).toBeVisible();

    // I. Create a Course Space (invite-only + join code by default) and join with a code.
    await dev1.goto(`/spaces/new?type=course`);
    await dev1.getByLabel("Course code").fill(n.courseCode);
    await dev1.getByLabel("Section(s)").fill("Section 1");
    await dev1.locator("#assignment_name").fill("Final Group Project");
    await dev1.getByLabel("Minimum team size").fill("3");
    await dev1.getByLabel("Maximum team size").fill("4");
    await dev1.getByLabel(/I confirmed this team size/).check();
    await expect(dev1.getByRole("radio", { name: /Invite-only/ })).toHaveAttribute("aria-checked", "true");
    await noHorizontalScroll(dev1);
    await submitCreate(dev1);
    const courseSlug = /\/s\/([a-z0-9-]+)\//.exec(dev1.url())![1];
    const joinCode = (await dev1.getByTestId("join-code").innerText()).trim();
    expect(joinCode).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    // dev1's course preferences: different goal, profile NOT visible.
    await dev1.getByRole("radio", { name: /Aim for an A/ }).click();
    await dev1.getByRole("button", { name: "Save & continue" }).click();
    await expect(dev1).toHaveURL(new RegExp(`/s/${courseSlug}/discover$`));

    // The invite-only course is not discoverable by dev2 before joining.
    await dev2.goto(`/spaces?type=course&q=${encodeURIComponent(n.courseCode)}`);
    await expect(dev2.getByRole("heading", { name: "Find your hackathon or course project" })).toBeVisible();
    await expect(dev2.getByRole("link", { name: new RegExp(`^${escapeRe(n.courseCode)} ·`, "i") })).toHaveCount(0);

    await dev2.goto(`/s/${courseSlug}`);
    await expect(dev2.getByText("This Space is invite-only.")).toBeVisible();
    await dev2.getByLabel("Join code").fill("WRONGCOD");
    await dev2.getByRole("button", { name: "Join this Space" }).click();
    await expect(dev2.getByRole("alert").filter({ hasText: "That join code is not correct." })).toBeVisible();
    await dev2.getByLabel("Join code").fill(joinCode.toLowerCase());
    await dev2.getByRole("button", { name: "Join this Space" }).click();
    await expect(dev2).toHaveURL(new RegExp(`/s/${courseSlug}/setup\\?joined=1`));
    await dev2.getByRole("button", { name: "Save & continue" }).click();
    await dev1.goto(`/s/${courseSlug}/discover`);
    await expect(dev1.getByTestId("participant-count")).toHaveText("2 participants in this Space");

    // J. Preferences and users do not leak across Spaces.
    await dev1.goto(`/s/${slug2027}/setup`);
    await expect(dev1.getByRole("radio", { name: /Competitive/ })).toHaveAttribute("aria-checked", "true");
    await expect(dev1.getByRole("switch", { name: "Show my profile to members of this Space" })).toBeChecked();
    await dev1.goto(`/s/${courseSlug}/setup`);
    await expect(dev1.getByRole("radio", { name: /Aim for an A/ })).toHaveAttribute("aria-checked", "true");
    await expect(dev1.getByRole("switch", { name: "Show my profile to members of this Space" })).not.toBeChecked();
    await dev1.goto(`/s/${slug2026}/setup`);
    await expect(dev1.getByRole("radio", { name: /Competitive/ })).toHaveAttribute("aria-checked", "false");

    // dev2 never joined TreeHacks 2026: member pages redirect, member APIs refuse.
    await dev2.goto(`/s/${slug2026}/discover`);
    await expect(dev2).toHaveURL(new RegExp(`/s/${slug2026}$`));
    const id2026 = await spaceIdFromApi(dev2, slug2026);
    const origin = { origin: new URL(dev2.url()).origin };
    expect((await dev2.request.get(`/api/spaces/${id2026}/invite-link`)).status()).toBe(403);
    expect((await dev2.request.get(`/api/spaces/${id2026}/participation`)).status()).toBe(403);
    const hijack = await dev2.request.put(`/api/spaces/${id2026}/participation`, {
      headers: origin,
      data: {
        goal: "competitive", goal_note: "", desired_roles: [], topics: [], availability_override: null,
        looking_for_team: true, accept_invites: true, smart_match_opt_in: true, visible_to_members: true, notes: "",
      },
    });
    expect(hijack.status()).toBe(403);

    // The Space Switcher lists only Spaces dev2 joined.
    await dev2.goto(`/s/${slug2027}/discover`);
    await dev2.getByRole("button", { name: "Change Matching Space" }).click();
    const menu = dev2.getByRole("menu");
    await expect(menu.getByRole("menuitem", { name: new RegExp(`${n.event} 2027`) })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: new RegExp(`^${escapeRe(n.courseCode)} ·`, "i") })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: new RegExp(`${n.event} 2026`) })).toHaveCount(0);
    await menu.getByRole("menuitem", { name: new RegExp(`^${escapeRe(n.courseCode)} ·`, "i") }).click();
    await expect(dev2).toHaveURL(new RegExp(`/s/${courseSlug}/discover$`));
    await dev2.screenshot({ path: shots("J-switcher"), fullPage: true });

    await dev1.context().close();
    await dev2.context().close();
  });

  test("global profile: structured fields save and persist", async ({ browser }, info) => {
    const viewport = info.project.use.viewport ?? { width: 1440, height: 900 };
    const email = info.project.name === "mobile" ? "dev2@trojanmatch.test" : "dev1@trojanmatch.test";
    const page = await signedInPage(browser, email, viewport);
    await page.goto("/profile");
    await expect(page.getByRole("heading", { name: "Your profile" })).toBeVisible();

    // Validation: empty display name is rejected client-side with an inline error.
    await page.getByLabel("Display name").fill("");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByText("Display name is required")).toBeVisible();

    const name = info.project.name === "mobile" ? "Dev Tester B" : "Dev Tester A";
    await page.getByLabel("Display name").fill(name);
    await page.getByLabel("University").fill("USC");
    for (const skill of ["Python", "React"]) {
      const chip = page.getByRole("button", { name: skill, exact: true });
      if ((await chip.getAttribute("aria-pressed")) !== "true") await chip.click();
    }
    await page.getByLabel("Add another skill").fill("Unity");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    const role = page.getByRole("button", { name: "Backend", exact: true });
    if ((await role.getAttribute("aria-pressed")) !== "true") await role.click();
    await page.getByRole("radio", { name: /Intermediate/ }).click();
    const interest = page.getByRole("button", { name: "Education", exact: true });
    if ((await interest.getAttribute("aria-pressed")) !== "true") await interest.click();
    await page.getByRole("radio", { name: "Iterate fast" }).click();
    const sat = page.getByRole("button", { name: "Sat 12p–4p" });
    if ((await sat.getAttribute("aria-pressed")) !== "true") await sat.click();
    await noHorizontalScroll(page);
    await page.screenshot({ path: `test-results/screens/p2-profile-${info.project.name}.png`, fullPage: true });
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByText("Profile saved.")).toBeVisible();

    await page.reload();
    await expect(page.getByRole("button", { name: "Python", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("listitem").filter({ hasText: "unity" })).toBeVisible();
    await expect(page.getByRole("radio", { name: /Intermediate/ })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("button", { name: "Sat 12p–4p" })).toHaveAttribute("aria-pressed", "true");
    // Private account credentials never appear on the page.
    await expect(page.locator("body")).not.toContainText(email);
    await page.context().close();
  });
});

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function spaceIdFromApi(page: Page, slug: string): Promise<string> {
  // Space ids are not secret; resolve via search (members) or the detail page markup.
  const res = await page.request.get(`/api/spaces?q=`);
  const all = ((await res.json()).spaces ?? []) as { id: string; slug: string }[];
  const hit = all.find((s) => s.slug === slug);
  if (hit) return hit.id;
  // Not a member and not public-listed: read the id from the join form field.
  await page.goto(`/s/${slug}`);
  const id = await page.locator("[data-space-id]").first().getAttribute("data-space-id");
  if (!id) throw new Error(`space id not found for ${slug}`);
  return id;
}
