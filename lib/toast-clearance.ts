/** How tall the strip at the bottom of the screen is where a toast appears (toast + offset). */
export const TOAST_BAND = 112;

type Box = { top: number; bottom: number; height: number };

/**
 * How far to lift bottom toasts so they don't cover any of `boxes` (viewport
 * coordinates of controls marked `data-toast-avoid`). The toast starts at the
 * bottom of the viewport; while a control reaches into the strip it would
 * occupy, it moves just above that control, so controls stacked near the
 * bottom (a composer with starter prompts above it) are all cleared.
 * Capped at 60% of the viewport height.
 */
export function toastClearance(boxes: Box[], vh: number, band = TOAST_BAND): number {
  let edge = vh; // the toast strip must end above this line
  for (let moved = true, guard = 0; moved && guard < 20; guard++) {
    moved = false;
    for (const r of boxes) {
      if (r.height === 0 || r.top >= edge || r.bottom <= edge - band) continue;
      edge = r.top - 8;
      moved = true;
    }
  }
  return Math.round(Math.min(Math.max(vh - edge, 0), vh * 0.6));
}
