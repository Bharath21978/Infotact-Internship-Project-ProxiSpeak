import test from 'node:test';
import assert from 'node:assert/strict';
import { getAudioZonePreview } from './audioZones.js';

test('current rooms are resolved from logical avatar coordinates', () => {
  assert.equal(getAudioZonePreview({ x: 286, y: 365 }).roomId, 'studio');
  assert.equal(getAudioZonePreview({ x: 866, y: 270 }).roomId, 'ideation');
  assert.equal(getAudioZonePreview({ x: 865, y: 558 }).roomId, 'lounge');
  assert.equal(getAudioZonePreview({ x: 789, y: 345 }).roomId, null);
});

test('same-room candidates within the inclusive 168-unit radius are shown', () => {
  const preview = getAudioZonePreview({ x: 286, y: 365 }, [
    { id: 'boundary', x: 454, y: 365 },
    { id: 'beyond', x: 455, y: 365 },
    { id: 'other-room', x: 866, y: 270 },
    { id: 'invalid', x: NaN, y: 200 },
  ]);
  assert.deepEqual(preview.nearbyPeers.map(p => p.id), ['boundary']);
});

test('positions outside all rooms are not audio-eligible', () => {
  const p = getAudioZonePreview({ x: 790, y: 345 }, [{ id: 'near', x: 795, y: 345 }]);
  assert.equal(p.roomId, null);
  assert.equal(p.nearbyPeers.length, 0);
});
// TEST 4: Ideation Lab allows everyone in the same room
test('Ideation Lab supports room-wide audio eligibility', () => {
  const preview = getAudioZonePreview(
    { x: 810, y: 60 },
    [{ id: 'far-user', x: 1140, y: 300 }]
  );

  assert.equal(preview.roomId, 'ideation');
  assert.equal(preview.nearbyPeers.length, 1);
  assert.equal(preview.radius, null);
});

// TEST 5: Focus Lounge allows everyone in the same room
test('Focus Lounge supports room-wide audio eligibility', () => {
  const preview = getAudioZonePreview(
    { x: 810, y: 360 },
    [{ id: 'far-user', x: 1140, y: 650 }]
  );

  assert.equal(preview.roomId, 'lounge');
  assert.equal(preview.nearbyPeers.length, 1);
  assert.equal(preview.radius, null);
});

// TEST 6: Participants from different rooms are excluded
test('Audio eligibility is isolated between rooms', () => {
  const preview = getAudioZonePreview(
    { x: 810, y: 100 },
    [
      { id: 'studio-user', x: 760, y: 100 },
      { id: 'lounge-user', x: 900, y: 500 },
      { id: 'ideation-user', x: 900, y: 100 },
    ]
  );

  assert.deepEqual(
    preview.nearbyPeers.map(peer => peer.id),
    ['ideation-user']
  );
});

// TEST 7: Room transitions update eligible participants
test('Room transitions update audio eligibility', () => {
  const peers = [
    { id: 'ideation-user', x: 900, y: 100 },
    { id: 'lounge-user', x: 900, y: 500 },
  ];

  const before = getAudioZonePreview(
    { x: 810, y: 100 },
    peers
  );

  const after = getAudioZonePreview(
    { x: 810, y: 500 },
    peers
  );

  assert.deepEqual(
    before.nearbyPeers.map(peer => peer.id),
    ['ideation-user']
  );

  assert.deepEqual(
    after.nearbyPeers.map(peer => peer.id),
    ['lounge-user']
  );
});