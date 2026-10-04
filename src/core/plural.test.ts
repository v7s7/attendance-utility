import { describe, expect, it } from "vitest";
import { formatPlurals } from "./plural.ts";

const days = "{n, plural, one {يوم واحد} two {يومان} few {# أيام} many {# يوماً} other {# يوم}}";

describe("formatPlurals", () => {
  it("uses the Arabic form for each count", () => {
    expect([1, 2, 3, 10, 11, 99, 100, 102].map((n) => formatPlurals(days, "ar", { n }))).toEqual([
      "يوم واحد",
      "يومان",
      "3 أيام",
      "10 أيام",
      "11 يوماً",
      "99 يوماً",
      "100 يوم",
      "102 يوم",
    ]);
  });

  it("keeps the text around it, handles several counts and exact numbers", () => {
    const text = "الغياب ({n, plural, two {يومان} other {# يوم}}) من {total, plural, =0 {لا أحد} few {# موظفين} other {# موظف}}";
    expect(formatPlurals(text, "ar", { n: 2, total: 5 })).toBe("الغياب (يومان) من 5 موظفين");
    expect(formatPlurals(text, "ar", { n: 7, total: 0 })).toBe("الغياب (7 يوم) من لا أحد");
    expect(formatPlurals("{n, plural, one {# day} other {# days}}", "en", { n: 1 })).toBe("1 day");
    expect(formatPlurals("Plain {n} text", "en", { n: 1 })).toBe("Plain {n} text");
  });
});
