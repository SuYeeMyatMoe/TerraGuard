const test = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { loadModule } = require("./modules.cjs");

test("early crew arrival does not mark later fire progression as completed", () => {
  const state = { sim: { steps: 48, teams: 1, response_delay: 1, assumptions: {},
    plots: [{ incident_id: "B" }], policies: { ai_priority: { assigned: ["B"] } } },
    policy: "ai_priority", crewMode: 1, step: 1, speed: 1, playing: false };
  const { Timeline } = loadModule("src/components/command/Timeline.tsx", {
    react: { ...React, useEffect() {} }, "@/lib/store": { useStore: select => select(state) },
    "@/lib/crewMotion": { PLAYBACK_STEP_MS: 500 },
  });
  const html = renderToStaticMarkup(React.createElement(Timeline));
  // Read only the list item containing the future phase.
  const item = html.slice(0, html.indexOf("<b>Fire progression</b>")).split("<li").at(-1);
  assert.doesNotMatch(item, /is-done|is-active/);
  assert.ok(html.indexOf("<b>Crew on site</b>") < html.indexOf("<b>Fire progression</b>"));
});
