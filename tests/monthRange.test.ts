import { describe, expect, it } from "vitest";
import { currentMonth, monthRange } from "@/lib/metrics";

describe("monthRange", () => {
  it("uses Vietnam time: September starts at 17:00 UTC on 31 August", () => {
    const r = monthRange("2026-09", new Date("2026-10-06T00:00:00Z"))!;
    expect(r.start.toISOString()).toBe("2026-08-31T17:00:00.000Z");
    expect(r.end.toISOString()).toBe("2026-09-30T17:00:00.000Z");
    expect(r.prevStart.toISOString()).toBe("2026-07-31T17:00:00.000Z");
    expect(r.complete).toBe(true);
  });

  it("caps the running month at now and rejects bad input", () => {
    const now = new Date("2026-10-06T03:00:00Z");
    const r = monthRange("2026-10", now)!;
    expect(r.complete).toBe(false);
    expect(r.end).toEqual(now);
    expect(monthRange("2026-13")).toBeNull();
    expect(monthRange("oct")).toBeNull();
    expect(currentMonth(new Date("2026-09-30T18:00:00Z"))).toBe("2026-10"); // already 1 Oct in Vietnam
  });
});
