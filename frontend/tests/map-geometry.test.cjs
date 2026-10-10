const assert = require('node:assert/strict');
const test = require('node:test');
const { loadModule } = require('./modules.cjs');
const geometry = () => loadModule('src/lib/map-geometry.ts');
test('viewport coverage works worldwide, buffers movement and rejects invalid views', () => {
  const g = geometry();
  assert.ok(g.coverViewport([0, 0, 10, 10]));
  const b = g.coverViewport([110, 1, 112, 3]);
  assert.ok(b[0] <= 110 && b[1] <= 1 && b[2] >= 112 && b[3] >= 3);
  assert.equal(g.nextCoverage(b, [110.1, 1.1, 111.9, 2.9]), b);
  assert.ok(g.coverViewport([-125, 35, -120, 39])[0] < -125);
  assert.equal(g.coverViewport([NaN, 0, 10, 10]), null);
  assert.notEqual(g.nextCoverage(b, [111, 2, 111.1, 2.1]), b);
});
test('explicit analysis accepts detailed global views but guards planetary aggregation',()=>{
  const g=geometry();
  assert.equal(g.analysisViewError([-123,37,-122,38]),null);
  assert.match(g.analysisViewError([-180,-80,180,80]),/Zoom in/);
  const nearDateLine=g.coverViewport([179,0,181,1]);
  assert.ok(nearDateLine[0]>=-180 && nearDateLine[2]<=180);
});
test('scientific overlays stay hidden outside their loaded footprint and at world scales',()=>{
  const {analysisOverlayVisible}=geometry();
  const loaded=[-123,37,-122,38];
  assert.equal(analysisOverlayVisible([-122.9,37.1,-122.1,37.9],loaded),true);
  assert.equal(analysisOverlayVisible([46,24,47,25],loaded),false);
  assert.equal(analysisOverlayVisible([-180,-80,180,80],loaded),false);
});
test('geodesic measurement has known units and rejects invalid polygons', () => {
  const g = geometry();
  assert.ok(Math.abs(g.distanceKm([[0,0],[1,0]]) - 111.195) < .01);
  assert.ok(Math.abs(g.areaKm2([[0,0],[1,0],[1,1],[0,1]]) - 12364) < 2);
  assert.equal(g.polygonError([[0,0],[1,1],[0,1],[1,0]]), 'Edges cross. Draw a simple boundary.');
  assert.ok(g.polygonError([[0,0],[1,0]]));
  assert.ok(g.polygonError([[0,0],[1,0],[2,0]]));
  assert.equal(g.polygonError([[0,0],[1,0],[1,1]]), null);
  const circle = g.analysisCircle([111,2],1000);
  assert.equal(circle.features[0].geometry.coordinates[0].length, 65);
  assert.ok(Math.abs(g.distanceKm([[111,2], circle.features[0].geometry.coordinates[0][0]]) - 1) < .001);
});
