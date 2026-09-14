/* Chart tool registry.
 *
 * A tool is driven by pointer input rather than computed from bars, so it holds
 * state across events and does not fit the indicator contract. Activation lives
 * here so "at most one tool at a time" is enforced in exactly one place.
 *
 * A tool registers:
 *   { id, label, activate(context), deactivate() }
 *
 * The context is supplied by the app on activation (chart, series, and
 * accessors for the current bars and instrument), so tool modules can register
 * themselves at import time without reaching into app state.
 */

const tools = [];
let activeId = null;

export function registerTool(spec) {
  for (const key of ["id", "label", "activate", "deactivate"]) {
    if (!(key in spec)) throw new Error(`tool registration missing ${key}`);
  }
  if (tools.some((t) => t.id === spec.id)) {
    throw new Error(`tool ${spec.id} already registered`);
  }
  tools.push(spec);
}

export function allTools() {
  return [...tools];
}

export function activeToolId() {
  return activeId;
}

/* Activate a tool, deactivating whatever was active first. Pass null to just
 * deactivate. */
export function setActiveTool(id, context) {
  const target = id ?? null;
  if (activeId === target) return;

  const previous = tools.find((t) => t.id === activeId);
  activeId = null;
  if (previous) previous.deactivate();

  if (target === null) return;
  const next = tools.find((t) => t.id === target);
  if (!next) throw new Error(`unknown tool ${target}`);
  next.activate(context);
  activeId = target;
}
