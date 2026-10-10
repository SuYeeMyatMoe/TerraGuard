const assert = require('node:assert/strict');
const test = require('node:test');
const { loadModule } = require('./modules.cjs');
const geometry = () => loadModule('src/lib/map-geometry.ts');
test('viewport coverage clips to study, buffers movement, and rejects outside views', () => {
  const g = geometry();
  assert.equal(g.coverViewport([0, 0, 10, 10]), null);
  const b = g.coverViewport([110, 1, 112, 3]);
  assert.ok(b[0] <= 110 && b[1] <= 1 && b[2] >= 112 && b[3] >= 3);
  assert.equal(g.nextCoverage(b, [110.1, 1.1, 111.9, 2.9]), b);
  assert.ok(g.coverViewport([90, -10, 130, 20])[0] === 95);
  assert.notEqual(g.nextCoverage(b, [111, 2, 111.1, 2.1]), b);
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
