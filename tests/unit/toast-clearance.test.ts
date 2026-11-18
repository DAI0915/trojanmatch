import { describe, expect, it } from "vitest";
import { TOAST_BAND, toastClearance } from "@/lib/toast-clearance";

const box = (top: number, bottom: number) => ({ top, bottom, height: bottom - top });
const VH = 812;

describe("toastClearance", () => {
  it("is 0 when nothing marked is near the bottom", () => {
    expect(toastClearance([], VH)).toBe(0);
    expect(toastClearance([box(100, 200)], VH)).toBe(0);
    expect(toastClearance([box(VH - TOAST_BAND - 40, VH - TOAST_BAND - 1)], VH)).toBe(0);
  });

  it("lifts the toast just above a composer at the bottom (unchanged single-control behavior)", () => {
    expect(toastClearance([box(740, 800)], VH)).toBe(VH - 740 + 8);
  });

  it("also clears starter prompts stacked right above the composer", () => {
    const composer = box(700, 800);
    const starters = box(600, 660); // within one toast height above the composer
    const c = toastClearance([starters, composer], VH);
    expect(c).toBe(VH - 600 + 8);
    // The toast strip [VH - c - band, VH - c] now overlaps neither control.
    for (const r of [composer, starters]) expect(VH - c <= r.top || VH - c - TOAST_BAND >= r.bottom).toBe(true);
  });

  it("ignores controls far enough above the toast, and hidden ones", () => {
    const composer = box(700, 800);
    expect(toastClearance([box(100, 300), composer, { top: 0, bottom: 0, height: 0 }], VH)).toBe(VH - 700 + 8);
  });

  it("never lifts by more than 60% of the screen", () => {
    const stack = Array.from({ length: 12 }, (_, i) => box(VH - 70 * (i + 1), VH - 70 * i - 10));
    expect(toastClearance(stack, VH)).toBe(Math.round(VH * 0.6));
  });
});
