import type { Metadata } from "next";
import "./globals.css";
import { I18nProvider } from "@/components/I18n";
import { getLocale } from "@/lib/locale";

export const metadata: Metadata = {
  title: "TS Video Tracker",
  description: "Live YouTube and TikTok performance for the Team Secret creative team.",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale}>
      <body>
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
