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

function ladderFor(legSpecs, price) {
  const openLegs = legSpecs.map(([volume, openPrice, openAt], i) => ({
    ticker: "FTGA.DE",
    name: "Ftga",
    category: "ETF",
    direction: "long",
    positionId: String(i + 1),
    volume,
    openPrice,
    currentPrice: price,
    openAt: new Date(openAt),
    netProfit: volume * (price - openPrice),
  }));
  const p = { ...parsed, openLegs };
  return computeLadders(p, computeRankings(p)).find((l) => l.ticker === "FTGA.DE");
}

function near(a, b) {
  return a != null && Math.abs(a - b) < 1e-6;
}

function sameTriggers(actual, expected) {
  return (
    actual.length === expected.length &&
    expected.every((e, i) => (e == null ? actual[i] == null : near(actual[i], e)))
  );
}

const IDEAL_TRIGGERS = [null, -8, -13, -21, -34];
const baseLeg = [30, 10, "2026-08-01T00:00:00Z"];
const r2Leg = [500 / 8.6, 8.6, "2026-08-10T00:00:00Z"];

const beforeBuy = ladderFor([baseLeg], 8.6);
if (beforeBuy.recommendation?.tier !== 2 || !near(beforeBuy.recommendation?.shortfallEur, 500)) {
  fail(`before buy should recommend R2 shortfall 500: ${JSON.stringify(beforeBuy.recommendation)}`);
}
if (beforeBuy.anchorDrawdown != null || !sameTriggers(beforeBuy.effectiveTriggers, IDEAL_TRIGGERS)) {
  fail(`R1 ladder keeps ideal triggers: ${beforeBuy.anchorDrawdown} ${JSON.stringify(beforeBuy.effectiveTriggers)}`);
}

const afterBuy = ladderFor([baseLeg, r2Leg], 8.6);
if (afterBuy.activeRung !== 2) fail(`after buy active rung: ${afterBuy.activeRung}`);
if (!near(afterBuy.anchorDrawdown, -14)) fail(`after buy anchor: ${afterBuy.anchorDrawdown}`);
if (!sameTriggers(afterBuy.effectiveTriggers, [null, -8, -19, -27, -40])) {
  fail(`after buy effective triggers: ${JSON.stringify(afterBuy.effectiveTriggers)}`);
}
if (afterBuy.recommendation != null) {
  fail(`after buy at unchanged price should not recommend: ${JSON.stringify(afterBuy.recommendation)}`);
}

const shallower = ladderFor([baseLeg, r2Leg], 8.2);
if (shallower.recommendation != null) {
  fail(`at 8.2 should not recommend: ${JSON.stringify(shallower.recommendation)}`);
}

const deeper = ladderFor([baseLeg, r2Leg], 8.0);
if (deeper.recommendation?.tier !== 3 || !near(deeper.recommendation?.shortfallEur, 800)) {
  fail(`at 8.0 should recommend R3 shortfall 800: ${JSON.stringify(deeper.recommendation)}`);
}

const wholeShares = ladderFor([baseLeg, [58, 8.6, "2026-08-10T00:00:00Z"]], 8.6);
if (wholeShares.activeRung !== 2 || !near(wholeShares.anchorDrawdown, -14)) {
  fail(`58 sh @ 8.6 reaches R2 anchored at -14: ${wholeShares.activeRung} ${wholeShares.anchorDrawdown}`);
}
if (!sameTriggers(wholeShares.effectiveTriggers, [null, -8, -19, -27, -40])) {
  fail(`58 sh @ 8.6 effective triggers: ${JSON.stringify(wholeShares.effectiveTriggers)}`);
}
if (wholeShares.recommendation != null || wholeShares.flags.includes("trigger-hit-R3")) {
  fail(`58 sh @ 8.6 should not recommend: ${JSON.stringify(wholeShares.recommendation)} ${wholeShares.flags}`);
}

for (const [volume, shortfall] of [[61.5, 8], [60, 20]]) {
  const short = ladderFor([baseLeg, [volume, 8, "2026-08-10T00:00:00Z"]], 8);
  if (short.activeRung !== 1 || short.levels[1].planState !== "due") {
    fail(`shortfall ${shortfall} at price 8 stays on R1: ${short.activeRung} ${short.levels[1].planState}`);
  }
  if (short.recommendation?.tier !== 2 || !near(short.recommendation?.shortfallEur, shortfall)) {
    fail(`shortfall ${shortfall} at price 8 recommends R2: ${JSON.stringify(short.recommendation)}`);
  }
}

const unpriced = ladderFor([baseLeg, [58, 8.6, "2026-08-10T00:00:00Z"]], null);
if (unpriced.activeRung !== 1 || unpriced.anchorDrawdown != null || unpriced.levels[1].planState === "filled") {
  fail(`unknown price keeps 58 sh @ 8.6 on R1: ${unpriced.activeRung} ${unpriced.anchorDrawdown} ${unpriced.levels[1].planState}`);
}
const unpricedExact = ladderFor([baseLeg, r2Leg], null);
if (unpricedExact.activeRung !== 2 || !near(unpricedExact.anchorDrawdown, -14)) {
  fail(`unknown price with exact R2 fill: ${unpricedExact.activeRung} ${unpricedExact.anchorDrawdown}`);
}

const bigBase = ladderFor([[80, 10, "2026-08-01T00:00:00Z"]], 9.9);
if (bigBase.activeRung !== 2 || !sameTriggers(bigBase.effectiveTriggers, IDEAL_TRIGGERS)) {
  fail(`R2 funded near base keeps ideal triggers: ${bigBase.activeRung} ${JSON.stringify(bigBase.effectiveTriggers)}`);
}

const ftgaLegs = [
  [3, 31.695, "2026-08-01T00:00:00Z"],
  [4, 29.84, "2026-09-01T00:00:00Z"],
  [11, 28.62, "2026-10-01T00:00:00Z"],
  [10, 27.255, "2026-11-06T00:00:00Z"],
];
const pastIdeal = ladderFor(ftgaLegs, 27.365);
if (pastIdeal.activeRung !== 2 || !near(pastIdeal.effectiveTriggers[2], -19.008518693800287)) {
  fail(`FTGA-like ladder on R2 re-anchored: ${pastIdeal.activeRung} ${JSON.stringify(pastIdeal.effectiveTriggers)}`);
}
if (pastIdeal.levels[2].planState !== "awaiting trigger" || pastIdeal.recommendation != null) {
  fail(`R3 past ideal but not effective trigger is awaiting: ${pastIdeal.levels[2].planState} ${JSON.stringify(pastIdeal.recommendation)}`);
}
const pastEffective = ladderFor(ftgaLegs, 25.6);
if (pastEffective.levels[2].planState !== "due") {
  fail(`R3 past effective trigger is due: ${pastEffective.levels[2].planState}`);
}

if (failures) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
}
console.log("all reports ladder checks pass");
