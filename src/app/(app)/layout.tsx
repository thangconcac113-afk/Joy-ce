import { redirect } from "next/navigation";
import { authDisabled, currentUser, signOut } from "@/auth";
import { Nav } from "@/components/Nav";
import { LangSwitch } from "@/components/I18n";
import { translate } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { RadarAI } from "@/components/RadarAI";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/signin");
  const locale = await getLocale();
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            TS
          </span>
          Video Tracker
        </div>
        <Nav className="nav" />
        <div className="sidebar-foot">
          <LangSwitch />
          <span>{user.email}</span>
          {!authDisabled && (
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/signin" });
              }}
            >
              <button type="submit">{translate(locale, "Sign out")}</button>
            </form>
          )}
        </div>
      </aside>
      <div>
        <LangSwitch className="lang-mobile" />
        <Nav className="mobile-nav" />
        <main className="main">{children}</main>
      </div>
      <RadarAI />
    </div>
  );
}
