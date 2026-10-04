import {
  RUNG_AMOUNTS_EUR,
  RUNG_CUMULATIVE_EUR,
  defaultSettings,
} from "../../web/reports/settings.js";

let failures = 0;

function check(name, actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures += 1;
    console.error(`FAIL ${name}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
  }
}

check("cumulative rungs", RUNG_CUMULATIVE_EUR, [300, 800, 1600, 2900, 5000]);
check("five rung amounts", RUNG_AMOUNTS_EUR.length, 5);
check("defaultSettings round trip", defaultSettings().minNetProfitEur, 15);

if (failures) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
}
console.log("all reports settings checks pass");
