export type Entry = {
  id: string;
  recurring: boolean;
  date: string | null;
  weekday: number | null;
  start_time: string;
  end_time: string;
  teacher_id: string | null;
  subject_id: string | null;
  student_id: string | null;
};

export const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

/** Academy weeks start on Saturday. */
export const startOfWeek = (d: Date) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return addDays(x, -((x.getDay() + 1) % 7));
};

/** Weekly entries repeat on their weekday; one-off entries appear only on their date. Sorted by start time. */
export function entriesForDate(entries: Entry[], d: Date): Entry[] {
  const iso = isoDate(d);
  return entries
    .filter((e) => (e.recurring ? e.weekday === d.getDay() : e.date === iso))
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
}
