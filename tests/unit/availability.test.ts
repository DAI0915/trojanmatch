import { describe, expect, it } from "vitest";
import { blockHours, isValidHourList, localToUtcHours, tzOffsetHours, utcToLocalHours } from "@/lib/availability";

const WINTER = new Date("2027-01-15T12:00:00Z");
const SUMMER = new Date("2027-07-15T12:00:00Z");

describe("time-zone offsets", () => {
  it("handles DST for Los Angeles", () => {
    expect(tzOffsetHours("America/Los_Angeles", WINTER)).toBe(-8);
    expect(tzOffsetHours("America/Los_Angeles", SUMMER)).toBe(-7);
  });
  it("handles zones without DST and east of UTC", () => {
    expect(tzOffsetHours("Asia/Tokyo", WINTER)).toBe(9);
    expect(tzOffsetHours("UTC", WINTER)).toBe(0);
  });
});

describe("local ⇄ UTC hour-of-week", () => {
  it("converts Saturday noon in LA (winter) to Saturday 20:00 UTC", () => {
    const satNoon = 6 * 24 + 12;
    expect(localToUtcHours([satNoon], "America/Los_Angeles", WINTER)).toEqual([6 * 24 + 20]);
  });
  it("wraps around the week boundary", () => {
    // Sunday 02:00 in Tokyo is Saturday 17:00 UTC.
    expect(localToUtcHours([2], "Asia/Tokyo", WINTER)).toEqual([6 * 24 + 17]);
  });
  it("round-trips", () => {
    const hours = [...blockHours(1, 16), ...blockHours(6, 8)];
    for (const tz of ["America/Los_Angeles", "America/New_York", "Asia/Tokyo", "Europe/London"]) {
      const utc = localToUtcHours(hours, tz, SUMMER);
      expect(utcToLocalHours(utc, tz, SUMMER)).toEqual([...hours].sort((a, b) => a - b));
    }
  });
  it("dedupes and sorts", () => {
    expect(localToUtcHours([5, 5, 3], "UTC")).toEqual([3, 5]);
  });
});

describe("blocks and validation", () => {
  it("expands a 4-hour block", () => {
    expect(blockHours(0, 8)).toEqual([8, 9, 10, 11]);
  });
  it("validates hour lists", () => {
    expect(isValidHourList([0, 167])).toBe(true);
    expect(isValidHourList([168])).toBe(false);
    expect(isValidHourList([-1])).toBe(false);
    expect(isValidHourList([1.5])).toBe(false);
    expect(isValidHourList("0,1")).toBe(false);
  });
});
