const test = require("node:test");
const assert = require("node:assert/strict");
const { loadModule } = require("./modules.cjs");
const { crewRoute, replayBounds } = loadModule("src/lib/crew-map.ts");
const incidents = [{ id: "A", lon: 113, lat: 3 }, { id: "B", lon: 114, lat: 4 }];
const team = { base_lon: 110, base_lat: 1, assigned_incident_id: "A" };
const plain = value => JSON.parse(JSON.stringify(value));

test("crew allocation follows the server assignment and clears on release", () => {
  assert.deepEqual(plain(crewRoute(incidents, team).features[0].geometry), {
    type: "LineString", coordinates: [[110, 1], [113, 3]],
  });
  assert.deepEqual(plain(crewRoute(incidents, { ...team, assigned_incident_id: "B" }).features[0].geometry.coordinates), [[110, 1], [114, 4]]);
  assert.equal(crewRoute(incidents, { ...team, assigned_incident_id: null }).features.length, 0);
  assert.equal(crewRoute(incidents, { ...team, assigned_incident_id: "previous-replay" }).features.length, 0);
});

test("replay overview includes an outlying crew base and all competing incidents", () => {
  const bounds = replayBounds(incidents, team);
  for (const [lon, lat] of [[110, 1], [113, 3], [114, 4]]) {
    assert.ok(lon > bounds[0][0] && lon < bounds[1][0]);
    assert.ok(lat > bounds[0][1] && lat < bounds[1][1]);
  }
  assert.deepEqual(plain(bounds), [[109.4, 0.4], [114.6, 4.6]]);
  assert.equal(replayBounds([], undefined), null);
});
