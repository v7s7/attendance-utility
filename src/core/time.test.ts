import { describe, expect, it } from "vitest";
import { parseTypedTime } from "./time.ts";

describe("parseTypedTime", () => {
  it("reads the ways HR types a time", () => {
    expect(["715", "0715", "7:15", "07:15", "7.15", "7 15", "٧١٥", "٠٧:١٥"].map((s) => parseTypedTime(s))).toEqual(
      Array(8).fill("07:15"),
    );
    expect(parseTypedTime("7")).toBe("07:00");
    expect(parseTypedTime("14")).toBe("14:00");
    expect(parseTypedTime("1430")).toBe("14:30");
    expect(parseTypedTime(" ")).toBe("");
  });

  it("rejects what is not a time", () => {
    expect(["2460", "25", "7:75", "abc", "12345", "7:1:5"].map((s) => parseTypedTime(s))).toEqual(Array(6).fill(null));
  });

  it("reads an OUT time typed as morning as the afternoon", () => {
    expect(parseTypedTime("230", "06:54")).toBe("14:30");
    expect(parseTypedTime("2:30", "07:00")).toBe("14:30");
    expect(parseTypedTime("1430", "07:00")).toBe("14:30");
    // Later than the IN time already, or still before it in the afternoon: unchanged
    expect(parseTypedTime("1130", "07:00")).toBe("11:30");
    expect(parseTypedTime("6", "19:00")).toBe("06:00");
  });
});
