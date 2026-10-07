import { describe, expect, it } from "vitest";
import { channelKey, formatOf, labelOf, monthly, type SheetVideo } from "@/lib/sheetExport";

const v = (channel: SheetVideo["channel"], publishedAt: string, views: number, format: SheetVideo["format"] = "Long"): SheetVideo => ({
  videoId: publishedAt + views, channel, label: "", publishedAt, format, title: "t", url: null, views, avdSec: null, viewedPct: null,
});

describe("sheet export", () => {
  it("maps handles, formats and labels the way the sheet does", () => {
    expect(channelKey("@TeamSecretLOL")).toBe("vn");
    expect(channelKey("@someoneelse")).toBeNull();
    expect(formatOf(45)).toBe("Short");
    expect(formatOf(300)).toBe("Long");
    expect(formatOf(null)).toBe("Long");
    expect(labelOf("vn", "anything")).toBe("LOL");
    expect(labelOf("aov", "anything")).toBe("AOV");
    expect(labelOf("main", "Ranking VCT bundles")).toBe("VAL");
    expect(labelOf("main", "TSW vs GZ")).toBe("LOL");
    expect(labelOf("main", "Meet and greet")).toBe("");
  });

  it("summarises per channel and month, newest month first", () => {
    const rows = monthly([v("vn", "2026-10-01T00:00:00Z", 100, "Short"), v("vn", "2026-10-03T00:00:00Z", 300), v("main", "2026-09-20T00:00:00Z", 50)]);
    expect(rows).toEqual([
      { channel: "vn", month: "2026-10", videos: 2, long: 1, short: 1, avgViews: 200, peakViews: 300 },
      { channel: "main", month: "2026-09", videos: 1, long: 1, short: 0, avgViews: 50, peakViews: 50 },
    ]);
  });
});
