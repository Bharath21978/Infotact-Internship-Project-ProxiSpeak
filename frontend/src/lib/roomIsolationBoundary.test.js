import test from 'node:test';
import assert from 'node:assert/strict';
import { getRoomIdAtPosition } from './world.js';
import { getAudioZonePreview } from './audioZones.js';

test('Studio room boundaries are correctly detected', () => {
  assert.equal(getRoomIdAtPosition(42, 44), 'studio');
  assert.equal(getRoomIdAtPosition(775.99, 672.99), 'studio');
  assert.equal(getRoomIdAtPosition(776, 400), null);
  assert.equal(getRoomIdAtPosition(400, 673), null);
});

test('Studio and Ideation audio remain isolated', () => {
  const studio = { x: 775, y: 100 };
  const ideation = { x: 799, y: 100 };

  const result = getAudioZonePreview(studio, [
    { id: 'user2', ...ideation }
  ]);

  assert.equal(result.nearbyPeers.length, 0);
});

test('Ideation and Lounge audio remain isolated', () => {
  const ideation = { x: 900, y: 329 };
  const lounge = { x: 900, y: 353 };

  const result = getAudioZonePreview(ideation, [
    { id: 'user2', ...lounge }
  ]);

  assert.equal(result.nearbyPeers.length, 0);
  assert.equal(getRoomIdAtPosition(900, 340), null);
});

test('Invalid avatar positions cannot receive audio', () => {
  const invalid = [
    { x: NaN, y: 100 },
    { x: Infinity, y: 100 },
    { x: 100 },
    null
  ];

  for (const position of invalid) {
    const result = getAudioZonePreview(position, [
      { id: 'user2', x: 100, y: 100 }
    ]);

    assert.equal(result.nearbyPeers.length, 0);
  }
});
