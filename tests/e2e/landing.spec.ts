import { expect, test, type Page } from "@playwright/test";

/**
 * Landing page: layout at 375 / 768 / 1440 / 1920, real destinations for every
 * link, the layered (upright) product showcase, the four-item benefits row, and
 * the demo buttons' shared state. No real sandbox is ever started here: the
 * demo API is stubbed, so this is safe to run against production.
 */

const WIDTHS = [
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];

async function layout(page: Page) {
  return page.evaluate(() => {
    const box = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom };
    };
    const windows = [...document.querySelectorAll<HTMLElement>("[data-window]")].map((el) => {
      const cs = getComputedStyle(el);
      return {
        name: el.dataset.window!,
        shown: cs.display !== "none",
        transform: cs.transform,
        rotate: cs.rotate,
        z: Number(cs.zIndex),
        box: box(el)!,
      };
    });
    const benefits = [...document.querySelectorAll("#features li")].map((li) => box(li)!);
    return {
      vw: window.innerWidth,
      overflow: document.documentElement.scrollWidth > window.innerWidth,
      header: [...document.querySelectorAll("header a, header button")]
        .filter((e) => getComputedStyle(e).display !== "none" && (e as HTMLElement).offsetParent !== null)
        .map((e) => box(e)!),
      windows,
      benefits,
      featuresBottom: box(document.getElementById("features"))!.bottom,
      // Free space above the hero (under the header) and below the benefits row (above the footer).
      gapTop: document.querySelector("main p")!.getBoundingClientRect().top - document.querySelector("header")!.getBoundingClientRect().bottom,
      gapBottom: document.querySelector("footer")!.getBoundingClientRect().top - document.querySelector("#features ul")!.getBoundingClientRect().bottom,
      clipped: [...document.querySelectorAll("main h1, main p, #features h2")].filter((e) => {
        const el = e as HTMLElement;
        return el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== "hidden";
      }).length,
    };
  });
}

test.describe("Landing page @smoke", () => {
  test("content, real destinations, and no old feature cards", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    await expect(page.getByText("For USC students · Hackathons & course projects")).toBeVisible();
    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toHaveText(/Stop searching\.\s*Start building\./);
    await expect(page.getByText("TrojanMatch helps students find compatible teammates, build complete teams")).toBeVisible();

    // Header navigation: every item goes somewhere real.
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav.getByRole("link", { name: "Features" })).toHaveAttribute("href", "#features");
    await expect(nav.getByRole("link", { name: "How it works" })).toHaveAttribute("href", "/demo");
    const demoLink = nav.getByRole("link", { name: /^Demo/ });
    await expect(demoLink).toHaveAttribute("href", /youtu/);
    await expect(demoLink).toHaveAttribute("target", "_blank");
    await expect(nav.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
    await expect(page.getByTestId("try-demo-header")).toHaveAccessibleName("Try Interactive Demo");

    // Hero CTAs.
    await expect(page.getByTestId("try-demo")).toHaveText("Try Interactive Demo");
    const video = page.getByRole("link", { name: /Watch 3-min demo/ });
    await expect(video).toHaveAttribute("href", /youtu/);
    await expect(video).toHaveAttribute("target", "_blank");

    // Benefits row: exactly the four items; the old cards are gone.
    const items = page.locator("#features li");
    await expect(items).toHaveCount(4);
    for (const t of ["Built for USC students", "Whole-team matching", "Private demo sandbox", "AI team kickoff"]) {
      await expect(page.locator("#features").getByRole("heading", { name: t })).toBeVisible();
    }
    for (const old of ["One Space, relevant people", "Team-level matching", "You stay in control"]) {
      await expect(page.getByText(old)).toHaveCount(0);
    }
    await expect(page.getByText("not affiliated with or endorsed by USC")).toBeVisible();

    // The showcase is one described image, nothing focusable inside.
    const showcase = page.getByRole("img", { name: /TrojanMatch preview with synthetic demo data/ });
    await expect(showcase).toBeVisible();
    await expect(showcase).toHaveAccessibleName(/example messages/);
    if ((page.viewportSize()?.width ?? 0) >= 520) {
      await expect(page.locator("[data-window=workspace]")).toContainText("Example messages · synthetic demo");
    }
    expect(await showcase.locator("a, button, input, [tabindex]").count()).toBe(0);

    // In-page and same-site navigation work.
    await nav.getByRole("link", { name: "Features" }).click();
    await expect(page).toHaveURL(/#features$/);
    await expect(page.locator("#features")).toBeInViewport();
    await nav.getByRole("link", { name: "How it works" }).click();
    await expect(page).toHaveURL(/\/demo$/);
    await expect(page.getByRole("heading", { name: "Try TrojanMatch in one click" })).toBeVisible();
    await page.goto("/");
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/sign-in/);
  });

  for (const vp of WIDTHS) {
    test(`layout at ${vp.width}px`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.goto("/");
      await expect(page.getByTestId("product-showcase")).toBeVisible();
      const l = await layout(page);

      expect(l.overflow, "no horizontal scroll").toBe(false);
      expect(l.clipped, "no clipped text").toBe(0);
      for (const b of l.header) expect(b.right, "header items inside the viewport").toBeLessThanOrEqual(l.vw);

      // Windows: upright (no rotation / skew / perspective), inside the viewport, layered.
      const shown = l.windows.filter((w) => w.shown);
      for (const w of shown) {
        expect(w.transform, `${w.name} has no transform`).toBe("none");
        expect(w.rotate, `${w.name} is not rotated`).toBe("none");
        expect(w.box.x).toBeGreaterThanOrEqual(0);
        expect(w.box.right).toBeLessThanOrEqual(l.vw);
      }
      const byName = Object.fromEntries(l.windows.map((w) => [w.name, w]));
      expect(byName.discover.shown).toBe(true);
      expect(byName.workspace.shown).toBe(true);
      expect(byName.discover.z).toBeGreaterThan(byName.workspace.z);
      expect(byName.discover.box.w, "Discover is the most prominent window").toBeGreaterThan(byName.workspace.box.w);
      // The workspace window is partly visible (it sticks out past Discover).
      const d = byName.discover.box;
      const ws = byName.workspace.box;
      expect(ws.y < d.y || ws.right > d.right).toBe(true);
      if (vp.width >= 1440) {
        expect(byName.recommendation.shown, "all three windows on desktop").toBe(true);
        expect(byName.workspace.z).toBeGreaterThan(byName.recommendation.z);
        expect(byName.recommendation.box.right).toBeGreaterThan(ws.right);
      }

      // Benefits: one row on desktop, and the whole first screen fits a 1440×900 / 1920×1080 viewport.
      if (vp.width >= 1440) {
        const tops = new Set(l.benefits.map((b) => Math.round(b.y)));
        expect(tops.size, "benefits in one row").toBe(1);
        expect(l.featuresBottom).toBeLessThanOrEqual(vp.height);
        // Balanced composition: no heavy empty band under the benefits row.
        expect(Math.abs(l.gapBottom - l.gapTop), `top ${l.gapTop}px vs bottom ${l.gapBottom}px`).toBeLessThanOrEqual(40);
        expect(l.gapBottom).toBeLessThanOrEqual(vp.height * 0.15);
      }

      await page.screenshot({ path: `test-results/screens/landing-${vp.width}.png` });
    });
  }

  test("header and hero demo buttons share one state: a refused start is explained once, nothing is retried", async ({ page }) => {
    let starts = 0;
    const retryAt = new Date(Date.now() + 25 * 60_000).toISOString();
    await page.route("**/api/demo/status", (r) => r.fulfill({ json: { lease: false } }));
    await page.route("**/api/demo/start", (r) => {
      starts++;
      return r.fulfill({
        status: 429,
        json: { error: { code: "RATE_LIMITED", message: "Too many demos.", details: { retry_at: retryAt } } },
      });
    });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.getByTestId("try-demo-header").dblclick();
    const panel = page.getByTestId("try-demo-blocked");
    await expect(panel).toBeVisible();
    await expect(panel).toBeInViewport();
    await expect(panel).toContainText("Demo limit reached for your network");
    await expect(page.getByTestId("try-demo-retry")).toContainText("You can start a new demo at");
    await expect(page.getByTestId("try-demo")).toBeDisabled();
    await expect(page.getByTestId("try-demo-header")).toBeDisabled();
    expect(starts).toBe(1);
    // The first-visit hint gives way to the explanation.
    await expect(page.getByText("No sign-up needed.")).toHaveCount(0);
  });

  test("a browser that still holds a sandbox is offered to resume it from both buttons", async ({ page }) => {
    await page.route("**/api/demo/status", (r) => r.fulfill({ json: { lease: true } }));
    await page.goto("/");
    await expect(page.getByTestId("try-demo")).toHaveText("Resume your demo");
    await expect(page.getByTestId("try-demo-header")).toHaveText("Resume demo");
    await expect(page.getByText("Your private sandbox is still open.")).toBeVisible();
    await expect(page.getByText("No sign-up needed.")).toHaveCount(0);
  });
});
