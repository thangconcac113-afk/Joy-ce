import { redirect } from "next/navigation";
import { authDisabled, currentUser, signOut, canManageEmail } from "@/auth";
import { AccessProvider } from "@/components/Access";
import { AppShell } from "@/components/AppShell";
import { LangSwitch } from "@/components/I18n";
import { translate } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";
import { RadarAI } from "@/components/RadarAI";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/signin");
  const locale = await getLocale();
  const canManage = canManageEmail(user.email);
  return (
    <AccessProvider value={canManage}><AppShell footer={<>
      <LangSwitch />
      <span className="access-badge" title={canManage ? "Manage channels, content tags and targets" : "View metrics and export reports"}>{canManage ? "Manager access" : "Read-only access"}</span>
      <span className="account-email" title={user.email}>{user.email}</span>
      {!authDisabled && <form action={async () => { "use server"; await signOut({ redirectTo: "/signin" }); }}><button type="submit">{translate(locale, "Sign out")}</button></form>}
    </>}>{children}</AppShell>
      <RadarAI />
    </AccessProvider>
  );
}
