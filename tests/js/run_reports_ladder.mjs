import { grossMoveFromNetRate, RUNG_CUMULATIVE_EUR, RUNG_NET_TP_PCT } from "../../web/reports/settings.js";
import { computeLadders } from "../../web/reports/ladder.js";
import { computeRankings } from "../../web/reports/rank.js";
import { visibleTpLevels } from "../../web/reports/render.js";

let failures = 0;

function fail(msg) {
  failures += 1;
  console.error(`FAIL ${msg}`);
}

const gross5 = grossMoveFromNetRate(5);
if (Math.abs(gross5 - 0.05555555555555556) > 1e-12) {
  fail(`gross move from 5% net: ${gross5}`);
}

for (let i = 0; i < RUNG_NET_TP_PCT.length; i++) {
  const expected = RUNG_CUMULATIVE_EUR[i] * (RUNG_NET_TP_PCT[i] / 100);
  if (Math.abs(expected - [15, 32, 48, 58, 50][i]) > 0.01) {
    fail(`plan net R${i + 1}: ${expected}`);
  }
}

const asOf = new Date("2026-08-14T00:00:00Z");
const parsed = {
  metadata: { asOf, equity: 20000, freeCash: 1000, openPositionValue: 19000 },
  closedTrades: [],
  openLegs: [
    {
      ticker: "PLAN.DE",
      name: "Plan",
      category: "ETF",
      direction: "long",
      positionId: "1",
      volume: 100,
      openPrice: 10,
      currentPrice: 10.5,
      openAt: new Date("2026-08-01T00:00:00Z"),
      netProfit: 50,
    },
  ],
};

const rankings = computeRankings(parsed);
const ladders = computeLadders(parsed, rankings);
const lad = ladders.find((l) => l.ticker === "PLAN.DE");
if (!lad || lad.levels.length !== 5) fail("five projected levels");

const mockLevels = [1, 2, 3, 4, 5].map((rung) => ({ rung }));
function visibleRungs(active) {
  return visibleTpLevels(mockLevels, active).map((l) => l.rung);
}
if (JSON.stringify(visibleRungs(2)) !== "[2,3]") {
  fail(`R2 visible rungs: ${visibleRungs(2)}`);
}
if (JSON.stringify(visibleRungs(1)) !== "[1,2]") {
  fail(`R1 visible rungs: ${visibleRungs(1)}`);
}
if (JSON.stringify(visibleRungs(5)) !== "[5]") {
  fail(`R5 visible rungs: ${visibleRungs(5)}`);
}
const activeRung = 3;
const recommendedRung = 4;
const visible = visibleRungs(activeRung);
if (visible.includes(activeRung) && visible.includes(recommendedRung) && activeRung !== recommendedRung) {
  /* ACTIVE on 3 and RECOMMENDED on 4 can both appear in the two-line window */
} else {
  fail("visible window should include distinct active and next rungs for markers");
}

if (failures) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
}
console.log("all reports ladder checks pass");
