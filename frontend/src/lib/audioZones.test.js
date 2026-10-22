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
