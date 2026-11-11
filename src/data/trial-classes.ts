import { formatClock, weeklySchedule } from "./schedule";

const studioTime = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/New_York",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23"
});
const dateLabel = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC", weekday: "short", month: "short", day: "numeric"
});

export function upcomingTrialClasses(now = new Date()) {
  const [date, time] = studioTime.format(now).split(" ");
  const programs = ["Kenpo Karate", "Muay Thai", "Wing Chun"];
  return Array.from({ length: 8 }, (_, offset) => {
    const day = new Date(date + "T00:00:00Z");
    day.setUTCDate(day.getUTCDate() + offset);
    const isoDate = day.toISOString().slice(0, 10);
    const schedule = weeklySchedule[(day.getUTCDay() + 6) % 7];
    return schedule.slots.flatMap(slot => {
      const group = slot.cls.startsWith("Jr. ") ? "kids" : "teens-adults";
      const program = programs.find(name => slot.cls.endsWith(name === "Kenpo Karate" ? "Kenpo" : name));
      if (!program || (offset === 0 && slot.start <= time)) return [];
      return [{
        id: isoDate + "T" + slot.start + "|" + group + "|" + program,
        group,
        program,
        label: dateLabel.format(day) + " at " + formatClock(slot.start) + " ET · " + program
      }];
    });
  }).flat();
}

export function trialClassGroup(dob: string, classDate: string) {
  const age = Number(classDate.slice(0, 4)) - Number(dob.slice(0, 4)) -
    Number(classDate.slice(5) < dob.slice(5));
  return age < 13 ? "kids" : "teens-adults";
}
