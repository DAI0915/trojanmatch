import { describe, expect, it } from "vitest";
import { isPublicPath, safeNextPath } from "@/lib/routes";
import { currentSlug, hrefFor, NAV_ITEMS } from "@/components/shell/nav-items";

describe("safeNextPath (open-redirect guard)", () => {
  it("keeps same-site relative paths", () => {
    expect(safeNextPath("/s/treehacks-2027-ab12cd/smart")).toBe("/s/treehacks-2027-ab12cd/smart");
  });
  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "", null, undefined])(
    "rejects %s",
    (v) => {
      expect(safeNextPath(v as string | null | undefined)).toBe("/spaces");
    },
  );
});

describe("isPublicPath", () => {
  it("marks auth, landing and demo bootstrap as public", () => {
    for (const p of ["/", "/sign-in", "/sign-up", "/demo", "/auth/confirm", "/api/demo/start", "/api/health"]) {
      expect(isPublicPath(p)).toBe(true);
    }
  });
  it("protects app pages and non-demo APIs", () => {
    for (const p of ["/spaces", "/teams", "/s/x/smart", "/api/profile", "/api/demos", "/demo/x"]) {
      expect(isPublicPath(p)).toBe(false);
    }
  });
});

describe("Space context comes from the URL", () => {
  it("parses the current slug", () => {
    expect(currentSlug("/s/treehacks-2027-ab12cd/discover")).toBe("treehacks-2027-ab12cd");
    expect(currentSlug("/s/treehacks-2027-ab12cd")).toBe("treehacks-2027-ab12cd");
    expect(currentSlug("/spaces")).toBeNull();
  });
  it("sends space-scoped nav to /spaces when no Space is selected", () => {
    const smart = NAV_ITEMS.find((i) => i.key === "smart")!;
    expect(hrefFor(smart, null)).toBe("/spaces");
    expect(hrefFor(smart, "abc123")).toBe("/s/abc123/smart");
  });
});
