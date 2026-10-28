// Single source of truth for the weekly class schedule across the website.
export type Weekday = "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday";
export type ClassSlot = { start: string; end: string; cls: string };
export type ScheduleDay = { day: Weekday; slots: ClassSlot[]; note?: string };

// Times use 24-hour local time, then display consistently on every page.
export const weeklySchedule: ScheduleDay[] = [
  {
    day: "Monday",
    slots: [
      { start: "17:00", end: "17:45", cls: "Jr. Kenpo" },
      { start: "18:00", end: "18:45", cls: "Jr. Kenpo" },
      { start: "19:00", end: "20:00", cls: "Teens & Adults Kenpo" }
    ]
  },
  {
    day: "Tuesday",
    slots: [
      { start: "17:00", end: "17:45", cls: "Jr. Muay Thai" },
      { start: "18:00", end: "18:45", cls: "Jr. Muay Thai" },
      { start: "19:00", end: "20:00", cls: "Teens & Adults Muay Thai" }
    ]
  },
  {
    day: "Wednesday",
    slots: [
      { start: "17:00", end: "17:45", cls: "Jr. Wing Chun" },
      { start: "18:00", end: "18:45", cls: "Jr. Wing Chun" },
      { start: "19:00", end: "20:00", cls: "Teens & Adults Wing Chun" }
    ]
  },
  {
    day: "Thursday",
    slots: [
      { start: "17:00", end: "17:45", cls: "Jr. Muay Thai" },
      { start: "18:00", end: "18:45", cls: "Jr. Muay Thai" },
      { start: "19:00", end: "20:00", cls: "Teens & Adults Muay Thai" }
    ]
  },
  {
    day: "Friday",
    slots: [{ start: "18:00", end: "19:00", cls: "Leadership" }]
  },
  {
    day: "Saturday",
    slots: [
      { start: "09:30", end: "10:15", cls: "Jr. Sparring" },
      { start: "10:30", end: "11:30", cls: "Teens & Adults Open Mat" }
    ],
    note: "Birthday Parties, Seminars & Special Events"
  },
  {
    day: "Sunday",
    slots: [{ start: "12:00", end: "14:00", cls: "Women's Self-Defense / Sanuces" }],
    note: "Birthday Parties, Seminars & Special Events"
  }
];

export function formatClock(time: string): string {
  const [hour, minute] = time.split(":").map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}

export function formatClassTime(start: string, end: string): string {
  const startLabel = formatClock(start);
  const endLabel = formatClock(end);
  const samePeriod = startLabel.slice(-2) === endLabel.slice(-2);
  return `${samePeriod ? startLabel.slice(0, -3) : startLabel}–${endLabel}`;
}
