/* Swing structure for Order Block detection, ported from an external source
 * indicator.
 *
 * Chronological, oldest-first bar arrays. The newest stored bar stands in for
 * the source's forming bar — the still-open newest bar of a live chart — and
 * is excluded from confirmed-pivot and OB-candidate scans. Internal computation
 * only — nothing here is rendered.
 *
 * Deliberate deviation: no skip-bar time-of-day filter (every bar is eligible).
 */

const IMPULSE = 1;
const PULLBACK = -1;
const UNKNOWN = 0;
const TREND_UP = 1;
const TREND_DOWN = -1;
const TREND_UNKNOWN = 0;
const DBL_MAX = Number.MAX_VALUE;
const DBL_MIN = -Number.MAX_VALUE;

// Source index: newest-first bar number the source indicator uses (bar 0 is newest).

function sourceToJs(sourceBar, n) {
  return n - 1 - sourceBar;
}

function jsToSource(jsIdx, n) {
  return n - 1 - jsIdx;
}

function typicalPrice(bars) {
  return bars.map((b) => (b.high + b.low + b.close) / 3);
}

function isPivotHighJs(js, typical, pivotBars, n) {
  if (js < pivotBars || js + pivotBars >= n) return false;
  const center = typical[js];
  for (let k = 1; k <= pivotBars; k++) {
    if (typical[js - k] >= center || typical[js + k] >= center) return false;
  }
  return true;
}

function isPivotLowJs(js, typical, pivotBars, n) {
  if (js < pivotBars || js + pivotBars >= n) return false;
  const center = typical[js];
  for (let k = 1; k <= pivotBars; k++) {
    if (typical[js - k] <= center || typical[js + k] <= center) return false;
  }
  return true;
}

function adjustPivotHighBarJs(centerJs, highs, pivotBars) {
  let bestJs = centerJs;
  let bestHigh = highs[centerJs];
  for (let k = 1; k <= pivotBars; k++) {
    if (highs[centerJs - k] > bestHigh) {
      bestHigh = highs[centerJs - k];
      bestJs = centerJs - k;
    }
    if (highs[centerJs + k] > bestHigh) {
      bestHigh = highs[centerJs + k];
      bestJs = centerJs + k;
    }
  }
  return bestJs;
}

function adjustPivotLowBarJs(centerJs, lows, pivotBars) {
  let bestJs = centerJs;
  let bestLow = lows[centerJs];
  for (let k = 1; k <= pivotBars; k++) {
    if (lows[centerJs - k] < bestLow) {
      bestLow = lows[centerJs - k];
      bestJs = centerJs - k;
    }
    if (lows[centerJs + k] < bestLow) {
      bestLow = lows[centerJs + k];
      bestJs = centerJs + k;
    }
  }
  return bestJs;
}

function initPivot(jsIdx, typical, highs, lows, times, isHigh, confirmJs = -1, confirmed = false) {
  const cJs = confirmJs >= 0 ? confirmJs : jsIdx;
  return {
    barIndex: jsIdx,
    barTime: times[jsIdx],
    price: typical[jsIdx],
    high: highs[jsIdx],
    low: lows[jsIdx],
    isHigh,
    confirmationBarIndex: cJs,
    confirmationTime: times[cJs],
    isConfirmed: confirmed,
    confirmPrice: 0,
    moveType: UNKNOWN,
  };
}

function getPrevSameTypePivotExtreme(pivots, isHigh) {
  for (let i = pivots.length - 1; i >= 0; i--) {
    if (pivots[i].isHigh === isHigh) {
      return isHigh ? pivots[i].high : pivots[i].low;
    }
  }
  return isHigh ? DBL_MAX : DBL_MIN;
}

function validatePivot(
  candidate,
  highs,
  lows,
  typical,
  times,
  pivotBars,
  confirmDistance,
  prevSameExtreme,
  lastCompletedJs,
) {
  if (candidate.isHigh && prevSameExtreme < DBL_MAX && candidate.high <= prevSameExtreme) {
    return false;
  }
  if (!candidate.isHigh && prevSameExtreme > DBL_MIN && candidate.low >= prevSameExtreme) {
    return false;
  }

  const confirmPrice = candidate.isHigh
    ? candidate.price - confirmDistance
    : candidate.price + confirmDistance;

  const firstCheckJs = candidate.barIndex + pivotBars;
  if (firstCheckJs > lastCompletedJs) return false;

  for (let checkJs = firstCheckJs; checkJs <= lastCompletedJs; checkJs++) {
    const checkPrice = typical[checkJs];
    const confirmed = candidate.isHigh ? checkPrice <= confirmPrice : checkPrice >= confirmPrice;
    if (!confirmed) continue;

    let hasMoreExtreme = false;
    for (let midJs = candidate.barIndex + 1; midJs < checkJs; midJs++) {
      if (candidate.isHigh && highs[midJs] > candidate.high) {
        hasMoreExtreme = true;
        break;
      }
      if (!candidate.isHigh && lows[midJs] < candidate.low) {
        hasMoreExtreme = true;
        break;
      }
    }
    if (hasMoreExtreme) return false;

    candidate.confirmationBarIndex = checkJs;
    candidate.confirmationTime = times[checkJs];
    candidate.isConfirmed = true;
    candidate.confirmPrice = confirmPrice;
    return true;
  }
  return false;
}

function determineMoveType(pivots, pivotIndex) {
  if (pivotIndex < 1) return UNKNOWN;
  const curr = pivots[pivotIndex];
  let prevExtreme = 0;
  let found = false;
  for (let i = pivotIndex - 1; i >= 0; i--) {
    if (pivots[i].isHigh === curr.isHigh) {
      prevExtreme = curr.isHigh ? pivots[i].high : pivots[i].low;
      found = true;
      break;
    }
  }
  if (!found) return IMPULSE;
  const currPrice = curr.isHigh ? curr.high : curr.low;
  if (curr.isHigh) return currPrice > prevExtreme ? IMPULSE : PULLBACK;
  return currPrice < prevExtreme ? IMPULSE : PULLBACK;
}

function setLastPivotMoveType(pivots) {
  if (!pivots.length) return;
  pivots[pivots.length - 1].moveType = determineMoveType(pivots, pivots.length - 1);
}

function updateTrendFromPivots(pivots, currentTrend) {
  if (pivots.length < 2) return currentTrend;
  const last = pivots[pivots.length - 1];
  let prevPrice = 0;
  let found = false;
  for (let i = pivots.length - 2; i >= 0; i--) {
    if (pivots[i].isHigh === last.isHigh) {
      prevPrice = pivots[i].price;
      found = true;
      break;
    }
  }
  if (!found) {
    if (currentTrend === TREND_UNKNOWN) {
      return pivots[1].isHigh ? TREND_UP : TREND_DOWN;
    }
    return currentTrend;
  }
  if (last.isHigh) {
    return last.price > prevPrice ? TREND_UP : TREND_DOWN;
  }
  return last.price < prevPrice ? TREND_DOWN : TREND_UP;
}

function makeBreakState() {
  return {
    pivotCount: 0,
    lastBreakBarTime: 0,
    currentTrend: TREND_UNKNOWN,
    bosOccurred: false,
    bosSameTypeOccurred: false,
  };
}

function handleStructuralBreak(state, barTime, isUp, level) {
  // level mirrors the source's break sites; read by no guard the port keeps.
  const pre = state.currentTrend;
  const isBOS =
    pre === TREND_UNKNOWN ? true : isUp ? pre === TREND_UP : pre === TREND_DOWN;
  if (pre === TREND_UNKNOWN || !isBOS) {
    state.currentTrend = isUp ? TREND_UP : TREND_DOWN;
  }
  if (barTime > state.lastBreakBarTime) state.lastBreakBarTime = barTime;
}

function initializeBasePivots(
  typical,
  highs,
  lows,
  closes,
  times,
  pivotBars,
  confirmDistance,
  n,
  state,
) {
  const pivots = [];
  const lastCompletedJs = n - 2;
  const allPivots = [];

  for (let js = pivotBars; js <= n - pivotBars - 1; js++) {
    if (isPivotHighJs(js, typical, pivotBars, n)) {
      const adjJs = adjustPivotHighBarJs(js, highs, pivotBars);
      const confirmSrc = Math.max(0, jsToSource(js, n) - pivotBars);
      const confirmJs = sourceToJs(confirmSrc, n);
      allPivots.push(initPivot(adjJs, typical, highs, lows, times, true, confirmJs, false));
    } else if (isPivotLowJs(js, typical, pivotBars, n)) {
      const adjJs = adjustPivotLowBarJs(js, lows, pivotBars);
      const confirmSrc = Math.max(0, jsToSource(js, n) - pivotBars);
      const confirmJs = sourceToJs(confirmSrc, n);
      allPivots.push(initPivot(adjJs, typical, highs, lows, times, false, confirmJs, false));
    }
  }

  if (allPivots.length < 2) return { pivots, initialized: false };

  let firstPivot = allPivots[0];
  let secondPivot = allPivots[0];
  let foundSecond = false;
  for (let i = 1; i < allPivots.length; i++) {
    if (allPivots[i].isHigh !== firstPivot.isHigh) {
      secondPivot = allPivots[i];
      foundSecond = true;
      break;
    }
    if (firstPivot.isHigh && allPivots[i].price > firstPivot.price) firstPivot = allPivots[i];
    if (!firstPivot.isHigh && allPivots[i].price < firstPivot.price) firstPivot = allPivots[i];
  }
  if (!foundSecond) return { pivots, initialized: false };

  pivots.push(firstPivot, secondPivot);
  pivots[0].moveType = UNKNOWN;
  pivots[1].moveType = determineMoveType(pivots, 1);
  state.pivotCount = pivots.length;
  // Safe: fresh-load base init — bosOccurred is still false (only set on pending path).
  state.currentTrend = updateTrendFromPivots(pivots, state.currentTrend);

  let currentJs = secondPivot.confirmationBarIndex + 1;
  const endJs = lastCompletedJs;
  let safety = 0;

  while (currentJs <= endJs && safety < 5000) {
    safety++;
    const lastPivot = pivots[pivots.length - 1];
    const searchingForLow = lastPivot.isHigh;

    let lastHighPrice = 0;
    let lastLowPrice = DBL_MAX;
    for (let p = pivots.length - 1; p >= 0; p--) {
      if (pivots[p].isHigh && lastHighPrice === 0) lastHighPrice = pivots[p].high;
      if (!pivots[p].isHigh && lastLowPrice === DBL_MAX) lastLowPrice = pivots[p].low;
      if (lastHighPrice > 0 && lastLowPrice < DBL_MAX) break;
    }

    let extremePrice = searchingForLow ? DBL_MAX : DBL_MIN;
    let extremeJs = -1;
    let breakJs = -1;
    let case1Break = false;
    let case2Break = false;

    for (let js = currentJs; js <= endJs; js++) {
      const closePrice = closes[js];
      if (searchingForLow) {
        if (lows[js] < extremePrice) {
          extremePrice = lows[js];
          extremeJs = js;
        }
        if (closePrice > lastHighPrice && extremeJs >= 0 && extremeJs <= lastCompletedJs) {
          breakJs = js;
          case1Break = true;
          break;
        }
        if (closePrice < lastLowPrice && extremeJs >= 0 && extremeJs <= lastCompletedJs) {
          breakJs = js;
          case2Break = true;
          break;
        }
      } else {
        if (highs[js] > extremePrice) {
          extremePrice = highs[js];
          extremeJs = js;
        }
        if (closePrice < lastLowPrice && extremeJs >= 0 && extremeJs <= lastCompletedJs) {
          breakJs = js;
          case1Break = true;
          break;
        }
        if (closePrice > lastHighPrice && extremeJs >= 0 && extremeJs <= lastCompletedJs) {
          breakJs = js;
          case2Break = true;
          break;
        }
      }
    }

    if (breakJs < 0) break;

    if (case1Break) {
      handleStructuralBreak(
        state,
        times[breakJs],
        searchingForLow,
        searchingForLow ? lastHighPrice : lastLowPrice,
      );
    } else if (case2Break) {
      handleStructuralBreak(
        state,
        times[breakJs],
        !searchingForLow,
        searchingForLow ? lastLowPrice : lastHighPrice,
      );
    }

    if (case1Break && extremeJs >= 0 && extremeJs <= lastCompletedJs) {
      let searchStartJs = currentJs;
      const breakSrc = jsToSource(breakJs, n);
      const currentSrc = jsToSource(currentJs, n);

      if (searchingForLow) {
        for (let fbSrc = breakSrc + pivotBars + 2; fbSrc <= currentSrc; fbSrc++) {
          const fbJs = sourceToJs(fbSrc, n);
          if (highs[fbJs] > lastHighPrice && closes[fbJs] < lastHighPrice) {
            searchStartJs = fbJs;
            break;
          }
        }
      } else {
        for (let fbSrc = breakSrc + pivotBars + 2; fbSrc <= currentSrc; fbSrc++) {
          const fbJs = sourceToJs(fbSrc, n);
          if (lows[fbJs] < lastLowPrice && closes[fbJs] > lastLowPrice) {
            searchStartJs = fbJs;
            break;
          }
        }
      }

      let bestExtremeJs = extremeJs;
      if (searchingForLow) {
        let bestLow = DBL_MAX;
        for (let sb = searchStartJs; sb <= breakJs; sb++) {
          if (lows[sb] < bestLow) {
            bestLow = lows[sb];
            bestExtremeJs = sb;
          }
        }
      } else {
        let bestHigh = DBL_MIN;
        for (let sb = searchStartJs; sb <= breakJs; sb++) {
          if (highs[sb] > bestHigh) {
            bestHigh = highs[sb];
            bestExtremeJs = sb;
          }
        }
      }

      const newPivot = initPivot(
        bestExtremeJs,
        typical,
        highs,
        lows,
        times,
        !searchingForLow,
        breakJs,
        true,
      );
      pivots.push(newPivot);
      state.pivotCount = pivots.length;
      setLastPivotMoveType(pivots);
      // Safe: inline pivot confirm in base init — bosOccurred stays false here.
      state.currentTrend = updateTrendFromPivots(pivots, state.currentTrend);

      if (newPivot.isHigh) {
        let lowestLow = DBL_MAX;
        let lowestJs = breakJs;
        for (let sb = newPivot.barIndex + 1; sb <= breakJs; sb++) {
          if (lows[sb] < lowestLow) {
            lowestLow = lows[sb];
            lowestJs = sb;
          }
        }
        const opp = initPivot(lowestJs, typical, highs, lows, times, false);
        const prevLow = getPrevSameTypePivotExtreme(pivots, false);
        if (
          validatePivot(
            opp,
            highs,
            lows,
            typical,
            times,
            pivotBars,
            confirmDistance,
            prevLow,
            lastCompletedJs,
          )
        ) {
          pivots.push(opp);
          state.pivotCount = pivots.length;
          setLastPivotMoveType(pivots);
          // Safe: inline pivot confirm in base init — bosOccurred stays false here.
          state.currentTrend = updateTrendFromPivots(pivots, state.currentTrend);
          currentJs = opp.confirmationBarIndex + 1;
        } else {
          currentJs = breakJs + 1;
        }
      } else {
        let highestHigh = DBL_MIN;
        let highestJs = breakJs;
        for (let sb = newPivot.barIndex + 1; sb <= breakJs; sb++) {
          if (highs[sb] > highestHigh) {
            highestHigh = highs[sb];
            highestJs = sb;
          }
        }
        const opp = initPivot(highestJs, typical, highs, lows, times, true);
        const prevHigh = getPrevSameTypePivotExtreme(pivots, true);
        if (
          validatePivot(
            opp,
            highs,
            lows,
            typical,
            times,
            pivotBars,
            confirmDistance,
            prevHigh,
            lastCompletedJs,
          )
        ) {
          pivots.push(opp);
          state.pivotCount = pivots.length;
          setLastPivotMoveType(pivots);
          // Safe: inline pivot confirm in base init — bosOccurred stays false here.
          state.currentTrend = updateTrendFromPivots(pivots, state.currentTrend);
          currentJs = opp.confirmationBarIndex + 1;
        } else {
          currentJs = breakJs + 1;
        }
      }
    } else if (case2Break && extremeJs >= 0 && extremeJs <= lastCompletedJs) {
      let wickBreakJs = -1;
      const breakSrc = jsToSource(breakJs, n);
      const currentSrc = jsToSource(currentJs, n);

      if (searchingForLow) {
        for (let fbSrc = breakSrc + pivotBars + 2; fbSrc <= currentSrc; fbSrc++) {
          const fbJs = sourceToJs(fbSrc, n);
          if (lows[fbJs] < lastLowPrice && closes[fbJs] > lastLowPrice) {
            wickBreakJs = fbJs;
            break;
          }
        }
      } else {
        for (let fbSrc = breakSrc + pivotBars + 2; fbSrc <= currentSrc; fbSrc++) {
          const fbJs = sourceToJs(fbSrc, n);
          if (highs[fbJs] > lastHighPrice && closes[fbJs] < lastHighPrice) {
            wickBreakJs = fbJs;
            break;
          }
        }
      }

      if (wickBreakJs >= 0) {
        const minWickDistance = pivotBars + 2;
        if (jsToSource(wickBreakJs, n) - breakSrc < minWickDistance) {
          wickBreakJs = -1;
        }
      }

      if (wickBreakJs >= 0) {
        const searchStartJs = wickBreakJs + 1;
        if (searchingForLow) {
          let bestLow = DBL_MAX;
          let bestLowJs = -1;
          for (let sb = searchStartJs; sb <= breakJs; sb++) {
            if (lows[sb] < bestLow) {
              bestLow = lows[sb];
              bestLowJs = sb;
            }
          }
          if (bestLowJs >= 0) {
            const adjJs = adjustPivotLowBarJs(bestLowJs, lows, pivotBars);
            const candidate = initPivot(adjJs, typical, highs, lows, times, false);
            const prevLow = getPrevSameTypePivotExtreme(pivots, false);
            if (
              validatePivot(
                candidate,
                highs,
                lows,
                typical,
                times,
                pivotBars,
                confirmDistance,
                prevLow,
                lastCompletedJs,
              )
            ) {
              pivots.push(candidate);
              state.pivotCount = pivots.length;
              setLastPivotMoveType(pivots);
              // Safe: inline pivot confirm in base init — bosOccurred stays false here.
              state.currentTrend = updateTrendFromPivots(pivots, state.currentTrend);
              currentJs = candidate.confirmationBarIndex + 1;
            } else currentJs = breakJs + 1;
          } else currentJs = breakJs + 1;
        } else {
          let bestHigh = DBL_MIN;
          let bestHighJs = -1;
          for (let sb = searchStartJs; sb <= breakJs; sb++) {
            if (highs[sb] > bestHigh) {
              bestHigh = highs[sb];
              bestHighJs = sb;
            }
          }
          if (bestHighJs >= 0) {
            const adjJs = adjustPivotHighBarJs(bestHighJs, highs, pivotBars);
            const candidate = initPivot(adjJs, typical, highs, lows, times, true);
            const prevHigh = getPrevSameTypePivotExtreme(pivots, true);
            if (
              validatePivot(
                candidate,
                highs,
                lows,
                typical,
                times,
                pivotBars,
                confirmDistance,
                prevHigh,
                lastCompletedJs,
              )
            ) {
              pivots.push(candidate);
              state.pivotCount = pivots.length;
              setLastPivotMoveType(pivots);
              // Safe: inline pivot confirm in base init — bosOccurred stays false here.
              state.currentTrend = updateTrendFromPivots(pivots, state.currentTrend);
              currentJs = candidate.confirmationBarIndex + 1;
            } else currentJs = breakJs + 1;
          } else currentJs = breakJs + 1;
        }
      } else {
        let firstPivotJs = -1;
        for (let sb = currentJs; sb <= breakJs; sb++) {
          if (!searchingForLow && isPivotHighJs(sb, typical, pivotBars, n)) {
            firstPivotJs = sb;
            break;
          }
          if (searchingForLow && isPivotLowJs(sb, typical, pivotBars, n)) {
            firstPivotJs = sb;
            break;
          }
        }
        if (firstPivotJs < 0) firstPivotJs = extremeJs;
        const adjJs = searchingForLow
          ? adjustPivotLowBarJs(firstPivotJs, lows, pivotBars)
          : adjustPivotHighBarJs(firstPivotJs, highs, pivotBars);
        const candidate = initPivot(adjJs, typical, highs, lows, times, !searchingForLow);
        const prevExt = getPrevSameTypePivotExtreme(pivots, !searchingForLow);
        if (
          validatePivot(
            candidate,
            highs,
            lows,
            typical,
            times,
            pivotBars,
            confirmDistance,
            prevExt,
            lastCompletedJs,
          )
        ) {
          pivots.push(candidate);
          state.pivotCount = pivots.length;
          setLastPivotMoveType(pivots);
          // Safe: inline pivot confirm in base init — bosOccurred stays false here.
          state.currentTrend = updateTrendFromPivots(pivots, state.currentTrend);
          currentJs = candidate.confirmationBarIndex + 1;
        } else {
          currentJs = breakJs + 1;
        }
      }
    } else {
      break;
    }
  }

  if (pivots.length < 2) {
    return { pivots: [], initialized: false };
  }
  return { pivots, initialized: true };
}

function checkPivotConfirmation(
  pending,
  pivots,
  typical,
  highs,
  lows,
  times,
  pivotBars,
  confirmDistance,
  n,
  state,
) {
  if (!pending.barTime) return false;
  const lastCompletedJs = n - 2;
  const pendingJs = pending.barIndex;
  const firstCheckJs = pendingJs + pivotBars;
  if (firstCheckJs > lastCompletedJs) return false;

  const confirmPrice = pending.isHigh
    ? pending.price - confirmDistance
    : pending.price + confirmDistance;

  const prevExt = getPrevSameTypePivotExtreme(pivots, pending.isHigh);
  // Unreachable through the current search path (extremes are pre-filtered), but
  // matches the source: discard a live extreme that fails structure containment.
  if (pending.isHigh && prevExt < DBL_MAX && pending.high <= prevExt) {
    pending.barIndex = -1;
    pending.barTime = 0;
    return false;
  }
  if (!pending.isHigh && prevExt > DBL_MIN && pending.low >= prevExt) {
    pending.barIndex = -1;
    pending.barTime = 0;
    return false;
  }

  for (let checkJs = firstCheckJs; checkJs <= lastCompletedJs; checkJs++) {
    const checkPrice = typical[checkJs];
    const confirmed = pending.isHigh ? checkPrice <= confirmPrice : checkPrice >= confirmPrice;
    if (!confirmed) continue;

    pending.confirmationBarIndex = checkJs;
    pending.confirmationTime = times[checkJs];
    pending.isConfirmed = true;
    pending.confirmPrice = confirmPrice;
    pivots.push({ ...pending });
    state.pivotCount = pivots.length;
    setLastPivotMoveType(pivots);
    // Safe: pending pivot just confirmed — bosOccurred not set yet on this path.
    state.currentTrend = updateTrendFromPivots(pivots, state.currentTrend);
    state.bosOccurred = false;
    state.bosSameTypeOccurred = false;
    return true;
  }
  return false;
}

function checkStructureBreak(pending, pivots, closes, times, n, state) {
  if (!pending.barTime || pivots.length < 2) return;

  let prevSameLevel = 0;
  let found = false;
  for (let i = pivots.length - 1; i >= 0; i--) {
    if (pivots[i].isHigh === pending.isHigh) {
      prevSameLevel = pending.isHigh ? pivots[i].high : pivots[i].low;
      found = true;
      break;
    }
  }
  if (!found) return;

  const lastCompletedJs = n - 2;
  const currentClose = closes[lastCompletedJs];

  if (pending.isHigh) {
    if (currentClose > prevSameLevel) {
      const lastSame = pivots[pivots.length - 1].isHigh === pending.isHigh;
      if (!state.bosOccurred) {
        state.bosOccurred = true;
        handleStructuralBreak(state, times[lastCompletedJs], true, prevSameLevel);
      }
      if (lastSame) state.bosSameTypeOccurred = true;
    }
  } else if (currentClose < prevSameLevel) {
    const lastSame = pivots[pivots.length - 1].isHigh === pending.isHigh;
      if (!state.bosOccurred) {
        state.bosOccurred = true;
        handleStructuralBreak(state, times[lastCompletedJs], false, prevSameLevel);
      }
    if (lastSame) state.bosSameTypeOccurred = true;
  }
}

function applyPendingBosTrendFromClose(pending, pivots, closes, times, n, state) {
  if (!pending.barTime || pivots.length < 2) return;
  let prevLevel = 0;
  let found = false;
  for (let i = pivots.length - 1; i >= 0; i--) {
    if (pivots[i].isHigh === pending.isHigh) {
      prevLevel = pending.isHigh ? pivots[i].high : pivots[i].low;
      found = true;
      break;
    }
  }
  if (!found) return;
  const c = closes[n - 2];
  if (pending.isHigh && c > prevLevel) state.currentTrend = TREND_UP;
  else if (!pending.isHigh && c < prevLevel) state.currentTrend = TREND_DOWN;
}

function pivotToExport(p) {
  let moveType = "unknown";
  if (p.moveType === IMPULSE) moveType = "impulse";
  else if (p.moveType === PULLBACK) moveType = "pullback";
  return {
    time: p.barTime,
    type: p.isHigh ? "high" : "low",
    extreme: p.isHigh ? p.high : p.low,
    confirmation_time: p.confirmationTime,
    confirm_price: p.confirmPrice,
    move_type: moveType,
  };
}

/** Full recalculation from the whole displayed series. */
export function computeSwingStructure(bars, pointSize, params) {
  const pivotBars = params.pivotBars;
  const confirmPoints = params.confirmPoints;
  const n = bars.length;
  const minBars = pivotBars * 3 + 1;
  if (n < minBars) {
    return {
      pivots: [],
      pending: null,
      lastBreakBarTime: 0,
      bosOccurred: false,
      bosSameTypeOccurred: false,
      currentTrend: TREND_UNKNOWN,
      warning: `insufficient history: need at least ${minBars} bars, have ${n}`,
    };
  }

  const typical = typicalPrice(bars);
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  const closes = bars.map((b) => b.close);
  const times = bars.map((b) => b.time);
  const confirmDistance = confirmPoints * pointSize;

  const state = makeBreakState();
  state.pivotCount = 0;

  const base = initializeBasePivots(
    typical,
    highs,
    lows,
    closes,
    times,
    pivotBars,
    confirmDistance,
    n,
    state,
  );
  if (!base.initialized) {
    return {
      pivots: [],
      pending: null,
      lastBreakBarTime: 0,
      bosOccurred: false,
      bosSameTypeOccurred: false,
      currentTrend: TREND_UNKNOWN,
      warning: "no confirmed swing structure found",
    };
  }

  const pivots = base.pivots;
  // Safe: post base-init, before pending swing — bosOccurred still false.
  state.currentTrend = updateTrendFromPivots(pivots, state.currentTrend);

  const emptyPending = {
    barIndex: -1,
    barTime: 0,
    price: 0,
    high: 0,
    low: 0,
    isHigh: false,
    confirmationBarIndex: -1,
    confirmationTime: 0,
    isConfirmed: false,
    confirmPrice: 0,
    moveType: UNKNOWN,
  };

  let hasPending = false;
  if (pivots.length >= 2) {
    const lastConfirmed = pivots[pivots.length - 1];
    const searchForHigh = !lastConfirmed.isHigh;
    const prevSameExtreme = getPrevSameTypePivotExtreme(pivots, searchForHigh);
    const lastCompletedJs = n - 2;
    const searchStartJs = lastConfirmed.confirmationBarIndex + 1;
    let bestJs = -1;
    let bestExtreme = searchForHigh ? DBL_MIN : DBL_MAX;
    if (searchStartJs <= lastCompletedJs) {
      for (let js = searchStartJs; js <= lastCompletedJs; js++) {
        if (searchForHigh) {
          if (prevSameExtreme < DBL_MAX && highs[js] <= prevSameExtreme) continue;
          if (highs[js] > bestExtreme) {
            bestExtreme = highs[js];
            bestJs = js;
          }
        } else {
          if (prevSameExtreme > DBL_MIN && lows[js] >= prevSameExtreme) continue;
          if (lows[js] < bestExtreme) {
            bestExtreme = lows[js];
            bestJs = js;
          }
        }
      }
    }
    if (bestJs >= 0) {
      Object.assign(emptyPending, initPivot(bestJs, typical, highs, lows, times, searchForHigh));
      hasPending = true;
    }
  }

  if (hasPending) {
    checkPivotConfirmation(
      emptyPending,
      pivots,
      typical,
      highs,
      lows,
      times,
      pivotBars,
      confirmDistance,
      n,
      state,
    );
    if (emptyPending.isConfirmed) {
      hasPending = false;
    } else if (!emptyPending.barTime) {
      hasPending = false;
    } else if (emptyPending.barIndex >= 0) {
      checkStructureBreak(emptyPending, pivots, closes, times, n, state);
      applyPendingBosTrendFromClose(emptyPending, pivots, closes, times, n, state);
    }
  }

  return {
    pivots,
    pending: hasPending && !emptyPending.isConfirmed ? emptyPending : null,
    lastBreakBarTime: state.lastBreakBarTime,
    bosOccurred: state.bosOccurred,
    bosSameTypeOccurred: state.bosSameTypeOccurred,
    currentTrend: state.currentTrend,
    warning: null,
    exportPivots: () => pivots.map(pivotToExport),
  };
}

export { IMPULSE, PULLBACK, UNKNOWN, typicalPrice };
