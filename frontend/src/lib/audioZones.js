import { PROXIMITY_RADIUS, SPACES, getRoomIdAtPosition } from './world.js';

// A room-aware *UI eligibility preview* only. Real room joins and audio routing
// are owned by the team's signaling and WebRTC integration.
export function getAudioZonePreview(position, peers = []) {
  const roomId = getRoomIdAtPosition(position?.x, position?.y);
  const room = SPACES.find((zone) => zone.id === roomId);
  const list = Array.isArray(peers) ? peers : [];
  const nearbyPeers = !roomId ? [] : list.filter((peer) => {
    if (!peer || !Number.isFinite(peer.x) || !Number.isFinite(peer.y)) return false;
    return getRoomIdAtPosition(peer.x, peer.y) === roomId
      && Math.hypot(peer.x - position.x, peer.y - position.y) <= PROXIMITY_RADIUS;
  });
  return {
    roomId,
    roomLabel: room?.short || 'Outside rooms',
    nearbyPeers,
    radius: PROXIMITY_RADIUS,
  };
}
