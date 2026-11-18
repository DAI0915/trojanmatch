"use client";

import { useEffect } from "react";
import { toastClearance } from "@/lib/toast-clearance";

/**
 * Keeps bottom toasts clear of the controls people are using. Any element marked
 * `data-toast-avoid` (chat composer, sticky Save bars, Send invitations) that
 * reaches into the toast area at the bottom of the viewport lifts the toaster
 * just above it, and above anything stacked right on top of it (e.g. chat starter
 * prompts above the composer), via the `--toast-clearance` CSS variable. Layout only.
 */
export function ToastClearance() {
  useEffect(() => {
    let frame = 0;
    let last = "";
    const update = () => {
      frame = 0;
      const boxes = [...document.querySelectorAll<HTMLElement>("[data-toast-avoid]")].map((el) => el.getBoundingClientRect());
      const value = `${toastClearance(boxes, window.innerHeight)}px`;
      if (value !== last) {
        last = value;
        document.documentElement.style.setProperty("--toast-clearance", value);
      }
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("scroll", schedule, { passive: true, capture: true });
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}
