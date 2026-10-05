import { expect, it } from "vitest";
import { decrypt, encrypt } from "@/lib/crypto";

it("round-trips and detects tampering", () => {
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");
  const enc = encrypt("secret-token");
  expect(enc).not.toContain("secret-token");
  expect(decrypt(enc)).toBe("secret-token");
  const [iv, tag, data] = enc.split(".");
  const flipped = Buffer.from(data, "base64");
  flipped[0] ^= 1;
  expect(() => decrypt([iv, tag, flipped.toString("base64")].join("."))).toThrow();
});

import { csvCell } from "@/lib/csv";

it("escapes CSV cells and blocks formula injection", () => {
  expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  expect(csvCell("=HYPERLINK(1)")).toBe(`"'=HYPERLINK(1)"`);
  expect(csvCell(null)).toBe('""');
});
