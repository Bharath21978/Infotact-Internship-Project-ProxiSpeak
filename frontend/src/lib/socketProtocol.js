import { WORLD } from './world.js';

/** Proposed socket event names; confirm them with Jeevith. */
export const EVENTS = Object.freeze({ join: 'player:join', move: 'player:move', update: 'players:update', leave: 'player:left' });

/** Pure validated parser: testable with Node without a Socket.IO server. */
export function parsePlayers(payload, selfId) {
  if (!Array.isArray(payload)) return [];
  const unique = new Set();
  return payload.slice(0, 100).flatMap((p) => {
    if (!p || typeof p !== 'object' || typeof p.id !== 'string' || p.id === selfId || unique.has(p.id)) return [];
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > WORLD.width || p.y < 0 || p.y > WORLD.height) return [];
    unique.add(p.id);
    const name = typeof p.name === 'string' ? p.name.trim().slice(0, 30) : 'Guest';
    return [{ id: p.id, name: name || 'Guest', initials: (name || 'GU').slice(0, 2).toUpperCase(), role: typeof p.role === 'string' ? p.role.slice(0, 35) : 'Participant', x: p.x, y: p.y, color: /^#[0-9a-f]{6}$/i.test(p.color) ? p.color : '#8eaaff' }];
  });
}
