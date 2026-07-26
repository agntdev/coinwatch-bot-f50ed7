import { describe, expect, it } from "vitest";
import { evaluateAlerts, setClockForTests, type Profile } from "../src/crypto.js";

function profile(): Profile {
  return {
    watchlist: [{ symbol: "BTC", id: "bitcoin", name: "Bitcoin", lastPrice: 101, hourPrice: 100 }],
    alerts: [{ id: 1, symbol: "BTC", type: "threshold", value: 100, enabled: true }],
    queuedAlerts: [], nextAlertId: 2,
  };
}
describe("alert processing", () => {
  it("triggers a rule once and applies its 24-hour cooldown", () => {
    const data = profile(); setClockForTests(() => 1_000_000);
    expect(evaluateAlerts(data)).toEqual(["BTC reached $101.00."]);
    expect(evaluateAlerts(data)).toEqual([]);
    setClockForTests();
  });
  it("queues an alert during quiet hours and delivers it once quiet hours end", () => {
    const data = profile(); data.quietHours = { start: "22:00", end: "07:00" };
    setClockForTests(() => Date.UTC(2026, 0, 1, 23, 0));
    expect(evaluateAlerts(data)).toEqual([]);
    data.alerts[0].enabled = false;
    setClockForTests(() => Date.UTC(2026, 0, 2, 8, 0));
    expect(evaluateAlerts(data)).toEqual(["BTC reached $101.00."]);
    setClockForTests();
  });
});
