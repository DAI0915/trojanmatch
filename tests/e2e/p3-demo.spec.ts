/**
 * Public, password-free demo (per-visitor sandboxes), end to end at 1440px and 375px.
 * Each browser context uses its own fake client IP (x-forwarded-for) so per-visitor
 * throttles don't interfere between tests. DEV_TEST_PASSWORD enables the prod-side check.
 */
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

const DEMO_ON = process.env.DEMO_MODE_ENABLED === "true";
const fakeIp = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;
const DEV_PASSWORD = process.env.DEV_TEST_PASSWORD ?? "";

test.describe.configure({ mode: "serial" });

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow, `horizontal scroll on ${page.url()}`).toBe(false);
}

async function startDemo(browser: Browser, viewport: { width: number; height: number }, ip = fakeIp()) {
  const context = await browser.newContext({ viewport, extraHTTPHeaders: { "x-forwarded-for": ip } });
  const page = await context.newPage();
  await page.goto("/demo");
  await page.getByRole("button", { name: "Try Interactive Demo" }).click();
  await expect(page).toHaveURL(/\/spaces$/, { timeout: 30_000 });
  // The optional guide opens once after a new start.
  const guide = page.getByTestId("demo-guide");
  await expect(guide).toBeVisible();
  await guide.getByRole("button", { name: "Start exploring" }).click();
  await expect(guide).toHaveCount(0);
  return { context, page };
}

async function switchVia(page: Page, button: RegExp, fullName: string) {
  await page.goto("/demo");
  await page.getByRole("button", { name: button }).click();
  await expect(page).toHaveURL(/\/spaces$/);
  await expect(page.getByRole("status").filter({ hasText: "Demo Mode" })).toContainText(`You are ${fullName}`);
}

async function openNav(page: Page, viewportWidth: number) {
  if (viewportWidth < 1024) await page.getByRole("button", { name: "Open navigation" }).click();
}

test.describe("Public demo sandboxes", () => {
  test.skip(!DEMO_ON, "DEMO_MODE_ENABLED is not true");
  test.setTimeout(180_000);

  test("rejects unauthorized demo requests", async ({ playwright, baseURL }) => {
    const api = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { origin: new URL(baseURL!).origin } });
    for (const path of ["/api/demo/switch", "/api/demo/reset", "/api/demo/simulate-joins"]) {
      const res = await api.post(path, { data: { persona: "maya", spaceId: crypto.randomUUID(), count: 1 } });
      expect(res.status(), path).toBe(401);
      expect((await res.json()).error.code).toBe("DEMO_LEASE_INVALID");
    }
    // A forged/foreign lease cookie is rejected too.
    const forged = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { origin: new URL(baseURL!).origin, cookie: `tm_demo_lease=1.${"A".repeat(43)}` },
    });
    expect((await forged.post("/api/demo/reset", { data: {} })).status()).toBe(401);
    // Cross-origin bootstrap is refused (no sandbox is created for another site).
    const xorigin = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { origin: "https://evil.example" } });
    expect((await xorigin.post("/api/demo/start", { data: {} })).status()).toBe(403);
    await forged.dispose();
    await api.dispose();
    await xorigin.dispose();
  });

  test("start → labels → isolation → create → simulate → switch → persist → reset → re-lease", async ({ browser }, info) => {
    const viewport = info.project.use.viewport ?? { width: 1440, height: 900 };
    const shot = (n: string) => `test-results/screens/p3-${n}-${info.project.name}.png`;
    const { context, page } = await startDemo(browser, viewport);

    // Presenter authentication + synthetic labeling.
    const banner = page.getByRole("status").filter({ hasText: "Demo Mode" });
    await expect(banner).toContainText("You are Jordan Lee");
    await noHorizontalScroll(page);
    await page.screenshot({ path: shot("spaces"), fullPage: true });

    // The seeded hackathon shows real counts, all labeled synthetic.
    await page.goto("/spaces?type=hackathon&q=AI%40USC");
    await page.getByRole("link", { name: /AI@USC Hackathon 2026/ }).click();
    await expect(page.getByTestId("participant-count")).toHaveText("32 participants · 4 teams recruiting");
    await expect(page.getByText("Demo sandbox · synthetic").first()).toBeVisible();
    await page.getByTestId("event-details").locator("summary").click();
    await expect(page.getByTestId("event-details")).toContainText("32 students (32 synthetic)");

    // Scope isolation: no TreeHacks 2027 yet in the sandbox (even if prod has one), and prod test Spaces are invisible.
    await page.goto("/spaces?type=hackathon&q=TreeHacks%202027");
    await expect(page.getByRole("heading", { name: "No matching spaces found" }).first()).toBeVisible();
    await page.goto("/spaces?type=hackathon&q=TreeHacks");
    await expect(page.getByRole("link", { name: /TreeHacks 2026/ })).toHaveCount(1);
    await expect(page.getByRole("link", { name: /Exblwer|Mobile/ })).toHaveCount(0);

    // Course Space is invite-only and Jordan is a seeded member (different goal than the hackathon).
    await page.goto("/spaces?type=course");
    await expect(page.getByRole("link", { name: /CSCI 567 · Final Group Project · Fall 2026/ })).toBeVisible();

    // Create TreeHacks 2027 live (the presenter demo step).
    await page.goto("/spaces?type=hackathon&q=TreeHacks%202027");
    await page.getByRole("link", { name: "Create New Space" }).first().click();
    await page.getByLabel("Official URL").fill("https://www.treehacks.com");
    await page.getByLabel("Start date").fill("2027-02-14");
    await page.getByLabel("End date").fill("2027-02-16");
    await page.getByRole("button", { name: "Check for duplicates & create" }).click();
    const different = page.getByRole("button", { name: "No, it's different. Create Space" });
    await expect(page.getByText("Space created. You're its first participant.").first().or(different)).toBeVisible({ timeout: 20_000 });
    if (await different.isVisible()) await different.click();
    await expect(page).toHaveURL(/\/setup\?created=1/);
    const slug = /\/s\/([a-z0-9-]+)\//.exec(page.url())![1];
    await page.getByRole("button", { name: "Save & continue" }).click();
    await expect(page.getByTestId("participant-count")).toHaveText("1 member (you) · No teammates available yet");

    // Simulate 12 participants joining via the demo controls.
    await page.goto("/demo");
    await expect(page.getByRole("heading", { name: "Demo controls" })).toBeVisible();
    await noHorizontalScroll(page);
    await page.screenshot({ path: shot("controls"), fullPage: true });
    await page.getByLabel("Space", { exact: true }).selectOption({ label: "TreeHacks 2027 (1)" });
    await page.getByLabel("How many").fill("12");
    await page.getByRole("button", { name: "Simulate joins" }).click();
    await expect(page.getByText("Simulated up to 12 synthetic participants joining.")).toBeVisible();
    await page.goto(`/s/${slug}/discover`);
    await expect(page.getByTestId("participant-count")).toHaveText("13 participants");
    await page.getByTestId("event-details").locator("summary").click();
    await expect(page.getByTestId("event-details")).toContainText("13 students (12 synthetic)");
    await noHorizontalScroll(page);
    await page.screenshot({ path: shot("simulated"), fullPage: true });

    // Persona switching: Maya (who was simulated into TreeHacks 2027 first).
    await page.goto("/demo");
    await page.getByRole("button", { name: /^M Maya/ }).click();
    await expect(page).toHaveURL(/\/spaces$/);
    await page.goto("/spaces?type=hackathon");
    await expect(page.getByRole("status").filter({ hasText: "Demo Mode" })).toContainText("You are Maya Chen");
    await expect(page.getByRole("link", { name: /TreeHacks 2027/ })).toBeVisible();

    // Profile persistence within the sandbox (as Maya), restored by reset.
    await page.goto("/profile");
    await page.getByLabel("University").fill("Demo University");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByText("Profile saved.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("University")).toHaveValue("Demo University");

    // A second visitor (another browser, another IP) gets a DIFFERENT private sandbox;
    // the first visitor's session and data are unaffected, in both directions.
    const second = await startDemo(browser, viewport);
    await second.page.goto("/spaces?type=hackathon&q=TreeHacks%202027");
    await expect(second.page.getByRole("heading", { name: "No matching spaces found" }).first()).toBeVisible();
    await page.goto("/profile");
    await expect(page.getByLabel("University")).toHaveValue("Demo University"); // still Maya, still her edit
    await expect(page.getByRole("status").filter({ hasText: "Demo Mode" })).toContainText("You are Maya Chen");
    // The second visitor restarts THEIR sandbox: the first is not reset or signed out.
    const secondRestart = await second.page.request.post("/api/demo/reset", { headers: { origin: new URL(second.page.url()).origin }, data: {} });
    expect(secondRestart.status()).toBe(200);
    await page.goto("/spaces?type=hackathon&q=TreeHacks%202027");
    await expect(page.getByRole("link", { name: /TreeHacks 2027/ })).toBeVisible();
    expect((await page.request.get("/api/profile")).status()).toBe(200);

    // Restart (own sandbox): TreeHacks 2027 disappears, profiles are restored, and we're Jordan again.
    await page.goto("/demo");
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Restart demo" }).click();
    await expect(page).toHaveURL(/\/spaces$/, { timeout: 30_000 });
    await page.getByTestId("demo-guide").getByRole("button", { name: "Start exploring" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Demo Mode" })).toContainText("You are Jordan Lee");
    await page.goto("/spaces?type=hackathon&q=TreeHacks%202027");
    await expect(page.getByRole("heading", { name: "No matching spaces found" }).first()).toBeVisible();
    // Maya's profile edit was undone by the restart.
    await switchVia(page, /^M Maya/, "Maya Chen");
    await page.goto("/profile");
    await expect(page.getByLabel("University")).toHaveValue("USC");

    // Ending a demo releases only that visitor's sandbox.
    await second.page.goto("/demo");
    await second.page.getByRole("button", { name: "End demo" }).click();
    await expect(second.page.getByRole("button", { name: "Try Interactive Demo" })).toBeVisible();
    expect((await page.request.get("/api/profile")).status()).toBe(200);

    await page.goto("/demo");
    await page.getByRole("button", { name: "End demo" }).click();
    await expect(page.getByRole("button", { name: "Try Interactive Demo" })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Demo Mode" })).toHaveCount(0);
    // After ending, the old session can't reach the app or the demo API.
    expect((await page.request.get("/api/profile")).status()).toBe(401);

    await context.close();
    await second.context.close();
  });

  test("create → restart cycles reset Space limits; restarts are throttled per sandbox", async ({ browser }, info) => {
    test.skip(info.project.name !== "demo-desktop", "API-level check; one viewport is enough");
    const { context, page } = await startDemo(browser, { width: 1440, height: 900 });
    const headers = { origin: new URL(page.url()).origin };
    const payload = {
      type: "hackathon", title: "TreeHacks", edition_year: 2027, start_date: "2027-02-14", end_date: "2027-02-16",
      timezone: "America/Los_Angeles", format: "in_person", visibility: "public",
    };
    for (let i = 1; i <= 6; i++) {
      const created = await page.request.post("/api/spaces", { headers, data: payload });
      expect(created.status(), `create #${i}: ${await created.text()}`).toBe(201);
      const reset = await page.request.post("/api/demo/reset", { headers, data: {} });
      expect(reset.status(), `reset #${i}`).toBe(200);
      expect((await reset.json()).cleared_create_limits, `reset #${i}`).toBe(1);
    }
    // The 7th restart within an hour is refused (429), and nothing was reset.
    expect((await page.request.post("/api/spaces", { headers, data: payload })).status()).toBe(201);
    const limited = await page.request.post("/api/demo/reset", { headers, data: {} });
    expect(limited.status()).toBe(429);
    expect((await limited.json()).error.code).toBe("RATE_LIMITED");
    await page.goto("/spaces?type=hackathon&q=TreeHacks%202027");
    await expect(page.getByRole("link", { name: /TreeHacks 2027/ })).toBeVisible();
    await page.request.post("/api/demo/end", { headers, data: {} });
    await context.close();
  });

  test("starts are throttled per visitor and the pool never double-books", async ({ playwright, baseURL }, info) => {
    test.skip(info.project.name !== "demo-desktop", "API-level check; one viewport is enough");
    const ip = fakeIp();
    const origin = new URL(baseURL!).origin;
    const results: number[] = [];
    const messages: string[] = [];
    const contexts = [];
    for (let i = 0; i < 7; i++) {
      const api = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { origin, "x-forwarded-for": ip } });
      contexts.push(api);
      const res = await api.post("/api/demo/start", { data: {} });
      results.push(res.status());
      messages.push(res.ok() ? "" : (await res.json()).error.message);
    }
    // At most DEMO_MAX_SESSIONS_PER_VISITOR (2) sandboxes; the 7th start in an hour is throttled.
    expect(results.filter((s) => s === 200).length).toBeLessThanOrEqual(2);
    expect(results.slice(0, 2)).toEqual([200, 200]);
    expect(results[2]).toBe(429);
    expect(messages[2]).toMatch(/already have demo sandboxes open/);
    expect(results[6]).toBe(429);
    expect(messages[6]).toMatch(/hourly limit for new demo sandboxes/);

    // The throttled response says exactly when this visitor may start again (and nothing else).
    const blocked = await contexts[6].post("/api/demo/start", { data: {} });
    expect(blocked.status()).toBe(429);
    const retryAfter = Number(blocked.headers()["retry-after"]);
    const details = (await blocked.json()).error.details as { retry_at: string };
    expect(Object.keys(details)).toEqual(["retry_at"]);
    const untilRetry = (Date.parse(details.retry_at) - Date.now()) / 1000;
    expect(retryAfter).toBeGreaterThan(3000); // the first start was moments ago: ~1 hour
    expect(retryAfter).toBeLessThanOrEqual(3600);
    expect(Math.abs(retryAfter - untilRetry)).toBeLessThan(10);

    // A visitor who already has a sandbox resumes it even while throttled, without using a start…
    const resumed = await contexts[0].post("/api/demo/start", { data: {} });
    expect(resumed.status()).toBe(200);
    expect((await resumed.json()).resumed).toBe(true);
    // …and neither the resume nor repeated blocked clicks move the retry time.
    for (let i = 0; i < 3; i++) await contexts[6].post("/api/demo/start", { data: {} });
    const again = await contexts[6].post("/api/demo/start", { data: {} });
    expect((await again.json()).error.details.retry_at).toBe(details.retry_at);
    // A different visitor is unaffected by that visitor's throttle.
    const other = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { origin, "x-forwarded-for": fakeIp() } });
    expect((await other.post("/api/demo/start", { data: {} })).status()).toBe(200);
    for (const c of [...contexts, other]) {
      await c.post("/api/demo/end", { data: {} });
      await c.dispose();
    }
  });

  test("H: demo sandbox has valid recruiting teams; presenter teams vanish on reset", async ({ browser }, info) => {
    const viewport = info.project.use.viewport ?? { width: 1440, height: 900 };
    const { context, page } = await startDemo(browser, viewport);
    const headers = { origin: new URL(page.url()).origin };

    // Seeded synthetic teams in AI@USC (Jordan is not on any of them).
    await page.goto("/spaces?type=hackathon&q=AI%40USC");
    await page.getByRole("link", { name: /AI@USC Hackathon 2026/ }).click();
    await page.waitForURL(/\/s\/[a-z0-9-]+\/discover$/);
    const slug = /\/s\/([a-z0-9-]+)\//.exec(page.url())![1];
    await page.goto(`/s/${slug}/teams`);
    await expect(page.getByRole("heading", { name: "You're not on a team in this Space" })).toBeVisible();
    for (const name of ["Prompt Pilots", "GreenGrid", "CareCompanion", "Campus Compass"]) {
      await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible();
    }
    await noHorizontalScroll(page);
    await page.screenshot({ path: `test-results/screens/p4a-demo-teams-${info.project.name}.png`, fullPage: true });
    await page.getByRole("link", { name: /Prompt Pilots/ }).click();
    await expect(page.getByTestId("team-capacity")).toHaveText("2 of 4 · 2 open positions");
    await expect(page.getByTestId("team-badges")).toContainText("Active");
    await expect(page.getByText("Synthetic").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Edit team" })).toHaveCount(0);

    // Jordan creates a team in AI@USC via the API (same RPC as the form).
    const spaces = (await (await page.request.get("/api/spaces?q=")).json()).spaces as { id: string; slug: string }[];
    const spaceId = spaces.find((s) => s.slug === slug)!.id;
    const created = await page.request.post(`/api/spaces/${spaceId}/teams`, {
      headers,
      data: { name: "Jordan Demo Team", description: "", open_positions: 2, recruiting: true, requirements: { must_roles: ["design"] } },
    });
    expect(created.status()).toBe(201);
    await page.goto(`/s/${slug}/teams`);
    await expect(page.getByRole("link", { name: /Jordan Demo Team/ })).toBeVisible();

    // Reset restores exactly the seeded teams.
    const reset = await page.request.post("/api/demo/reset", { headers, data: {} });
    expect(reset.status()).toBe(200);
    await page.goto("/spaces?type=hackathon&q=AI%40USC");
    await page.getByRole("link", { name: /AI@USC Hackathon 2026/ }).click();
    await page.waitForURL(/\/s\/[a-z0-9-]+\/discover$/);
    const newSlug = /\/s\/([a-z0-9-]+)\//.exec(page.url())![1];
    await page.goto(`/s/${newSlug}/teams`);
    await expect(page.getByRole("link", { name: /Jordan Demo Team/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Prompt Pilots/ })).toBeVisible();
    await page.request.post("/api/demo/end", { headers, data: {} });
    await context.close();
  });

  test("P4-B A–H: view pool, generate team, explain, replace, then grow an existing team", async ({ browser }, info) => {
    const viewport = info.project.use.viewport ?? { width: 1440, height: 900 };
    const shot = (n: string) => `test-results/screens/p4b-${n}-${info.project.name}.png`;
    const { context, page } = await startDemo(browser, viewport);
    const headers = { origin: new URL(page.url()).origin };

    // A. Open AI@USC Hackathon 2026 → Smart Team Formation.
    await page.goto("/spaces?type=hackathon&q=AI%40USC");
    await page.getByRole("link", { name: /AI@USC Hackathon 2026/ }).click();
    await page.waitForURL(/\/s\/[a-z0-9-]+\/discover$/);
    const slug = /\/s\/([a-z0-9-]+)\//.exec(page.url())![1];
    await page.getByRole("link", { name: /^Smart Team Formation/ }).click();
    await expect(page).toHaveURL(new RegExp(`/s/${slug}/smart$`));

    // B. Step 1 (preferences). Eligible participants live in a secondary, collapsed panel.
    await expect(page.getByRole("heading", { level: 1, name: "Build your ideal team" })).toBeVisible();
    await expect(page.getByTestId("send-invites")).toHaveCount(0); // no invitation bar before a recommendation
    await expect(page.getByTestId("pool-summary")).toBeHidden();
    await page.getByText("Who can be matched").click();
    await expect(page.getByTestId("pool-summary")).toHaveText("20 of 31 other participants can be suggested · 7 already on a team.");
    const list = page.getByTestId("pool-list");
    await expect(list.getByText("Maya Chen")).toBeVisible();
    await expect(list.getByText("Priya Raman")).toBeVisible();
    for (const hidden of ["Tom Becker", "Nina Petrova", "Victor Huang", "Olivia Brown", "Ethan Park", "Alex Morgan", "Jordan Lee"]) {
      await expect(list.getByText(hidden), hidden).toHaveCount(0);
    }
    await page.getByText("Who can be matched").click();

    // C. Generate a recommended team (step 2; draft: nobody invited, no team created).
    await page.getByRole("button", { name: "Generate team" }).click();
    await expect(page.getByTestId("proposal")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { level: 1, name: "Recommended team" })).toBeFocused();
    await expect(page.getByTestId("formation-steps").locator('[aria-current="step"]')).toContainText("Review team");
    await expect(page.getByTestId("draft-status")).toHaveText("Draft proposal · nobody has been invited");
    await expect(page.getByTestId("member-card")).toHaveCount(4);
    await expect(page.locator('[data-testid="member-card"][data-kind="you"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="member-card"][data-kind="you"]').getByRole("button", { name: /^Replace/ })).toHaveCount(0);
    await expect(page.locator('[data-testid="member-card"][data-kind="candidate"]')).toHaveCount(3);
    await expect(page.getByTestId("member-kind").filter({ hasText: "Not invited yet" })).toHaveCount(3);
    await expect(page.getByTestId("member-synthetic")).toHaveCount(4); // synthetic labeling visible on every card

    // D. Plain-language summary first; every computed detail one click away.
    await expect(page.getByTestId("match-label")).toHaveText(/(Strong|Good|Fair|Weak) match/);
    for (const k of ["skills", "goals", "schedule"]) await expect(page.getByTestId(`why-${k}`)).toBeVisible();
    // The label never contradicts the cards: green only without weak spots; otherwise neutral + trade-offs.
    const tone = await page.getByTestId("match-label").getAttribute("data-tone");
    const weakCards = await page.locator('[data-testid^="why-"][data-tone="weak"]').count();
    if (tone === "positive") expect(weakCards).toBe(0);
    if (tone === "neutral") await expect(page.getByTestId("trade-offs")).toBeVisible();
    else await expect(page.getByTestId("trade-offs")).toHaveCount(0);
    await expect(page.getByTestId("team-fit-score")).toBeHidden(); // internal numbers stay out of the default view
    await page.getByText("See detailed analysis").click();
    for (const d of ["skill", "goal", "interest", "schedule", "style"]) await expect(page.getByTestId(`dimension-${d}`)).toBeVisible();
    await expect(page.getByRole("list", { name: "Role coverage" }).getByRole("listitem")).toHaveCount(4);
    await expect(page.getByTestId("role-covered").first()).toBeVisible();
    await expect(page.getByTestId("shared-hours")).toContainText("h/week");
    await expect(page.getByTestId("baseline").getByRole("row")).toHaveCount(3);
    const firstCard = page.locator('[data-kind="candidate"]').first();
    await firstCard.getByRole("button", { name: /^Details/ }).click();
    await expect(firstCard.getByTestId("member-details").getByRole("listitem").first()).toContainText(/Covers|Flexible|Strengths|Brings/);
    await noHorizontalScroll(page);
    await page.screenshot({ path: shot("proposal"), fullPage: true });

    // E. Replace a recommended member and observe the whole-team score change.
    const before = Number(await page.getByTestId("team-fit-score").innerText());
    const replacedName = await page.locator('[data-kind="candidate"]').first().getByTestId("member-name").innerText();
    await page.locator('[data-kind="candidate"]').first().getByRole("button", { name: /^Replace / }).click();
    const firstOption = page.getByTestId("replace-option").first();
    await expect(firstOption).toBeVisible({ timeout: 20_000 });
    const delta = Number((await firstOption.getByTestId("replace-delta").innerText()).replace("−", "-").replace("±", "").replace(/[^0-9.+-]/g, ""));
    await page.screenshot({ path: shot("replace"), fullPage: false });
    await firstOption.getByRole("button", { name: /^Use .* instead$/ }).click();
    await expect(page.getByTestId("replace-summary")).toContainText(`Replaced ${replacedName} with`);
    const after = Number(await page.getByTestId("team-fit-score").innerText());
    expect(Math.abs(after - (before + delta))).toBeLessThan(0.0021);
    await expect(page.getByTestId("member-card")).toHaveCount(4);
    await expect(page.locator('[data-kind="candidate"]').getByTestId("member-name").filter({ hasText: replacedName })).toHaveCount(0);

    // E2. The unsent recommendation survives normal navigation (same tab), and preferences can be revisited.
    const kept = await page.locator('[data-kind="candidate"]').getByTestId("member-name").allInnerTexts();
    await page.goto(`/s/${slug}/discover`);
    await page.goBack();
    await expect(page.getByTestId("proposal")).toBeVisible();
    expect(await page.locator('[data-kind="candidate"]').getByTestId("member-name").allInnerTexts()).toEqual(kept);
    await expect(page.getByTestId("replace-summary")).toContainText(`Replaced ${replacedName} with`);
    await page.getByRole("button", { name: "Edit preferences" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Build your ideal team" })).toBeFocused();
    await expect(page.getByTestId("send-invites")).toHaveCount(0);
    await page.getByRole("button", { name: "Back to recommended team" }).click();
    await expect(page.getByTestId("proposal")).toBeVisible();
    // Alternatives: "Try another team" moves through the engine's distinct proposals.
    if (await page.getByTestId("try-another").isVisible()) {
      // A manual replacement is never dropped silently: switching asks first.
      await page.getByTestId("try-another").click();
      const discard = page.getByTestId("discard-replacement");
      await expect(discard).toBeVisible();
      await expect(discard).toContainText(`You replaced ${replacedName} with`);
      await discard.getByRole("button", { name: "Keep my edited team" }).click();
      await expect(discard).toHaveCount(0);
      await expect(page.getByTestId("replace-summary")).toContainText(`Replaced ${replacedName} with`);
      await expect(page.getByTestId("option-label")).toContainText("Your edited version of the best match");
      await page.getByTestId("try-another").click();
      await page.getByTestId("discard-replacement").getByRole("button", { name: "Discard and switch" }).click();
      await expect(page.getByTestId("option-label")).toContainText("alternative 1");
      await expect(page.getByTestId("replace-summary")).toHaveCount(0);
      // With nothing to lose, switching is immediate.
      await page.getByTestId("try-another").click();
      await expect(page.getByTestId("discard-replacement")).toHaveCount(0);
      await expect(page.getByTestId("option-label")).not.toContainText("alternative 1");
    }
    // Deselecting a candidate changes what would be sent; nothing is sent here.
    const inviteBar = page.getByTestId("send-invites");
    await inviteBar.getByRole("checkbox").first().uncheck();
    await expect(inviteBar.getByRole("button", { name: "Send 2 invitations" })).toBeEnabled();
    await expect(inviteBar.getByRole("heading")).toHaveText("Ready to invite 2 teammates");

    // M. Nothing was created: Jordan still has no team and no invitations.
    await page.goto(`/s/${slug}/teams`);
    await expect(page.getByRole("heading", { name: "You're not on a team in this Space" })).toBeVisible();
    await page.goto("/invitations");
    await expect(page.getByRole("heading", { name: "No pending invitations" })).toBeVisible();

    // F. Open an existing recruiting team (as its owner, Alex).
    await page.goto("/demo");
    await page.getByRole("button", { name: /^A Alex/ }).click();
    await expect(page).toHaveURL(/\/spaces$/);
    await page.goto(`/s/${slug}/teams`);
    await page.getByRole("link", { name: /Campus Compass/ }).first().click();
    await expect(page.getByTestId("team-capacity")).toHaveText("2 of 4 · 2 open positions");
    await page.getByRole("link", { name: "Grow my team" }).click();
    await expect(page).toHaveURL(new RegExp(`/s/${slug}/grow$`));

    // G. Analyze missing roles and skills.
    const gaps = page.getByTestId("gap-analysis");
    await expect(gaps.getByText("Required roles not covered")).toBeVisible();
    await expect(gaps.locator("dd").first()).toContainText("Backend");
    await expect(gaps.locator("dd").first()).toContainText("Frontend");
    await expect(gaps.getByText("Desired skills not covered")).toBeVisible();
    await expect(page.getByTestId("grow-capacity")).toHaveText("2 accepted members · 2 open positions (team size 4)");

    // H. Recommended students who fill those gaps, ranked by whole-team improvement.
    const recs = page.getByTestId("grow-candidate");
    await expect(recs.first()).toBeVisible();
    await expect(recs.first().getByText(/Fills (Backend|Frontend) \(required\)/).first()).toBeVisible();
    const gains = (await page.getByTestId("grow-gain").allInnerTexts()).map((t) => Number(t.replace("−", "-").replace(/[^0-9.+-]/g, "")));
    expect(gains[0]).toBeGreaterThan(0);
    expect([...gains].sort((a, b) => b - a)).toEqual(gains);
    await noHorizontalScroll(page);
    await page.screenshot({ path: shot("grow"), fullPage: true });

    // L. Alex cannot pull candidates for a team he doesn't recruit for.
    const spaces = (await (await page.request.get("/api/spaces?q=")).json()).spaces as { id: string; slug: string }[];
    const spaceId = spaces.find((x) => x.slug === slug)!.id;
    await page.goto(`/s/${slug}/teams`);
    const otherHref = await page.getByRole("link", { name: /Prompt Pilots/ }).getAttribute("href");
    const otherTeam = /teams\/([0-9a-f-]{36})/.exec(otherHref!)![1];
    const denied = await page.request.post(`/api/spaces/${spaceId}/match/recommend-members`, { headers, data: { team_id: otherTeam } });
    expect(denied.status()).toBe(403);
    expect((await denied.json()).error.code).toBe("NOT_RECRUITER");

    await page.request.post("/api/demo/end", { headers, data: {} });
    await context.close();
  });

  test("P5 A–I: invite → accept / decline → active → Find a Team request → reset", async ({ browser }, info) => {
    test.setTimeout(300_000);
    const viewport = info.project.use.viewport ?? { width: 1440, height: 900 };
    const shot = (n: string) => `test-results/screens/p5-${n}-${info.project.name}.png`;
    // Desktop: Alex declines and Jordan invites a replacement. Mobile: Alex accepts (team fills up).
    const alexAccepts = info.project.name === "demo-mobile";
    const { context, page } = await startDemo(browser, viewport);
    const headers = { origin: new URL(page.url()).origin };
    const banner = page.getByRole("status").filter({ hasText: "Demo Mode" });
    const switchTo = async (button: RegExp, fullName: string) => {
      await page.goto("/demo");
      await page.getByRole("button", { name: button }).click();
      await expect(page).toHaveURL(/\/spaces$/);
      await expect(banner).toContainText(`You are ${fullName} `);
    };

    // Setup: TreeHacks 2027 created live; 6 synthetic students join (Maya, Priya and Alex arrive first).
    await page.goto("/spaces?type=hackathon&q=TreeHacks%202027");
    await page.getByRole("link", { name: "Create New Space" }).first().click();
    await page.getByLabel("Official URL").fill("https://www.treehacks.com");
    await page.getByLabel("Start date").fill("2027-02-14");
    await page.getByLabel("End date").fill("2027-02-16");
    await page.getByRole("button", { name: "Check for duplicates & create" }).click();
    const different = page.getByRole("button", { name: "No, it's different. Create Space" });
    await expect(page.getByText("Space created. You're its first participant.").first().or(different)).toBeVisible({ timeout: 20_000 });
    if (await different.isVisible()) await different.click();
    await expect(page).toHaveURL(/\/setup\?created=1/);
    const slug = /\/s\/([a-z0-9-]+)\//.exec(page.url())![1];
    await page.getByRole("button", { name: "Save & continue" }).click();
    await expect(page.getByTestId("participant-count")).toBeVisible();
    await page.goto("/demo");
    await page.getByLabel("Space", { exact: true }).selectOption({ label: "TreeHacks 2027 (1)" });
    await page.getByLabel("How many").fill("6");
    await page.getByRole("button", { name: "Simulate joins" }).click();
    await expect(page.getByText("Simulated up to 6 synthetic participants joining.")).toBeVisible();

    // A + B. Jordan (no team yet) asks Smart Team Formation: Maya, Priya and Alex are recommended.
    await page.goto(`/s/${slug}/smart`);
    if (await page.getByTestId("proposal").isVisible()) await page.getByRole("button", { name: "Edit preferences" }).click();
    await page.getByRole("button", { name: "Generate team" }).click();
    await expect(page.getByTestId("proposal")).toBeVisible({ timeout: 20_000 });
    const names = page.locator('[data-kind="candidate"]').getByTestId("member-name");
    await expect(names).toHaveCount(3);
    expect((await names.allInnerTexts()).sort()).toEqual(["Alex Morgan", "Maya Chen", "Priya Raman"]);
    await expect(page.getByTestId("draft-status")).toHaveText("Draft proposal · nobody has been invited");

    // C. Explicit Send Invites (creates the team "Trojan Builders" and invites all three).
    const bar = page.getByTestId("send-invites");
    await expect(bar.getByRole("checkbox")).toHaveCount(3);
    await bar.getByRole("button", { name: "Send 3 invitations" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Send 3 invitations?" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Send invitations" })).toBeDisabled();
    await dialog.getByLabel("Team name").fill("Trojan Builders");
    await dialog.getByLabel(/Message/).fill("Let's build something for TreeHacks!");
    await noHorizontalScroll(page);
    await expect(dialog).toHaveCSS("opacity", "1");
    await page.screenshot({ path: shot("send"), fullPage: false });
    await dialog.getByRole("button", { name: "Send invitations" }).click();
    await expect(page).toHaveURL(new RegExp(`/s/${slug}/teams/[0-9a-f-]{36}$`), { timeout: 20_000 });
    const teamUrl = new URL(page.url()).pathname;
    const teamId = teamUrl.split("/").pop()!;
    await expect(page.getByTestId("team-badges")).toContainText("Forming");
    await expect(page.getByTestId("pending-invitation")).toHaveCount(3);
    await expect(page.getByTestId("status-hint")).toContainText("Becomes Active when at least 2 members have accepted (now 1)");
    await expect(page.getByTestId("team-capacity")).toHaveText("1 of 4 · 3 open positions");
    await expect(page.getByTestId("team-reserved")).toHaveText("3 reserved by pending invitations");
    // No seat left: nothing more can be sent, and tampered ids are rejected server-side.
    const extra = await page.request.post(`/api/teams/${teamId}/invitations`, { headers, data: { user_ids: [crypto.randomUUID()] } });
    expect(extra.status()).toBe(409);
    expect((await extra.json()).error.code).toBe("TEAM_FULL");
    await noHorizontalScroll(page);
    await page.screenshot({ path: shot("forming"), fullPage: true });

    // D. Maya accepts.
    await switchTo(/^M Maya/, "Maya Chen");
    await page.goto("/invitations");
    const mayaInvite = page.getByTestId("incoming-invitation").filter({ hasText: "Trojan Builders" });
    await expect(mayaInvite).toContainText("Jordan Lee invited you to join Trojan Builders.");
    await expect(mayaInvite).toContainText("Let's build something for TreeHacks!");
    await expect(mayaInvite).toContainText(/expires in (4[78]|4[0-9]) h|expires in 2 days/);
    await noHorizontalScroll(page);
    await page.screenshot({ path: shot("inbox"), fullPage: true });
    await mayaInvite.getByRole("button", { name: /^Accept/ }).click();
    await expect(page).toHaveURL(new RegExp(`${teamUrl}$`), { timeout: 20_000 });
    await expect(page.getByTestId("member-list")).toContainText("Maya Chen");
    await expect(page.getByTestId("team-badges")).toContainText("Forming");
    // An answered invitation can't be answered again.
    await page.goto("/invitations");
    await expect(page.getByTestId("incoming-invitation")).toHaveCount(0);
    await expect(page.getByTestId("history-row").filter({ hasText: "Trojan Builders" })).toContainText("accepted");

    // E. Priya accepts.
    await switchTo(/^P Priya/, "Priya Raman");
    await page.goto("/invitations");
    await page.getByTestId("incoming-invitation").filter({ hasText: "Trojan Builders" }).getByRole("button", { name: /^Accept/ }).click();
    await expect(page).toHaveURL(new RegExp(`${teamUrl}$`), { timeout: 20_000 });
    await expect(page.getByTestId("team-capacity")).toHaveText("3 of 4 · 1 open position");
    await expect(page.getByTestId("team-badges")).toContainText("Forming"); // Alex is still pending

    // F. Alex answers.
    await switchTo(/^A Alex/, "Alex Morgan");
    await page.goto("/invitations");
    const alexInvite = page.getByTestId("incoming-invitation").filter({ hasText: "Trojan Builders" });
    if (alexAccepts) {
      await alexInvite.getByRole("button", { name: /^Accept/ }).click();
      await expect(page).toHaveURL(new RegExp(`${teamUrl}$`), { timeout: 20_000 });
    } else {
      await alexInvite.getByRole("button", { name: /^Decline/ }).click();
      await expect(page.getByText("You declined Trojan Builders's invitation.")).toBeVisible();
      await expect(page.getByTestId("incoming-invitation")).toHaveCount(0);
    }

    // G. Jordan views the team status.
    await switchTo(/^J Jordan/, "Jordan Lee");
    await page.goto(teamUrl);
    await expect(page.getByTestId("team-badges")).toContainText("Active");
    await expect(page.getByTestId("status-hint")).toContainText("Activated automatically");
    await expect(page.getByTestId("pending-invitations")).toContainText("Pending invitations (0)");
    if (alexAccepts) {
      await expect(page.getByTestId("team-capacity")).toHaveText("4 of 4 · 0 open positions");
      await expect(page.getByTestId("team-badges")).toContainText("Not recruiting");
      await expect(page.getByTestId("member-list")).toContainText("Alex Morgan");
    } else {
      await expect(page.getByTestId("team-capacity")).toHaveText("3 of 4 · 1 open position");
      await expect(page.getByTestId("history-item").filter({ hasText: "Alex Morgan" })).toContainText("declined");
      await expect(page.getByTestId("member-list")).toContainText("Maya Chen");
      await expect(page.getByTestId("member-list")).toContainText("Priya Raman");
      // Recompute alternatives and explicitly invite a replacement (Alex is not suggested again).
      await page.getByTestId("replacement-callout").getByRole("link", { name: "Find a replacement" }).click();
      await expect(page).toHaveURL(new RegExp(`/s/${slug}/grow$`));
      const recs = page.getByTestId("grow-candidate");
      await expect(recs.first()).toBeVisible();
      await expect(recs.filter({ hasText: "Alex Morgan" })).toHaveCount(0);
      const replacement = await recs.first().getByTestId("member-name").innerText();
      await recs.first().getByRole("button", { name: `Invite ${replacement}` }).click();
      await expect(page.getByText(`Invitation sent to ${replacement}.`)).toBeVisible();
      await expect(page.getByTestId("grow-capacity")).toContainText("1 invited");
      await page.goto(teamUrl);
      await expect(page.getByTestId("pending-invitation")).toHaveCount(1);
      await expect(page.getByTestId("pending-invitation")).toContainText(replacement);
      await expect(page.getByTestId("team-badges")).toContainText("Active"); // stays active while growing
    }
    await noHorizontalScroll(page);
    await page.screenshot({ path: shot("active"), fullPage: true });

    // H. Find a Team in AI@USC (Jordan has no team there): ranked by fit, request to join, owner accepts.
    await page.goto("/spaces?type=hackathon&q=AI%40USC");
    await page.getByRole("link", { name: /AI@USC Hackathon 2026/ }).click();
    await page.waitForURL(/\/s\/[a-z0-9-]+\/discover$/);
    const aiSlug = /\/s\/([a-z0-9-]+)\//.exec(page.url())![1];
    await page.getByRole("link", { name: /^Find a Team/ }).click();
    await expect(page).toHaveURL(new RegExp(`/s/${aiSlug}/find$`));
    await expect(page.getByTestId("find-count")).toContainText("Recommended for you");
    const results = page.getByTestId("find-team");
    await expect(results.first().getByTestId("find-fit")).toContainText("Fit with you");
    expect(await results.count()).toBeGreaterThanOrEqual(3);
    // DB-backed filter: teams looking for a backend developer.
    await page.getByLabel("Looking for role").selectOption({ label: "Backend" });
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(page).toHaveURL(/role=backend/);
    await expect(results.filter({ hasText: "Campus Compass" })).toHaveCount(1);
    await expect(results.filter({ hasText: "Prompt Pilots" })).toHaveCount(0);
    await noHorizontalScroll(page);
    await page.screenshot({ path: shot("find"), fullPage: true });
    const compass = results.filter({ hasText: "Campus Compass" });
    await compass.getByRole("button", { name: "Request to join Campus Compass" }).click();
    await page.getByRole("dialog").getByLabel(/Note to the team/).fill("Full-stack: I can own the backend and frontend.");
    await page.getByRole("dialog").getByRole("button", { name: "Send request" }).click();
    await expect(page.getByText("Request sent to Campus Compass.")).toBeVisible();
    await expect(compass.getByTestId("request-pending")).toBeVisible();
    // Duplicate request is refused by the database.
    const compassId = /teams\/([0-9a-f-]{36})/.exec((await compass.getByRole("link", { name: "View team" }).getAttribute("href"))!)![1];
    const dup = await page.request.post(`/api/teams/${compassId}/requests`, { headers, data: {} });
    expect(dup.status()).toBe(409);
    expect((await dup.json()).error.code).toBe("DUPLICATE_PENDING");
    await page.goto("/invitations");
    await expect(page.getByTestId("my-request").filter({ hasText: "Campus Compass" })).toBeVisible();

    await switchTo(/^A Alex/, "Alex Morgan");
    await page.goto("/invitations");
    const request = page.getByTestId("team-request").filter({ hasText: "Jordan Lee" });
    await expect(request).toContainText("Full-stack: I can own the backend and frontend.");
    await request.getByRole("button", { name: /^Accept/ }).click();
    await expect(page.getByText("Jordan Lee joined Campus Compass.")).toBeVisible();
    await page.goto(`/s/${aiSlug}/teams/${compassId}`);
    await expect(page.getByTestId("team-capacity")).toHaveText("3 of 4 · 1 open position");
    await expect(page.getByTestId("member-list")).toContainText("Jordan Lee");

    // I. Restart restores the seeded state (and signs back in as Jordan): no TreeHacks 2027,
    // no invitations, Campus Compass back to 2 of 4.
    const reset = await page.request.post("/api/demo/reset", { headers, data: {} });
    expect(reset.status()).toBe(200);
    await page.goto("/spaces");
    await expect(banner).toContainText("You are Jordan Lee");
    await page.goto("/spaces?type=hackathon&q=TreeHacks%202027");
    await expect(page.getByRole("heading", { name: "No matching spaces found" }).first()).toBeVisible();
    await page.goto("/invitations");
    await expect(page.getByRole("heading", { name: "No pending invitations" })).toBeVisible();
    await page.goto("/spaces?type=hackathon&q=AI%40USC");
    await page.getByRole("link", { name: /AI@USC Hackathon 2026/ }).click();
    await page.waitForURL(/\/s\/[a-z0-9-]+\/discover$/);
    const freshSlug = /\/s\/([a-z0-9-]+)\//.exec(page.url())![1];
    await page.goto(`/s/${freshSlug}/teams`);
    await expect(page.getByRole("heading", { name: "You're not on a team in this Space" })).toBeVisible();
    await page.getByRole("link", { name: /Campus Compass/ }).first().click();
    await expect(page.getByTestId("team-capacity")).toHaveText("2 of 4 · 2 open positions");

    await page.request.post("/api/demo/end", { headers, data: {} });
    await context.close();
  });

  test("P6 A–H: invite → Maya & Priya accept → Active → workspace chat → AI Kickoff → reset", async ({ browser }, info) => {
    test.setTimeout(300_000);
    const viewport = info.project.use.viewport ?? { width: 1440, height: 900 };
    const mobile = viewport.width < 1024;
    const shot = (n: string) => `test-results/screens/p6-demo-${n}-${info.project.name}.png`;
    const { context, page } = await startDemo(browser, viewport);
    const headers = { origin: new URL(page.url()).origin };
    const banner = page.getByRole("status").filter({ hasText: "Demo Mode" });
    const switchTo = async (button: RegExp, fullName: string) => {
      await page.goto("/demo");
      await page.getByRole("button", { name: button }).click();
      await expect(page).toHaveURL(/\/spaces$/);
      await expect(banner).toContainText(`You are ${fullName} `);
    };
    const live = async () => {
      if (mobile) await page.getByRole("tab", { name: "Chat" }).click();
      await expect(page.getByTestId("connection-status")).toHaveAttribute("data-state", "live", { timeout: 20_000 });
    };

    // Setup: TreeHacks 2027 live + 6 simulated joins.
    await page.goto("/spaces?type=hackathon&q=TreeHacks%202027");
    await page.getByRole("link", { name: "Create New Space" }).first().click();
    await page.getByLabel("Official URL").fill("https://www.treehacks.com");
    await page.getByLabel("Start date").fill("2027-02-14");
    await page.getByLabel("End date").fill("2027-02-16");
    await page.getByRole("button", { name: "Check for duplicates & create" }).click();
    const different = page.getByRole("button", { name: "No, it's different. Create Space" });
    await expect(page.getByText("Space created. You're its first participant.").first().or(different)).toBeVisible({ timeout: 20_000 });
    if (await different.isVisible()) await different.click();
    await expect(page).toHaveURL(/\/setup\?created=1/);
    const slug = /\/s\/([a-z0-9-]+)\//.exec(page.url())![1];
    await page.getByRole("button", { name: "Save & continue" }).click();
    await expect(page.getByTestId("participant-count")).toBeVisible();
    await page.goto("/demo");
    await page.getByLabel("Space", { exact: true }).selectOption({ label: "TreeHacks 2027 (1)" });
    await page.getByLabel("How many").fill("6");
    await page.getByRole("button", { name: "Simulate joins" }).click();
    await expect(page.getByText("Simulated up to 6 synthetic participants joining.")).toBeVisible();

    // A. Jordan invites the recommended Maya and Priya (keeps Alex as a draft candidate only).
    await page.goto(`/s/${slug}/smart`);
    if (await page.getByTestId("proposal").isVisible()) await page.getByRole("button", { name: "Edit preferences" }).click();
    await page.getByRole("button", { name: "Generate team" }).click();
    await expect(page.getByTestId("proposal")).toBeVisible({ timeout: 20_000 });
    const bar = page.getByTestId("send-invites");
    await bar.getByRole("checkbox", { name: "Alex Morgan" }).uncheck();
    await bar.getByRole("button", { name: "Send 2 invitations" }).click();
    await page.getByRole("dialog").getByLabel("Team name").fill("Trojan Builders");
    await page.getByRole("dialog").getByRole("button", { name: "Send invitations" }).click();
    await expect(page).toHaveURL(new RegExp(`/s/${slug}/teams/[0-9a-f-]{36}$`), { timeout: 20_000 });
    const teamUrl = new URL(page.url()).pathname;
    const teamId = teamUrl.split("/").pop()!;
    const workspace = `${teamUrl}/workspace`;
    await expect(page.getByTestId("team-badges")).toContainText("Forming");
    // Not active yet → no workspace.
    await page.goto(workspace);
    await expect(page.getByTestId("workspace-denied")).toContainText("opens when the team is Active");

    // B. Maya and Priya accept.
    for (const [btn, name] of [[/^M Maya/, "Maya Chen"], [/^P Priya/, "Priya Raman"]] as const) {
      await switchTo(btn, name);
      await page.goto("/invitations");
      await page.getByTestId("incoming-invitation").filter({ hasText: "Trojan Builders" }).getByRole("button", { name: /^Accept/ }).click();
      await expect(page).toHaveURL(new RegExp(`${teamUrl}$`), { timeout: 20_000 });
    }

    // C. Active under the existing rule (3 accepted ≥ 2, nothing pending).
    await expect(page.getByTestId("team-badges")).toContainText("Active");

    // Alex (same Space, not a member) can't open the workspace or read messages.
    await switchTo(/^A Alex/, "Alex Morgan");
    await page.goto(workspace);
    await expect(page.getByTestId("workspace-denied")).toContainText("only for the team's members");
    const denied = await page.request.get(`/api/teams/${teamId}/messages`);
    expect(denied.status()).toBe(403);
    expect((await page.request.post(`/api/teams/${teamId}/kickoff`, { headers, data: {} })).status()).toBe(403);

    // D. Jordan opens the team workspace.
    await switchTo(/^J Jordan/, "Jordan Lee");
    await page.goto(teamUrl);
    await page.getByRole("link", { name: "Open workspace" }).click();
    await expect(page).toHaveURL(new RegExp(`${workspace}$`));
    await expect(page.getByTestId("workspace-title")).toHaveText("Trojan Builders");
    await expect(page.getByTestId("workspace-space")).toHaveText("TreeHacks 2027");
    if (mobile) await page.getByRole("tab", { name: "Team details" }).click();
    for (const n of ["Jordan Lee", "Maya Chen", "Priya Raman"]) await expect(page.getByTestId("workspace-members")).toContainText(n);
    await live();
    await expect(page.getByTestId("chat-empty")).toBeVisible();

    // E. Maya sends a message.
    await switchTo(/^M Maya/, "Maya Chen");
    await page.goto(workspace);
    await live();
    const text = "Hi team! I can own the UI and the demo flow.";
    await page.getByTestId("chat-input").fill(text);
    await page.getByTestId("chat-input").press("Enter");
    await expect(page.getByTestId("chat-message").filter({ hasText: text })).toHaveAttribute("data-mine", "true");

    // F. Jordan sees it, attributed to Maya.
    await switchTo(/^J Jordan/, "Jordan Lee");
    await page.goto(workspace);
    await live();
    const msg = page.getByTestId("chat-message").filter({ hasText: text });
    await expect(msg).toBeVisible();
    await expect(msg.getByTestId("chat-author")).toHaveText("Maya Chen");
    await noHorizontalScroll(page);
    await page.screenshot({ path: shot("chat"), fullPage: true });

    // G. AI Kickoff (Gemini when configured on the server; otherwise the labeled deterministic template).
    await page.getByRole("tab", { name: "AI Kickoff" }).click();
    await expect(page.getByTestId("kickoff-empty")).toBeVisible();
    await page.getByRole("button", { name: "Generate kickoff" }).click();
    const kickoff = page.getByTestId("kickoff-content");
    await expect(kickoff).toBeVisible({ timeout: 40_000 });
    expect(["llm", "template"]).toContain(await kickoff.getAttribute("data-source"));
    await expect(page.getByTestId("kickoff-idea").first()).toBeVisible();
    for (const n of ["Jordan Lee", "Maya Chen", "Priya Raman"]) await expect(page.getByTestId("kickoff-roles")).toContainText(n);
    await expect(page.getByTestId("kickoff-roles")).not.toContainText("Alex Morgan");
    await expect(page.getByTestId("kickoff-actions").getByRole("listitem")).toHaveCount(3);
    await noHorizontalScroll(page);
    await page.screenshot({ path: shot("kickoff"), fullPage: true });
    // Persisted: reload shows the same kickoff.
    await page.reload();
    await page.getByRole("tab", { name: "AI Kickoff" }).click();
    await expect(page.getByTestId("kickoff-content")).toBeVisible();

    // H. Reset: the team, its chat and kickoff disappear with the sandbox.
    const reset = await page.request.post("/api/demo/reset", { headers, data: {} });
    expect(reset.status()).toBe(200);
    await page.goto(workspace);
    await expect(page.getByTestId("workspace-title")).toHaveCount(0);
    expect((await page.request.get(`/api/teams/${teamId}/messages`)).status()).toBe(403);
    await page.goto("/spaces?type=hackathon&q=TreeHacks%202027");
    await expect(page.getByRole("heading", { name: "No matching spaces found" }).first()).toBeVisible();

    await page.request.post("/api/demo/end", { headers, data: {} });
    await context.close();
  });

  test("production users never see demo data", async ({ browser }, info) => {
    test.skip(!DEV_PASSWORD, "DEV_TEST_PASSWORD not set");
    const viewport = info.project.use.viewport ?? { width: 1440, height: 900 };
    const context: BrowserContext = await browser.newContext({ viewport });
    const page = await context.newPage();
    const email = info.project.name === "demo-mobile" ? "dev2@trojanmatch.test" : "dev1@trojanmatch.test";
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(DEV_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/spaces/);
    await expect(page.getByRole("status").filter({ hasText: "Demo Mode" })).toHaveCount(0);
    await page.goto("/spaces?type=hackathon&q=AI%40USC%20Hackathon%202026");
    await expect(page.getByRole("heading", { name: "No matching spaces found" }).first()).toBeVisible();
    // Demo controls refuse a production session without a lease.
    const res = await page.request.post("/api/demo/reset", { headers: { origin: new URL(page.url()).origin }, data: {} });
    expect(res.status()).toBe(401);
    await openNav(page, viewport.width);
    await context.close();
  });
});
