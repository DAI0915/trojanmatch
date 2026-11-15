import { cn } from "@/lib/utils";

/**
 * TrojanMatch helmet mark: an original, generic crested-helmet silhouette on a
 * cardinal rounded square. Deliberately NOT a USC mark: TrojanMatch is not an
 * official USC app. Same geometry as app/icon.svg (favicon) and app/apple-icon.png.
 */
export function HelmetMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("shrink-0", className)} aria-hidden focusable="false">
      <rect width="64" height="64" rx="15" fill="var(--primary)" />
      <g transform="translate(-1.2 1.2)">
        <path
          d="M18.6 29 C17.8 14.5 27.6 6.6 39 7.6 C47.8 8.4 54 14.6 54.4 23 L50.6 24.4 C49.8 18.6 45 14.6 38.4 14.3 C29.6 13.9 23.2 19.6 23 28.6 Z"
          fill="var(--brand-gold)"
        />
        <path
          d="M27.2 15.6 L24.6 12.4 M35 13.4 L34.2 9.2 M43.2 14.4 L45.6 10.8 M49.4 19.6 L53.4 18.2"
          stroke="var(--primary)"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          fillRule="evenodd"
          fill="#FFF4D6"
          d="M14 51 C17 48 18.5 44 18.5 38.5 C18.5 25.5 26 17.6 36 17.6 C45 17.6 51 24 51 32 L51 49.5 C51 51 49.8 52 48.3 52 L38.5 52 C36.6 52 35.4 50.8 35 49 L34 45.5 C31.6 48.4 27.4 51 21.5 52 L14 52.5 Z M51 34 L43.5 34 C41.4 34 40 35.6 40 37.5 C40 39.4 41.4 41 43.5 41 L51 41 Z"
        />
      </g>
    </svg>
  );
}
