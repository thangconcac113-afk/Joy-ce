import { redirect } from "next/navigation";
import { currentUser, signIn } from "@/auth";
import { LangSwitch } from "@/components/I18n";
import { translate } from "@/lib/i18n";
import { getLocale } from "@/lib/locale";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in · TS Video Tracker" };

export default async function SignIn({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await currentUser()) redirect("/");
  const { error } = await searchParams;
  const locale = await getLocale();
  const t = (k: string) => translate(locale, k);
  return (
    <div className="signin">
      <div className="card">
        <LangSwitch className="lang-center" />
        <div className="brand" style={{ justifyContent: "center", padding: 0 }}>
          <span className="brand-mark" aria-hidden>
            TS
          </span>
          Video Tracker
        </div>
        <p className="muted" style={{ margin: 0 }}>
          {t("Live YouTube and TikTok performance for the Team Secret creative team.")}
        </p>
        {error && (
          <div className="banner" role="alert" style={{ margin: 0, textAlign: "left" }}>
            {error === "AccessDenied" ? t("This Google account isn't on the access list. Ask an admin to add you.") : t("Sign-in failed. Please try again.")}
          </div>
        )}
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button className="btn btn-primary" type="submit" style={{ width: "100%", justifyContent: "center" }}>
            {t("Sign in with Google")}
          </button>
        </form>
      </div>
    </div>
  );
}
