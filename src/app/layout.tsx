import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TS Creative Pulse",
  description: "Live YouTube and TikTok performance for the Team Secret creative team.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
