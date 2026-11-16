/** Build a single-event .ics calendar file for an upcoming show. */
function stamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}
function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/[,;]/g, (m) => "\\" + m).replace(/\r?\n/g, "\\n");
}
export function buildShowIcs(opts: { id: string; title: string; start: Date; url: string; description?: string; minutes?: number }): string {
  const end = new Date(opts.start.getTime() + (opts.minutes ?? 60) * 60000);
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//PullBid Live//Shows//EN", "BEGIN:VEVENT",
    `UID:show-${opts.id}@pullbidlive.com`, `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(opts.start)}`, `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(opts.title)}`, `DESCRIPTION:${esc((opts.description ?? "") + "\n" + opts.url)}`,
    `URL:${opts.url}`, "BEGIN:VALARM", "TRIGGER:-PT10M", "ACTION:DISPLAY", "DESCRIPTION:Show starts in 10 minutes", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
}
