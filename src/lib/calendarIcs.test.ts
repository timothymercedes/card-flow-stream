import { describe, it, expect } from "vitest";
import { buildShowIcs } from "./calendarIcs";
describe("buildShowIcs", () => {
  it("uses the show start time, a 60 minute default length and a 10 minute reminder", () => {
    const ics = buildShowIcs({ id: "a", title: "Pokémon, night", start: new Date("2026-12-01T20:00:00Z"), url: "https://x/shows/a" });
    expect(ics).toContain("DTSTART:20261201T200000Z");
    expect(ics).toContain("DTEND:20261201T210000Z");
    expect(ics).toContain("TRIGGER:-PT10M");
    expect(ics).toContain("SUMMARY:Pokémon\\, night");
  });
});
