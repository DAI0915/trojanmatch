/**
 * The recruiter journey, exactly as a first-time visitor would click it:
 * landing → Try Interactive Demo → guide → Smart Team → compare → Replace →
 * invite → switch persona from the demo bar → accept → Active → chat → Kickoff.
 * Plus: two visitors at once, idle expiry, and the demo Gemini budget.
 * Runs at 1440px and 375px (demo-desktop / demo-mobile projects).
 */
import pg from "pg";
import { expect, test, type Browser, type Page } from "@playwright/test";

const DEMO_ON = process.env.DEMO_MODE_ENABLED === "true";
const fakeIp = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;

test.describe.configure({ mode: "serial" });

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow, `horizontal scroll on ${page.url()}`).toBe(false);
}

async function visitor(browser: Browser, viewport: { width: number; height: number }) {
  const context = await browser.newContext({ viewport, extraHTTPHeaders: { "x-forwarded-for": fakeIp() } });
  return { context, page: await context.newPage() };
}

const bar = (page: Page) => page.getByTestId("demo-bar");

/** Switch persona from the yellow demo bar (featured persona or "Act as <invitee>"). */
async function switchFromBar(page: Page, name: string) {
  await bar(page).getByRole("button", { name: /Switch persona/ }).click();
  const menu = page.getByRole("menu");
  const featured = menu.getByRole("menuitem").filter({ hasText: name });
  await featured.first().click();
  await expect(bar(page)).toContainText(`You are ${name}`, { timeout: 20_000 });
  await page.waitForLoadState("networkidle"); // full page load: let it hydrate before the next click
}

test.describe("Recruiter demo journey", () => {
  test.skip(!DEMO_ON, "DEMO_MODE_ENABLED is not true");
  test.setTimeout(300_000);

  test("landing → one click → Smart Team → invite → accept as teammates → Active → chat → AI Kickoff", async ({ browser }, info) => {
    const viewport = info.project.use.viewport ?? { width: 1440, height: 900 };
    const mobile = viewport.width < 768;
    const shot = (n: string) => `test-results/screens/recruiter-${n}-${info.project.name}.png`;
    const { context, page } = await visitor(browser, viewport);

    // 1. Landing: the demo is the primary call to action. No sign-up, no code.
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Try Interactive Demo" })).toBeVisible();
    await expect(page.getByText("No sign-up needed.")).toBeVisible();
    await noHorizontalScroll(page);
    await page.screenshot({ path: shot("landing"), fullPage: true });
    await page.getByRole("button", { name: "Try Interactive Demo" }).click();

    // 2. Straight into the app as Jordan, with the optional guide.
    await expect(page).toHaveURL(/\/spaces$/, { timeout: 30_000 });
    const headers = { origin: new URL(page.url()).origin };
    const guide = page.getByTestId("demo-guide");
    await expect(guide).toBeVisible();
    await expect(guide.getByRole("listitem")).toHaveCount(5);
    await expect(bar(page)).toContainText("You are Jordan Lee");
    await expect(bar(page)).toContainText("Synthetic data");
    await expect(guide).toHaveCSS("opacity", "1");
    await page.screenshot({ path: shot("guide"), fullPage: false });
    await guide.getByRole("link", { name: "Find the Space" }).click();
    await expect(guide).toHaveCount(0);
    await page.getByRole("link", { name: /AI@USC Hackathon 2026/ }).click();
    await page.waitForURL(/\/s\/[a-z0-9-]+\/discover$/);
    const slug = /\/s\/([a-z0-9-]+)\//.exec(page.url())![1];

    // 3. Smart Team Formation + whole-team vs individual ranking.
    await page.getByRole("link", { name: /^Smart Team Formation/ }).click();
    await page.getByRole("button", { name: "Generate recommended team" }).click();
    await expect(page.getByTestId("proposal")).toBeVisible({ timeout: 20_000 });
    await page.getByText("Compare with simple individual ranking").click();
    const baseline = page.getByTestId("baseline");
    await expect(baseline.getByRole("row", { name: /Whole-team optimization/ })).toBeVisible();
    await expect(baseline.getByRole("row", { name: /Top individuals/ })).toBeVisible();
    await noHorizontalScroll(page);
    await page.screenshot({ path: shot("smart"), fullPage: true });

    // 4. Replace a candidate (prefer Priya or Maya, so they can accept later).
    const firstCandidate = page.locator('[data-kind="candidate"]').first();
    const replaced = await firstCandidate.getByTestId("member-name").innerText();
    await firstCandidate.getByRole("button", { name: /^Replace / }).click();
    const options = page.getByTestId("replace-option");
    await expect(options.first()).toBeVisible({ timeout: 20_000 });
    const preferred = options.filter({ hasText: /Priya Raman|Maya Chen/ });
    const pick = (await preferred.count()) > 0 ? preferred.first() : options.first();
    await pick.getByRole("button", { name: /^Use .* instead$/ }).click();
    await expect(page.getByTestId("replace-summary")).toContainText(`Replaced ${replaced} with`);
    const invitees = await page.locator('[data-kind="candidate"]').getByTestId("member-name").allInnerTexts();
    expect(invitees).toHaveLength(3);

    // 5. Send invitations (explicit confirmation).
    const sendBar = page.getByTestId("send-invites");
    await sendBar.getByRole("button", { name: "Send 3 invitations" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Team name").fill("Recruiter Demo Team");
    await dialog.getByRole("button", { name: "Send invitations" }).click();
    await expect(page).toHaveURL(new RegExp(`/s/${slug}/teams/[0-9a-f-]{36}$`), { timeout: 20_000 });
    const teamUrl = new URL(page.url()).pathname;
    const teamId = teamUrl.split("/").pop()!;
    await expect(page.getByTestId("team-badges")).toContainText("Forming");

    // 6. Accept as each invitee, switching persona from the demo bar.
    for (const name of invitees) {
      await page.goto("/spaces");
      // Invitees are listed for the inviting team's owner (Jordan).
      if (!(await bar(page).innerText()).includes("You are Jordan Lee")) await switchFromBar(page, "Jordan Lee");
      await bar(page).getByRole("button", { name: /Switch persona/ }).click();
      const menu = page.getByRole("menu");
      const item = menu.getByRole("menuitem").filter({ hasText: name });
      await expect(item.first()).toBeVisible();
      if (name === invitees[0]) {
        await expect(menu).toHaveCSS("opacity", "1");
        await page.screenshot({ path: shot("switcher"), fullPage: false });
      }
      await item.first().click();
      await expect(page).toHaveURL(/\/invitations$/, { timeout: 20_000 });
      await expect(bar(page)).toContainText(`You are ${name}`);
      // Switching is a full page load: wait for hydration so the click reaches React's handler.
      await page.waitForLoadState("networkidle");
      const invite = page.getByTestId("incoming-invitation").filter({ hasText: "Recruiter Demo Team" });
      await invite.getByRole("button", { name: /^Accept/ }).click();
      await expect(page).toHaveURL(new RegExp(`${teamUrl}$`), { timeout: 20_000 });
    }
    await expect(page.getByTestId("team-badges")).toContainText("Active");
    await noHorizontalScroll(page);
    await page.screenshot({ path: shot("active"), fullPage: true });

    // 7. Workspace chat: the last invitee writes, Jordan reads it live.
    const last = invitees[invitees.length - 1];
    await page.getByRole("link", { name: "Open workspace" }).click();
    const live = async () =>
      expect(page.getByTestId("connection-status").and(page.locator('[data-state="live"]'))).toBeVisible({ timeout: 20_000 });
    await live();
    const text = `Hi team, ${last.split(" ")[0]} here. Excited to build this!`;
    await page.getByTestId("chat-input").fill(text);
    await page.getByTestId("chat-input").press("Enter");
    await expect(page.getByTestId("chat-message").filter({ hasText: text })).toHaveAttribute("data-mine", "true");
    await switchFromBar(page, "Jordan Lee");
    await page.goto(`${teamUrl}/workspace`);
    await live();
    await expect(page.getByTestId("chat-message").filter({ hasText: text }).getByTestId("chat-author")).toHaveText(last);

    // 8. AI Kickoff.
    if (mobile) await page.getByRole("tab", { name: "AI Kickoff" }).click();
    await page.getByRole("button", { name: "Generate kickoff" }).click();
    const kickoff = page.getByTestId("kickoff-content");
    await expect(kickoff).toBeVisible({ timeout: 45_000 });
    await noHorizontalScroll(page);
    await page.screenshot({ path: shot("kickoff"), fullPage: true });

    // 9. Gemini budget: repeated kickoffs in one sandbox fall back to the labeled template.
    if (!mobile) {
      const sources: { source: string; reason: string | null }[] = [];
      for (let i = 0; i < 5; i++) {
        const res = await page.request.post(`/api/teams/${teamId}/kickoff`, { headers, data: {} });
        expect(res.status(), await res.text()).toBe(201);
        const k = (await res.json()).kickoff;
        sources.push({ source: k.source, reason: k.brief.fallback_reason });
      }
      expect(sources.filter((s) => s.source === "llm").length).toBeLessThanOrEqual(3); // ≤4 per sandbox per hour, incl. the UI one
      expect(sources.some((s) => s.reason === "demo_limit")).toBe(true);
      // The per-team limit (6/hour) still applies on top.
      const sixth = await page.request.post(`/api/teams/${teamId}/kickoff`, { headers, data: {} });
      expect(sixth.status()).toBe(429);
    }

    await page.request.post("/api/demo/end", { headers, data: {} });
    await context.close();
  });

  test("two visitors at the same time get separate sandboxes and can't affect each other", async ({ browser }, info) => {
    const viewport = info.project.use.viewport ?? { width: 1440, height: 900 };
    const [a, b] = await Promise.all([visitor(browser, viewport), visitor(browser, viewport)]);
    await Promise.all([a.page.goto("/demo"), b.page.goto("/demo")]);
    await Promise.all([
      a.page.getByRole("button", { name: "Try Interactive Demo" }).click(),
      b.page.getByRole("button", { name: "Try Interactive Demo" }).click(),
    ]);
    await Promise.all([expect(a.page).toHaveURL(/\/spaces$/, { timeout: 30_000 }), expect(b.page).toHaveURL(/\/spaces$/, { timeout: 30_000 })]);
    const headers = { origin: new URL(a.page.url()).origin };
    const payload = (title: string) => ({
      type: "hackathon", title, edition_year: 2027, start_date: "2027-03-01", end_date: "2027-03-02",
      timezone: "America/Los_Angeles", format: "online", visibility: "public",
    });
    // Both create a Space at once.
    const [ca, cb] = await Promise.all([
      a.page.request.post("/api/spaces", { headers, data: payload("Visitor Alpha Hack") }),
      b.page.request.post("/api/spaces", { headers, data: payload("Visitor Beta Hack") }),
    ]);
    expect([ca.status(), cb.status()]).toEqual([201, 201]);
    const titles = async (p: Page) =>
      ((await (await p.request.get("/api/spaces?q=Visitor")).json()).spaces as { title: string }[]).map((s) => s.title);
    expect(await titles(a.page)).toEqual(["Visitor Alpha Hack 2027"]);
    expect(await titles(b.page)).toEqual(["Visitor Beta Hack 2027"]);

    // A restarts; B keeps its data and session.
    expect((await a.page.request.post("/api/demo/reset", { headers, data: {} })).status()).toBe(200);
    expect(await titles(a.page)).toEqual([]);
    expect(await titles(b.page)).toEqual(["Visitor Beta Hack 2027"]);
    // A's lease cookie can't drive B's sandbox: switching in A still lands in A's own sandbox.
    expect((await a.page.request.post("/api/demo/switch", { headers, data: { persona: "maya" } })).status()).toBe(200);
    expect(await titles(a.page)).toEqual([]);
    // A forged switch to a user id from another sandbox is refused.
    const bProfile = (await (await b.page.request.get("/api/profile")).json()).profile as { id: string };
    const forged = await a.page.request.post("/api/demo/switch", { headers, data: { userId: bProfile.id } });
    expect(forged.status()).toBe(400);

    for (const v of [a, b]) {
      await v.page.request.post("/api/demo/end", { headers, data: {} });
      await v.context.close();
    }
  });

  test("an idle session expires and the visitor is sent back to start a new one", async ({ browser }, info) => {
    const local = /localhost|127\.0\.0\.1/;
    test.skip(
      !process.env.SUPABASE_DB_URL || !local.test(process.env.SUPABASE_DB_URL) || !local.test(process.env.E2E_BASE_URL ?? "http://localhost:3000"),
      "needs a local app AND the local database (it ages a lease directly in the DB)",
    );
    const viewport = info.project.use.viewport ?? { width: 1440, height: 900 };
    const { context, page } = await visitor(browser, viewport);
    await page.goto("/demo");
    await page.getByRole("button", { name: "Try Interactive Demo" }).click();
    await expect(page).toHaveURL(/\/spaces$/, { timeout: 30_000 });
    const lease = (await context.cookies()).find((c) => c.name === "tm_demo_lease")!;
    const slot = Number(lease.value.split(".")[0]);
    expect(lease.httpOnly).toBe(true);

    const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
    await db.connect();
    await db.query(`update private.demo_slots set last_seen_at = now() - interval '31 minutes', updated_at = now() - interval '31 minutes' where slot = $1`, [slot]);
    await db.end();

    await page.goto("/spaces");
    await expect(page).toHaveURL(/\/demo\?expired=1/);
    await expect(page.getByText(/Your demo session ended/)).toBeVisible();
    expect((await page.request.get("/api/profile")).status()).toBe(401);
    // One click starts a fresh sandbox.
    await page.getByRole("button", { name: "Try Interactive Demo" }).click();
    await expect(page).toHaveURL(/\/spaces$/, { timeout: 30_000 });
    await page.request.post("/api/demo/end", { headers: { origin: new URL(page.url()).origin }, data: {} });
    await context.close();
  });
});
