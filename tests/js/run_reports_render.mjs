import * as render from "../../web/reports/render.js";

let failures = 0;

function fail(msg) {
  failures += 1;
  console.error(`FAIL ${msg}`);
}

function ok(msg) {
  console.log(`ok ${msg}`);
}

const { ladderVolume, fmtVolume, volumeCellHtml, ladderSortMeta, sortRows, LADDER_COLUMNS } =
  render;

for (const [name, fn] of Object.entries({
  ladderVolume,
  fmtVolume,
  volumeCellHtml,
  ladderSortMeta,
  sortRows,
})) {
  if (typeof fn !== "function") fail(`${name} is not exported as a function`);
}

if (typeof ladderVolume === "function" && typeof volumeCellHtml === "function") {
  const legs = (...vols) => vols.map((volume) => ({ volume }));

  const fractional = volumeCellHtml(legs(0.4, 0.21));
  if (!fractional.includes("0.61") || fractional.includes("0.6100000")) {
    fail(`fractional legs: ${fractional}`);
  } else ok("0.4 + 0.21 -> 0.61");

  const whole = volumeCellHtml(legs(500, 200, 200, 80));
  if (!whole.includes("980")) fail(`whole legs: ${whole}`);
  else ok("500+200+200+80 -> 980");

  const grouped = volumeCellHtml(legs(1000));
  if (!grouped.includes("1,000")) fail(`grouped thousands: ${grouped}`);
  else ok("1000 -> 1,000");

  const shortRow = ladderSortMeta({
    ticker: "SHRT.DE",
    direction: "short",
    unsupported: true,
    legs: legs(3, 2),
  });
  if (volumeCellHtml(shortRow.legs) !== "5") {
    fail(`short row cell: ${volumeCellHtml(shortRow.legs)}`);
  } else ok("short unsupported row -> 5");
  if (shortRow._sort?.volume !== 5 || shortRow.volume !== 5) {
    fail(`short row sort volume: ${shortRow._sort?.volume} / ${shortRow.volume}`);
  } else ok("short row numeric _sort.volume");

  const missing = legs(10, null);
  if (ladderVolume(missing) !== null) fail(`missing leg volume: ${ladderVolume(missing)}`);
  const missingCell = volumeCellHtml(missing);
  if (
    !missingCell.includes("n/a") ||
    !missingCell.includes('title="Volume missing for one or more legs"') ||
    /\b10\b/.test(missingCell)
  ) {
    fail(`missing leg cell: ${missingCell}`);
  } else ok("missing leg volume -> n/a with reason");

  if (ladderVolume([{ volume: Number.NaN }]) !== null) fail("NaN volume must be null");
  if (ladderVolume([]) !== null) fail("empty legs must be null");
  else ok("empty legs -> null");
  if (ladderVolume(undefined) !== null) fail("missing legs must be null");
  if (!volumeCellHtml([]).includes("n/a")) fail("empty legs cell must be n/a");
  if (ladderVolume(legs(0.4, 0.21)) === null) fail("fractional sum must be numeric");
}

if (typeof ladderSortMeta === "function" && typeof sortRows === "function") {
  const mk = (ticker, vols) =>
    ladderSortMeta({
      ticker,
      direction: "long",
      legs: vols.map((volume) => ({ volume })),
    });
  const rows = [
    mk("A", [2, 3]),
    mk("B", [980]),
    mk("C", [10, null]),
  ];
  const order = (dir) =>
    sortRows(rows, "volume", dir, { ladderSort: true })
      .map((r) => r.ticker)
      .join(",");
  if (order("desc") !== "B,A,C") fail(`desc order: ${order("desc")}`);
  else ok("volume desc -> 980, 5, n/a");
  if (order("asc") !== "A,B,C") fail(`asc order: ${order("asc")}`);
  else ok("volume asc -> n/a last");
}

if (!Array.isArray(LADDER_COLUMNS)) {
  fail("LADDER_COLUMNS is not exported");
} else {
  const keys = LADDER_COLUMNS.map((c) => c[0]);
  const legIdx = keys.indexOf("legCount");
  if (legIdx < 0 || keys[legIdx + 1] !== "volume") {
    fail(`volume must follow legCount: ${keys.join(",")}`);
  } else if (LADDER_COLUMNS[legIdx + 1][1] !== "Volume") {
    fail(`volume header label: ${LADDER_COLUMNS[legIdx + 1][1]}`);
  } else ok("Volume column follows Legs");
}

if (failures) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
}
console.log("reports render checks passed");
