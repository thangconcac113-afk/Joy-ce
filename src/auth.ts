import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

/** Local preview only: skips Google sign-in. Ignored in production builds. */
export const authDisabled = process.env.AUTH_DISABLED === "true" && process.env.NODE_ENV !== "production";

const list = (v: string | undefined) =>
  (v ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

/** ALLOWED_EMAILS (exact addresses) and/or ALLOWED_EMAIL_DOMAINS (e.g. teamsecret.gg). */
export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.toLowerCase();
  const emails = list(process.env.ALLOWED_EMAILS);
  const domains = list(process.env.ALLOWED_EMAIL_DOMAINS);
  if (emails.length === 0 && domains.length === 0) return false; // closed by default
  return emails.includes(e) || domains.some((d) => e.endsWith(`@${d}`));
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  pages: { signIn: "/signin", error: "/signin" },
  trustHost: true,
  callbacks: {
    signIn({ profile }) {
      return profile?.email_verified === true && isAllowedEmail(profile.email);
    },
  },
});

export interface CurrentUser {
  email: string;
  name: string | null;
  image: string | null;
}

/** The signed-in, allow-listed user, or null. */
export async function currentUser(): Promise<CurrentUser | null> {
  if (authDisabled) return { email: "preview@local", name: "Preview", image: null };
  const session = await auth();
  const email = session?.user?.email;
  if (!email || !isAllowedEmail(email)) return null;
  return { email, name: session.user?.name ?? null, image: session.user?.image ?? null };
}
