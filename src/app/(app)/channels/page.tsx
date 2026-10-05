import { Channels } from "@/components/Channels";

export const metadata = { title: "Channels · TS Video Tracker" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return <Channels connected={sp.connected?.slice(0, 80)} connectError={sp.error?.slice(0, 200)} analytics={sp.analytics?.slice(0, 80)} />;
}
