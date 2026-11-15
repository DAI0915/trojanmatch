import { z } from "zod";
import { isValidHourList } from "@/lib/availability";
import { normalizeCustomTag } from "@/lib/taxonomy";

export const httpUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === "https:" || u.protocol === "http:";
    } catch {
      return false;
    }
  }, "Enter a full link starting with https://");

/** Empty string → undefined, so optional form fields can be left blank. */
export const blankToUndefined = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), schema.optional());

export const isIanaTimeZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};
export const timeZone = z.string().max(64).refine(isIanaTimeZone, "Unknown time zone");

export const hourList = z
  .array(z.number().int())
  .refine(isValidHourList, "Invalid availability")
  .transform((h) => [...new Set(h)].sort((a, b) => a - b));

/** Known ids pass through; free-text tags are normalized (lowercase, ≤30 chars). */
export const tagList = (max: number, isKnown?: (id: string) => boolean) =>
  z
    .array(z.string().max(40))
    .max(max, `Choose at most ${max}`)
    .transform((tags, ctx) => {
      const out: string[] = [];
      for (const t of tags) {
        const v = isKnown?.(t) ? t : normalizeCustomTag(t);
        if (!v) {
          ctx.addIssue({ code: "custom", message: `“${t}” is not a valid tag` });
          return z.NEVER;
        }
        if (!out.includes(v)) out.push(v);
      }
      return out;
    });

export const enumList = <T extends string>(ids: readonly T[], max: number) =>
  z
    .array(z.enum(ids as unknown as [T, ...T[]]))
    .max(max)
    .transform((l) => [...new Set(l)]);
