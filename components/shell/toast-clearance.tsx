"use client";

import { useEffect } from "react";

/** How tall the strip at the bottom of the screen is where toasts appear (toast + offset). */
const TOAST_BAND = 112;

/**
 * Keeps bottom toasts clear of the controls people are using. Any element marked
 * `data-toast-avoid` (chat composer, sticky Save bars, Send invitations) that
 * reaches into the toast area at the bottom of the viewport lifts the toaster
 * just above it via the `--toast-clearance` CSS variable. Layout only.
 */
export function ToastClearance() {
  useEffect(() => {
    let frame = 0;
    let last = "";
    const update = () => {
      frame = 0;
      const vh = window.innerHeight;
      let clearance = 0;
      for (const el of document.querySelectorAll<HTMLElement>("[data-toast-avoid]")) {
        const r = el.getBoundingClientRect();
        if (r.height === 0 || r.top >= vh || r.bottom <= vh - TOAST_BAND) continue;
        clearance = Math.max(clearance, vh - r.top + 8);
      }
      const value = `${Math.round(Math.min(clearance, vh * 0.6))}px`;
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
