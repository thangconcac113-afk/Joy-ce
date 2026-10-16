import { beforeEach, expect, it, vi } from "vitest";
const user = vi.hoisted(() => vi.fn());
const db = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ currentUser: user }));
vi.mock("@/db/client", () => ({ getDb: db }));
import { GET } from "@/app/api/report/pdf/route";

beforeEach(() => { vi.clearAllMocks(); });
it("does not expose report PDFs without sign-in", async () => {
  user.mockResolvedValue(null);
  const r = await GET(new Request("https://example.com/api/report/pdf?month=2026-10"));
  expect(r.status).toBe(401);
  expect(db).not.toHaveBeenCalled();
});
it("rejects invalid and future months before accessing the database", async () => {
  user.mockResolvedValue({ email: "viewer@example.com" });
  for (const month of ["2026-13", "2025-12", "2999-01", "not-a-month"]) {
    expect((await GET(new Request(`https://example.com/api/report/pdf?month=${month}`))).status).toBe(400);
  }
  expect(db).not.toHaveBeenCalled();
});
