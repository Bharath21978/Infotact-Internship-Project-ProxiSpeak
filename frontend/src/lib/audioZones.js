import { PROXIMITY_RADIUS, SPACES, getRoomIdAtPosition } from './world.js';

// UI eligibility preview only.
// Actual WebRTC audio routing is handled by the team's integration.
export function getAudioZonePreview(position, peers = []) {
  const hasPosition =
    Number.isFinite(position?.x) &&
    Number.isFinite(position?.y);

  const roomId = hasPosition
    ? getRoomIdAtPosition(position.x, position.y)
    : null;

  const room = SPACES.find((zone) => zone.id === roomId);

  const isStudio = roomId === 'studio';

  const list = Array.isArray(peers) ? peers : [];

  const nearbyPeers = !roomId
    ? []
    : list.filter((peer) => {
        if (
          !peer ||
          !Number.isFinite(peer.x) ||
          !Number.isFinite(peer.y)
        ) {
          return false;
        }

        // Participants must belong to the same room.
        const peerRoomId = getRoomIdAtPosition(peer.x, peer.y);

        if (peerRoomId !== roomId) {
          return false;
        }

        // Ideation Lab and Focus Lounge:
        // Every participant in the same room is eligible.
        if (!isStudio) {
          return true;
        }

        // Studio:
        // Only participants within 168 world units are eligible.
        const distance = Math.hypot(
          peer.x - position.x,
          peer.y - position.y
        );

        return distance <= PROXIMITY_RADIUS;
      });

  return {
    roomId,
    roomLabel: room?.short || 'Outside rooms',
    nearbyPeers,
    radius: isStudio ? PROXIMITY_RADIUS : null,
    rangeLabel: isStudio
      ? `Within ${PROXIMITY_RADIUS} world units`
      : roomId
        ? 'All participants in this room'
        : 'No active room',
  };
}