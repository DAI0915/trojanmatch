import { expect, test, type Page } from "@playwright/test";

const DEV1 = "dev1@trojanmatch.test";
// Each viewport project uses its own account so parallel runs stay isolated.
const accountFor = (project: string) => (project === "mobile" ? "dev2@trojanmatch.test" : DEV1);
const nameFor = (project: string) => (project === "mobile" ? "Dev Tester B" : "Dev Tester A");
const PASSWORD = process.env.DEV_TEST_PASSWORD ?? "";

async function signIn(page: Page, email = DEV1, password = PASSWORD) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test.describe("P1 — auth & shell @smoke", () => {
  test("landing renders value prop and CTAs, no horizontal scroll", async ({ page }, info) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Stop searching.");
    // The password-free interactive demo is the primary call to action (a button: one click starts it).
    await expect(page.getByTestId("try-demo")).toHaveText("Try Interactive Demo");
    await expect(page.getByRole("link", { name: /Watch 3-min demo/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(page.getByText("not affiliated with or endorsed by USC")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
    await page.screenshot({ path: `test-results/screens/landing-${info.project.name}.png`, fullPage: true });
  });

  test("protected pages redirect to sign-in with a safe next param", async ({ page }) => {
    await page.goto("/teams");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fteams/);
  });

  test("protected API returns 401 JSON without a session", async ({ request }) => {
    const res = await request.get("/api/profile");
    expect(res.status()).toBe(401);
    expect((await res.json()).error.code).toBe("NOT_AUTHENTICATED");
  });

  test("wrong password shows a generic error", async ({ page }) => {
    await signIn(page, DEV1, "definitely-wrong-password");
    await expect(page.locator("form [role=alert]")).toHaveText("Incorrect email or password.");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("confirmed dev account signs in, sees the shell, and signs out", async ({ page }, info) => {
    test.skip(!PASSWORD, "DEV_TEST_PASSWORD not set");
    const email = accountFor(info.project.name);
    await signIn(page, email);
    await expect(page).toHaveURL(/\/spaces$/);
    await expect(page.getByRole("heading", { name: "Find your hackathon or course project" })).toBeVisible();
    // Works on a fresh DB (empty state) and on persistent environments (joined Spaces).
    await expect(page.getByRole("heading", { name: "My hackathon Spaces" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Change Matching Space" })).toContainText("No Space selected");
    await page.screenshot({ path: `test-results/screens/spaces-${info.project.name}.png`, fullPage: true });

    // Navigation works (desktop sidebar or mobile sheet).
    if (info.project.name === "mobile") {
      await page.getByRole("button", { name: "Open navigation" }).click();
    }
    await page.getByRole("link", { name: "My Teams" }).click();
    await expect(page.getByRole("heading", { name: "My Teams" })).toBeVisible();
    // Fresh accounts see the empty state; accounts that already own teams (persistent
    // environments) see their team list instead. Either is correct.
    await expect(
      page.getByText("Creating a Space never creates a team.").or(page.getByRole("main").getByRole("listitem").first()),
    ).toBeVisible();

    // Own profile via API (session-derived identity).
    const api = await page.request.get("/api/profile");
    expect(api.status()).toBe(200);
    const body = await api.json();
    expect(body.profile.display_name).toBe(nameFor(info.project.name));
    expect(body.profile.scope).toBe("prod");
    expect(JSON.stringify(body)).not.toContain(email); // email is never in profile payloads

    // Space switcher opens and offers "Find or create a Space".
    if (info.project.name === "mobile") await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Change Matching Space" }).click();
    await expect(page.getByRole("menuitem", { name: "Find or create a Space" })).toBeVisible();
    await page.keyboard.press("Escape");

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL("/");
    await page.goto("/spaces");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("cross-origin sign-out POST is rejected (CSRF)", async ({ request }) => {
    const res = await request.post("/auth/sign-out", { headers: { origin: "https://evil.example" } });
    expect(res.status()).toBe(403);
  });

  test("sign-up page honours the server flag", async ({ page }) => {
    await page.goto("/sign-up");
    const enabled = process.env.PUBLIC_SIGNUP_ENABLED === "true";
    if (enabled) {
      await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
    } else {
      await expect(page.getByText("Sign-up isn't open yet")).toBeVisible();
    }
  });
});
