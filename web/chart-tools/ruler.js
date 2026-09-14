/* Ruler: a two-click measurement, TradingView-style.
 *
 * Click once to anchor, move the pointer to preview, click again to finish. The
 * finished measurement stays until Escape, a new measurement, or deactivating
 * the tool. Each anchor takes its time from the bar under the pointer (the
 * chart already snaps it, so a measurement always spans whole bars) and its
 * price from the exact pointer position.
 *
 * All arithmetic lives in measure.js; this file is the renderer and the event
 * wiring, deliberately thin because neither part is unit-tested.
 */

import { xCoordinate, xCoordinateLogical } from "../chart/coords.js";
import { barIntervalSeconds, measure, measurementLines } from "./measure.js";
import { registerTool } from "./registry.js";
import { suppressDragPan } from "./scroll-lock.js";

const COLORS = {
  up: { line: "#26a69a", fill: "rgba(38, 166, 154, 0.16)" },
  down: { line: "#ef5350", fill: "rgba(239, 83, 80, 0.16)" },
  flat: { line: "#8b98a5", fill: "rgba(139, 152, 165, 0.14)" },
};

const LABEL_FONT = "11px system-ui, -apple-system, 'Segoe UI', sans-serif";
const LABEL_BACKGROUND = "#0f1216"; // opaque: the readout sits over candles
const LABEL_MUTED = "#8b98a5";
const LABEL_PADDING = 6;
const LABEL_LINE_HEIGHT = 14;
const LABEL_GAP = 10; // between the end anchor and the box
const PANE_MARGIN = 4;
const ANCHOR_RADIUS = 3;

class RulerPrimitive {
  constructor() {
    this._measurement = null;
    this._lines = [];
    this._chart = null;
    this._series = null;
    this._bars = null;
    this._requestUpdate = null;

    const primitive = this;
    this._paneView = {
      zOrder: () => "top", // over the candles, unlike indicator drawables
      renderer: () => ({ draw: (target) => primitive._draw(target) }),
    };
  }

  attached({ chart, series, requestUpdate }) {
    this._chart = chart;
    this._series = series;
    this._requestUpdate = requestUpdate;
  }

  detached() {
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
  }

  paneViews() {
    return [this._paneView];
  }

  setBarsAccessor(bars) {
    this._bars = bars;
  }

  updateAllViews() {}

  /* The single entry point: preview, completion and dismissal all land here. */
  setMeasurement(measurement, lines) {
    this._measurement = measurement;
    this._lines = lines || [];
    if (this._requestUpdate) this._requestUpdate();
  }

  _draw(target) {
    const m = this._measurement;
    if (!m || !this._chart || !this._series) return;

    target.useMediaCoordinateSpace((scope) => {
      const ctx = scope.context;
      const { width, height } = scope.mediaSize;
      const timeScale = this._chart.timeScale();
      const visible = timeScale.getVisibleRange();
      const visibleLogical = timeScale.getVisibleLogicalRange();
      if (!visible) return;

      const bars = this._bars ? this._bars() : [];
      const toLogical = projectedEndLogical(bars, m.anchorTimeTo);
      const right =
        toLogical !== null
          ? xCoordinateLogical(toLogical, timeScale, visibleLogical, width)
          : xCoordinate(m.timeTo, timeScale, visible, width);
      const left = xCoordinate(m.timeFrom, timeScale, visible, width);
      const top = this._series.priceToCoordinate(m.priceHigh);
      const bottom = this._series.priceToCoordinate(m.priceLow);
      if (left === null || right === null || top === null || bottom === null) return;

      const colors = COLORS[m.direction] || COLORS.flat;

      ctx.fillStyle = colors.fill;
      ctx.fillRect(left, top, right - left, bottom - top);
      ctx.strokeStyle = colors.line;
      ctx.lineWidth = 1;
      ctx.strokeRect(left, top, right - left, bottom - top);

      const xFrom = xCoordinate(m.anchorTimeFrom, timeScale, visible, width);
      const xTo =
        toLogical !== null
          ? xCoordinateLogical(toLogical, timeScale, visibleLogical, width)
          : xCoordinate(m.anchorTimeTo, timeScale, visible, width);
      const yFrom = this._series.priceToCoordinate(m.priceFrom);
      const yTo = this._series.priceToCoordinate(m.priceTo);
      if (xFrom !== null && xTo !== null && yFrom !== null && yTo !== null) {
        this._drawConnector(ctx, colors, xFrom, yFrom, xTo, yTo);
        this._drawLabel(ctx, colors, xTo, yTo, width, height);
      }
    });
  }

  _drawConnector(ctx, colors, xFrom, yFrom, xTo, yTo) {
    ctx.strokeStyle = colors.line;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(xFrom, yFrom);
    ctx.lineTo(xTo, yTo);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = colors.line;
    for (const [x, y] of [
      [xFrom, yFrom],
      [xTo, yTo],
    ]) {
      ctx.beginPath();
      ctx.arc(x, y, ANCHOR_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* Placed beside the end anchor, then clamped into the pane so a measurement
   * running off the visible range still shows its numbers. */
  _drawLabel(ctx, colors, xTo, yTo, width, height) {
    if (!this._lines.length) return;

    ctx.font = LABEL_FONT;
    const textWidth = Math.max(...this._lines.map((line) => ctx.measureText(line).width));
    const boxWidth = textWidth + LABEL_PADDING * 2;
    const boxHeight = this._lines.length * LABEL_LINE_HEIGHT + LABEL_PADDING * 2;

    const maxX = Math.max(PANE_MARGIN, width - boxWidth - PANE_MARGIN);
    const maxY = Math.max(PANE_MARGIN, height - boxHeight - PANE_MARGIN);
    const x = Math.min(Math.max(xTo + LABEL_GAP, PANE_MARGIN), maxX);
    const y = Math.min(Math.max(yTo - boxHeight / 2, PANE_MARGIN), maxY);

    ctx.fillStyle = LABEL_BACKGROUND;
    ctx.fillRect(x, y, boxWidth, boxHeight);
    ctx.strokeStyle = colors.line;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, boxWidth, boxHeight);

    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    this._lines.forEach((line, index) => {
      ctx.fillStyle = index === 0 ? colors.line : LABEL_MUTED;
      ctx.fillText(line, x + LABEL_PADDING, y + LABEL_PADDING + index * LABEL_LINE_HEIGHT);
    });
  }
}

/* ---------- Interaction ---------- */

function projectedEndLogical(bars, anchorTime) {
  if (!bars || !bars.length) return null;
  const lastIndex = bars.length - 1;
  const lastTime = bars[lastIndex].time;
  if (anchorTime <= lastTime) return null;

  const interval = barIntervalSeconds(bars);
  if (!interval) return null;

  const barsAhead = Math.round((anchorTime - lastTime) / interval);
  return lastIndex + barsAhead;
}

const primitive = new RulerPrimitive();

const ruler = {
  context: null,
  attached: false,
  pending: null, // first anchor while a measurement is in progress
  measurement: null,
  restoreDragPan: null,
};

function anchorFrom(param, { allowProjected = false } = {}) {
  if (!param || !param.point || !ruler.context) return null;

  const price = ruler.context.series.coordinateToPrice(param.point.y);
  if (price === null || !Number.isFinite(price)) return null;

  if (param.time !== undefined && param.time !== null) {
    return { time: param.time, price, barsAhead: 0 };
  }

  if (!allowProjected) return null;

  const bars = ruler.context.bars();
  if (!bars.length) return null;

  const logical = param.logical;
  if (logical === undefined || logical === null) return null;

  const lastIndex = bars.length - 1;
  const barsAhead = Math.max(0, Math.round(logical) - lastIndex);
  if (barsAhead === 0) return null;

  const interval = barIntervalSeconds(bars);
  if (!interval) return null;

  return {
    time: bars[lastIndex].time + barsAhead * interval,
    price,
    barsAhead,
  };
}

function show(measurement) {
  ruler.measurement = measurement;
  primitive.setMeasurement(
    measurement,
    measurement ? measurementLines(measurement, ruler.context.instrument()) : [],
  );
}

function onClick(param) {
  const bars = ruler.context.bars();
  if (!bars.length) return; // nothing to measure against

  if (ruler.pending) {
    const anchor = anchorFrom(param, { allowProjected: true });
    if (!anchor) return;
    const completed = measure(bars, ruler.pending, anchor);
    ruler.pending = null;
    show(completed);
    return;
  }

  const anchor = anchorFrom(param, { allowProjected: false });
  if (!anchor) return; // whitespace past the last bar, or off the pane

  ruler.pending = anchor;
  show(null); // a new measurement replaces the previous one rather than adding
}

function onCrosshairMove(param) {
  if (!ruler.pending) return; // a finished measurement never moves
  const bars = ruler.context.bars();
  if (!bars.length) return;
  const anchor = anchorFrom(param, { allowProjected: true });
  if (!anchor) return;
  show(measure(bars, ruler.pending, anchor));
}

function onKeyDown(event) {
  if (event.key !== "Escape") return;
  if (!ruler.pending && !ruler.measurement) return;
  ruler.pending = null;
  show(null); // the tool itself stays active
}

registerTool({
  id: "ruler",
  label: "Ruler",

  activate(context) {
    ruler.context = context;
    const { chart, series } = context;

    // Attached once and left attached: with no measurement it draws nothing.
    if (!ruler.attached) {
      series.attachPrimitive(primitive);
      ruler.attached = true;
    }
    primitive.setBarsAccessor(context.bars);

    // lightweight-charts emits a click at the end of a drag, so panning by
    // dragging the chart body would drop an unintended anchor. Wheel zoom and
    // axis dragging stay available. The undo is held rather than reconstructed
    // on deactivate: see scroll-lock.js for why reading the chart back cannot
    // recover the previous value.
    ruler.restoreDragPan = suppressDragPan(chart);

    chart.subscribeClick(onClick);
    chart.subscribeCrosshairMove(onCrosshairMove);
    document.addEventListener("keydown", onKeyDown);
  },

  deactivate() {
    const { chart } = ruler.context;
    chart.unsubscribeClick(onClick);
    chart.unsubscribeCrosshairMove(onCrosshairMove);
    document.removeEventListener("keydown", onKeyDown);

    ruler.restoreDragPan();
    ruler.restoreDragPan = null;

    primitive.setBarsAccessor(null);
    ruler.pending = null;
    show(null);
    ruler.context = null;
  },
});
