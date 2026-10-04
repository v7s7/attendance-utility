import { describe, expect, it } from "vitest";
import { parsePunchCell, resolveInOut } from "./punches.ts";

const opts = { duplicateWindowSec: 15 * 60, middaySec: 11 * 3600 };

describe("parsePunchCell", () => {
  it("reads 24-hour and AM/PM times and reports anything unreadable", () => {
    expect(parsePunchCell("06:54:33; 2:01 PM ;7:5;ab")).toEqual({
      times: ["06:54:33", "14:01:00"],
      invalid: ["7:5", "ab"],
    });
  });
});

describe("resolveInOut", () => {
  it("sorts punches and uses the first and last", () => {
    const r = resolveInOut(["14:30:00", "07:02:00"], opts);
    expect([r.inTime, r.outTime, r.notes.map((n) => n.code)]).toEqual(["07:02:00", "14:30:00", ["unsorted"]]);
  });

  it("merges double taps", () => {
    const r = resolveInOut(["09:16:11", "09:16:13", "15:29:25"], opts);
    expect([r.inTime, r.outTime]).toEqual(["09:16:11", "15:29:25"]);
    expect(r.notes).toEqual([{ code: "duplicates", n: 1 }]);
  });

  it("keeps the last tap of a burst at leaving time", () => {
    expect(resolveInOut(["07:47:13", "15:36:22", "15:38:00"], opts).outTime).toBe("15:38:00");
  });

  it("reads a lone punch by the time of day", () => {
    expect(resolveInOut(["07:10:00"], opts)).toMatchObject({ inTime: "07:10:00", outTime: null });
    expect(resolveInOut(["14:17:20", "14:17:25"], opts)).toMatchObject({ inTime: null, outTime: "14:17:25" });
  });
});
