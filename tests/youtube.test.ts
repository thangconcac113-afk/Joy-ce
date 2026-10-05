import { describe, expect, it } from "vitest";
import { parseChannelInput, parseDuration, videoThumbnail } from "@/lib/youtube";

describe("parseChannelInput", () => {
  it("accepts handles, IDs and URLs", () => {
    expect(parseChannelInput("@TeamSecret")).toEqual({ handle: "@TeamSecret" });
    expect(parseChannelInput("TeamSecret")).toEqual({ handle: "@TeamSecret" });
    expect(parseChannelInput("https://www.youtube.com/@teamsecret/videos")).toEqual({ handle: "@teamsecret" });
    expect(parseChannelInput("https://www.youtube.com/@TeamSecretAOV/videos")).toEqual({ handle: "@TeamSecretAOV" });
    const id = "UC" + "a".repeat(22);
    expect(parseChannelInput(id)).toEqual({ id });
    expect(parseChannelInput(`https://youtube.com/channel/${id}`)).toEqual({ id });
  });
  it("rejects junk", () => {
    expect(() => parseChannelInput("x")).toThrow();
  });
});

describe("parseDuration", () => {
  it("parses ISO 8601 durations", () => {
    expect(parseDuration("PT9S")).toBe(9);
    expect(parseDuration("PT4H33M46S")).toBe(16426);
    expect(parseDuration("P1DT1M")).toBe(86460);
    expect(parseDuration(undefined)).toBeNull();
  });
});

describe("videoThumbnail", () => {
  it("prefers the high-resolution image and always returns one", () => {
    expect(videoThumbnail("abc", { high: { url: "https://h" }, medium: { url: "https://m" } })).toBe("https://h");
    expect(videoThumbnail("abc", { medium: { url: "https://m" } })).toBe("https://m");
    expect(videoThumbnail("abc", undefined)).toBe("https://i.ytimg.com/vi/abc/hqdefault.jpg");
  });
});
