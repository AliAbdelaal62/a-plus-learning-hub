import { describe, expect, it } from "vitest";
import { entriesForDate, startOfWeek, isoDate, type Entry } from "@/lib/schedule";

const base = { teacher_id: null, subject_id: null, student_id: null, end_time: "11:00:00" };
const entries: Entry[] = [
  { ...base, id: "weekly-mon", recurring: true, weekday: 1, date: null, start_time: "10:00:00" },
  { ...base, id: "once", recurring: false, weekday: null, date: "2026-11-09", start_time: "09:00:00" },
  { ...base, id: "once-other", recurring: false, weekday: null, date: "2026-11-10", start_time: "08:00:00" },
];

describe("schedule", () => {
  it("shows weekly entries on their weekday and one-off entries only on their date, earliest first", () => {
    // 2026-11-09 is a Monday
    expect(entriesForDate(entries, new Date(2026, 10, 9)).map((e) => e.id)).toEqual(["once", "weekly-mon"]);
    expect(entriesForDate(entries, new Date(2026, 10, 16)).map((e) => e.id)).toEqual(["weekly-mon"]);
  });
  it("starts the week on Saturday", () => {
    expect(isoDate(startOfWeek(new Date(2026, 10, 9)))).toBe("2026-11-07");
    expect(isoDate(startOfWeek(new Date(2026, 10, 7)))).toBe("2026-11-07");
  });
});
