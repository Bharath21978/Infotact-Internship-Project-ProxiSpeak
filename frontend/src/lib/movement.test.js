import test from 'node:test';
import assert from 'node:assert/strict';
import { distance, inRange, normalizedDirection, validPosition, moveWithCollisions, findPath, segmentClear, simplifyPath } from './movement.js';
import { SPAWN, PROXIMITY_RADIUS, WORLD, FURNITURE } from './world.js';

test('distance is symmetric and uses Euclidean coordinates', () => {
  assert.equal(distance({x:0,y:0},{x:3,y:4}),5);
  assert.equal(distance({x:3,y:4},{x:0,y:0}),5);
});
test('proximity radius includes equality boundary', () => {
  assert.ok(inRange({x:20,y:20},{x:20+PROXIMITY_RADIUS,y:20}));
  assert.ok(!inRange({x:20,y:20},{x:21+PROXIMITY_RADIUS,y:20}));
});
test('direction is normalized diagonally', () => {
  const d=normalizedDirection(new Set(['w','d']));
  assert.ok(Math.abs(Math.hypot(d.x,d.y)-1)<1e-10);
  assert.equal(normalizedDirection(new Set(['a','d'])).x,0);
  assert.deepEqual(normalizedDirection(new Set()),{x:0,y:0});
});
test('spawn is open, outside edges and desk center are blocked', () => {
  assert.ok(validPosition(SPAWN));
  assert.ok(!validPosition({x:-1,y:100}));
  assert.ok(!validPosition({x:WORLD.width+1,y:100}));
  for (const f of FURNITURE) assert.ok(!validPosition({x:f.x+f.w/2,y:f.y+f.h/2}),f.id);
  assert.ok(!validPosition({x:NaN,y:1}));
});
test('walking cannot enter a desk and slide works', () => {
  const from={x:95,y:210};
  assert.ok(validPosition(from));
  const into={x:125,y:210};
  assert.deepEqual(moveWithCollisions(from,into),from);
  const along={x:95,y:215};
  assert.deepEqual(moveWithCollisions(from,along),along);
});
test('click navigation reaches a valid destination around furniture', () => {
  const goal={x:675,y:400};
  const path=findPath(SPAWN,goal);
  assert.ok(path.length>0);
  assert.ok(path.every(validPosition));
  const trimmed=simplifyPath(SPAWN,path);
  assert.ok(trimmed.length<=path.length);
  let prev=SPAWN;
  for (const p of trimmed) {assert.ok(segmentClear(prev,p));prev=p;}
});
test('clicking on furniture snaps to open cell', () => {
  const desk=FURNITURE[0];
  const path=findPath(SPAWN,{x:desk.x+desk.w/2,y:desk.y+desk.h/2});
  assert.ok(path.length>0);
  assert.ok(path.every(validPosition));
});
