/**
 * P6 realtime team chat with TWO signed-in users (the confirmed dev accounts) in
 * two browser contexts, at 1440px and 375px. Creates ONE tagged Space per
 * viewport (owned by dev2) and a 2-person team that becomes Active.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";

const PASSWORD = process.env.DEV_TEST_PASSWORD ?? "";
const RUN = (process.env.E2E_SPACE_TAG ?? "").replace(/[^a-z]/gi, "") || "Local";
const DEV1 = "dev1@trojanmatch.test";
const DEV2 = "dev2@trojanmatch.test";

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

const consent = {
  goal: "build", goal_note: "", desired_roles: ["backend"], topics: [], availability_override: null,
  looking_for_team: true, accept_invites: true, smart_match_opt_in: true, visible_to_members: true, notes: "",
};

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow, `horizontal scroll on ${page.url()}`).toBe(false);
}

async function openChat(page: Page, mobile: boolean) {
  if (mobile) await page.getByRole("tab", { name: "Chat" }).click();
  await expect(page.getByTestId("connection-status")).toHaveAttribute("data-state", "live", { timeout: 20_000 });
}

test.describe("P6 realtime team chat", () => {
  test.skip(!PASSWORD, "DEV_TEST_PASSWORD not set");
  test.setTimeout(180_000);

  test("two members chat live; history survives reload; access is members-only", async ({ browser }, info) => {
    const viewport = info.project.use.viewport ?? { width: 1440, height: 900 };
    const mobile = viewport.width < 1024;
    const shot = (n: string) => `test-results/screens/p6-${n}-${info.project.name}.png`;
    const owner = await signedIn(browser, DEV2, viewport);
    const member = await signedIn(browser, DEV1, viewport);
    const headers = { origin: new URL(owner.url()).origin };
    const teamName = `Chat ${RUN} ${info.project.name}`;

    // Setup through the same APIs the UI uses: a tagged Space, both opted in, a 2-person team.
    const created = await owner.request.post("/api/spaces", {
      headers,
      data: {
        type: "hackathon", title: `P6 Chat ${RUN} ${info.project.name}`, edition_year: 2031, start_date: "2031-03-01", end_date: "2031-03-02",
        timezone: "America/Los_Angeles", format: "online", visibility: "public",
      },
    });
    expect(created.status()).toBe(201);
    const { space_id: spaceId, slug } = (await created.json()).space as { space_id: string; slug: string };
    expect((await member.request.post(`/api/spaces/${spaceId}/join`, { headers, data: {} })).status()).toBe(200);
    for (const p of [owner, member]) expect((await p.request.put(`/api/spaces/${spaceId}/participation`, { headers, data: consent })).ok()).toBe(true);
    const team = await owner.request.post(`/api/spaces/${spaceId}/teams`, {
      headers, data: { name: teamName, description: "", open_positions: 1, recruiting: true, requirements: {} },
    });
    expect(team.status()).toBe(201);
    const teamId = (await team.json()).team.team_id as string;
    const workspace = `/s/${slug}/teams/${teamId}/workspace`;

    // Before activation the chat is closed, even for the owner.
    const early = await owner.request.get(`/api/teams/${teamId}/messages`);
    expect(early.status()).toBe(409);
    expect((await early.json()).error.code).toBe("TEAM_NOT_ACTIVE");

    const memberId = (await (await member.request.get("/api/profile")).json()).profile.id as string;
    expect((await owner.request.post(`/api/teams/${teamId}/invitations`, { headers, data: { user_ids: [memberId] } })).status()).toBe(201);

    // The pending invitee can't read the chat or open the workspace.
    const pendingRead = await member.request.get(`/api/teams/${teamId}/messages`);
    expect(pendingRead.status()).toBe(403);
    await member.goto(workspace);
    await expect(member.getByTestId("workspace-denied")).toBeVisible();

    // Accept → 2 of 2 accepted, nothing pending → Active.
    await member.goto("/invitations");
    await member.getByTestId("incoming-invitation").filter({ hasText: teamName }).getByRole("button", { name: /^Accept/ }).click();
    await expect(member).toHaveURL(new RegExp(`/s/${slug}/teams/${teamId}$`), { timeout: 20_000 });
    await expect(member.getByTestId("team-badges")).toContainText("Active");
    await member.getByRole("link", { name: "Open workspace" }).click();
    await expect(member).toHaveURL(new RegExp(`${workspace}$`));
    await owner.goto(workspace);
    await expect(owner.getByTestId("workspace-title")).toHaveText(teamName);
    if (mobile) await owner.getByRole("tab", { name: "Team details" }).click();
    await expect(owner.getByTestId("workspace-members")).toContainText("Dev Tester A");
    await expect(owner.getByTestId("workspace-members")).toContainText("Dev Tester B");
    await openChat(owner, mobile);
    await openChat(member, mobile);
    await expect(owner.getByTestId("chat-empty")).toBeVisible();
    await owner.waitForTimeout(3000); // let both change-feed subscriptions register

    // Live delivery both ways, no reload.
    const hello = `Hello from dev1 ${Date.now()}`;
    await member.getByTestId("chat-input").fill(hello);
    await member.getByTestId("chat-input").press("Enter");
    await expect(member.getByTestId("chat-body").filter({ hasText: hello })).toBeVisible();
    const received = owner.getByTestId("chat-message").filter({ hasText: hello });
    await expect(received).toBeVisible({ timeout: 15_000 });
    await expect(received.getByTestId("chat-author")).toHaveText("Dev Tester A");
    const reply = `Reply from dev2 ${Date.now()}`;
    await owner.getByTestId("chat-input").fill(reply);
    await owner.getByRole("button", { name: "Send message" }).click();
    await expect(member.getByTestId("chat-message").filter({ hasText: reply })).toBeVisible({ timeout: 15_000 });

    // Unsafe content renders as plain text.
    const html = `<img src=x onerror="window.__xss=1"> <b>bold?</b>`;
    await member.getByTestId("chat-input").fill(html);
    await member.getByTestId("chat-input").press("Enter");
    await expect(owner.getByTestId("chat-body").filter({ hasText: "<b>bold?</b>" })).toBeVisible({ timeout: 15_000 });
    expect(await owner.getByTestId("chat-list").locator("img, b").count()).toBe(0);
    expect(await owner.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();

    // Retried sends (same client_id) never duplicate.
    const clientId = crypto.randomUUID();
    const a = await member.request.post(`/api/teams/${teamId}/messages`, { headers, data: { body: "idempotent", client_id: clientId } });
    const b = await member.request.post(`/api/teams/${teamId}/messages`, { headers, data: { body: "idempotent", client_id: clientId } });
    expect((await a.json()).message.id).toBe((await b.json()).message.id);
    await expect(owner.getByTestId("chat-body").filter({ hasText: /^idempotent$/ })).toHaveCount(1, { timeout: 15_000 });

    // Input limits.
    const tooLong = await member.request.post(`/api/teams/${teamId}/messages`, { headers, data: { body: "x".repeat(2001), client_id: crypto.randomUUID() } });
    expect(tooLong.status()).toBe(400);
    const crossOrigin = await member.request.post(`/api/teams/${teamId}/messages`, {
      headers: { origin: "https://evil.example" }, data: { body: "csrf", client_id: crypto.randomUUID() },
    });
    expect(crossOrigin.status()).toBe(403);

    // History persists across reloads (both sides).
    await member.reload();
    await openChat(member, mobile);
    for (const t of [hello, reply, "idempotent"]) await expect(member.getByTestId("chat-body").filter({ hasText: t }).first()).toBeVisible();
    await noHorizontalScroll(member);
    await member.screenshot({ path: shot("chat"), fullPage: true });

    // Kickoff panel works for members (Gemini if configured, otherwise the labeled template).
    await owner.getByRole("tab", { name: "AI Kickoff" }).click();
    await owner.getByRole("button", { name: "Generate kickoff" }).click();
    await expect(owner.getByTestId("kickoff-content")).toBeVisible({ timeout: 40_000 });
    await expect(owner.getByTestId("kickoff-roles")).toContainText("Dev Tester A");
    await noHorizontalScroll(owner);
    await owner.screenshot({ path: shot("kickoff"), fullPage: true });

    await owner.context().close();
    await member.context().close();
  });
});
