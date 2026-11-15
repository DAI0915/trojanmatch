/**
 * P3 presenter demo sandbox, end to end (runs at 1440px, then 375px).
 * Requires DEMO_PRESENTER_CODE (and DEV_TEST_PASSWORD for the prod-side check).
 */
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

const CODE = process.env.DEMO_PRESENTER_CODE ?? "";
const DEV_PASSWORD = process.env.DEV_TEST_PASSWORD ?? "";

test.describe.configure({ mode: "serial" });

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow, `horizontal scroll on ${page.url()}`).toBe(false);
}

async function startDemo(browser: Browser, viewport: { width: number; height: number }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.goto("/demo");
  await page.getByLabel("Presenter code").fill(CODE);
  await page.getByRole("button", { name: "Start presenter demo" }).click();
  await expect(page).toHaveURL(/\/spaces$/, { timeout: 30_000 });
  return { context, page };
}

async function openNav(page: Page, viewportWidth: number) {
  if (viewportWidth < 1024) await page.getByRole("button", { name: "Open navigation" }).click();
}

test.describe("P3 presenter demo sandbox", () => {
  test.skip(!CODE, "DEMO_PRESENTER_CODE not set");
  test.setTimeout(180_000);

  test("rejects unauthorized demo requests", async ({ playwright, baseURL }) => {
    const api = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { origin: new URL(baseURL!).origin } });
    for (const path of ["/api/demo/switch", "/api/demo/reset", "/api/demo/simulate-joins"]) {
      const res = await api.post(path, { data: { persona: "maya", spaceId: crypto.randomUUID(), count: 1 } });
      expect(res.status(), path).toBe(401);
      expect((await res.json()).error.code).toBe("DEMO_LEASE_INVALID");
    }
    // One wrong attempt per run (desktop only) so repeated runs never exhaust the presenter's throttle.
    if (test.info().project.name === "demo-desktop") {
      const wrong = await api.post("/api/demo/start", { data: { code: "definitely-not-the-code" } });
      expect(wrong.status()).toBe(400);
      expect((await wrong.json()).error.code).toBe("INVALID_CODE");
    }
    // Cross-origin bootstrap is refused even with the right code.
    const xorigin = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { origin: "https://evil.example" } });
    expect((await xorigin.post("/api/demo/start", { data: { code: CODE } })).status()).toBe(403);
    await api.dispose();
    await xorigin.dispose();
  });

  test("start → labels → isolation → create → simulate → switch → persist → reset → re-lease", async ({ browser }, info) => {
    const viewport = info.project.use.viewport ?? { width: 1440, height: 900 };
    const shot = (n: string) => `test-results/screens/p3-${n}-${info.project.name}.png`;
    const { context, page } = await startDemo(browser, viewport);

    // Presenter authentication + synthetic labeling.
    const banner = page.getByRole("status").filter({ hasText: "Demo Mode" });
    await expect(banner).toContainText("You are Jordan Lee (synthetic persona)");
    await noHorizontalScroll(page);
    await page.screenshot({ path: shot("spaces"), fullPage: true });

    // The seeded hackathon shows real counts, all labeled synthetic.
    await page.goto("/spaces?type=hackathon&q=AI%40USC");
    await page.getByRole("link", { name: /AI@USC Hackathon 2026/ }).click();
    await expect(page.getByTestId("participant-count")).toHaveText("32 participants in this Space (32 synthetic)");
    await expect(page.getByText("Demo sandbox · synthetic").first()).toBeVisible();

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
    await expect(page.getByTestId("participant-count")).toHaveText("13 participants in this Space (12 synthetic)");
    await noHorizontalScroll(page);
    await page.screenshot({ path: shot("simulated"), fullPage: true });

    // Persona switching: Maya (who was simulated into TreeHacks 2027 first).
    await page.goto("/demo");
    await page.getByRole("button", { name: /^M Maya/ }).click();
    await expect(page).toHaveURL(/\/spaces$/);
    await page.goto("/spaces?type=hackathon");
    await expect(page.getByRole("status").filter({ hasText: "Demo Mode" })).toContainText("You are Maya Chen (synthetic persona)");
    await expect(page.getByRole("link", { name: /TreeHacks 2027/ })).toBeVisible();

    // Profile persistence within the sandbox (as Maya), restored by reset.
    await page.goto("/profile");
    await page.getByLabel("University").fill("Demo University");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByText("Profile saved.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("University")).toHaveValue("Demo University");

    // Reset: TreeHacks 2027 disappears, counts and profiles are restored; Maya stays signed in.
    await page.goto("/demo");
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Reset demo" }).click();
    await expect(page.getByText("Demo sandbox reset.")).toBeVisible({ timeout: 30_000 });
    await page.goto("/spaces?type=hackathon&q=TreeHacks%202027");
    await expect(page.getByRole("heading", { name: "No matching spaces found" }).first()).toBeVisible();
    await page.goto("/profile");
    await expect(page.getByLabel("University")).toHaveValue("USC");

    // Switch back to Jordan via the controls.
    await page.goto("/demo");
    await page.getByRole("button", { name: /^J Jordan/ }).click();
    await expect(page).toHaveURL(/\/spaces$/);
    await expect(page.getByRole("status").filter({ hasText: "Demo Mode" })).toContainText("You are Jordan Lee (synthetic persona)");

    // Re-lease from another browser invalidates this session on its next request.
    // (The proxy may notice on a background request first, so the old browser can land on either page.)
    const second = await startDemo(browser, viewport);
    await page.goto("/spaces");
    await expect(page).toHaveURL(/\/demo\?expired=1|\/sign-in/);
    const after = await page.request.get("/api/profile");
    expect(after.status()).toBe(401);
    await page.goto("/demo");
    await expect(page.getByRole("button", { name: "Start presenter demo" })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Demo Mode" })).toHaveCount(0);

    // End the demo cleanly from the second browser.
    await second.page.goto("/demo");
    await second.page.getByRole("button", { name: "End demo" }).click();
    await expect(second.page.getByRole("button", { name: "Start presenter demo" })).toBeVisible();

    await context.close();
    await second.context.close();
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
