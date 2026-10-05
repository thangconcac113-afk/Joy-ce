import { cookies } from "next/headers";
import { LOCALE_COOKIE, type Locale } from "./i18n";

export async function getLocale(): Promise<Locale> {
  return (await cookies()).get(LOCALE_COOKIE)?.value === "vi" ? "vi" : "en";
}
