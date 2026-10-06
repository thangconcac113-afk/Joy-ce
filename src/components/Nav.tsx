"use client";

import { usePathname } from "next/navigation";
import { useI18n } from "./I18n";

const ICONS = {
  overview: "M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z",
  library: "M4 6h16v2H4zm0 5h16v2H4zm0 5h10v2H4z",
  report: "M6 2h9l5 5v15H6V2zm8 1.5V8h4.5L14 3.5zM8 12h8v1.5H8V12zm0 3h8v1.5H8V15zm0 3h5v1.5H8V18z",
  channels: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-4 0-8 2-8 5v1h16v-1c0-3-4-5-8-5z",
};

export const LINKS = [
  { href: "/", label: "Dashboard", icon: ICONS.overview },
  { href: "/library", label: "Video library", icon: ICONS.library },
  { href: "/report", label: "Monthly report", icon: ICONS.report },
  { href: "/channels", label: "Channels", icon: ICONS.channels },
];

export function Nav({ className }: { className: string }) {
  const path = usePathname();
  const { t } = useI18n();
  return (
    <nav className={className} aria-label={t("Main")}>
      {LINKS.map((l) => (
        <a key={l.href} href={l.href} aria-current={path === l.href ? "page" : undefined}>
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d={l.icon} />
          </svg>
          {t(l.label)}
        </a>
      ))}
    </nav>
  );
}
