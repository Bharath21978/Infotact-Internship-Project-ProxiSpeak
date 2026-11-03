import { WORLD } from './world.js';

/** Match Jeevith's backend input events; player:left remains an optional broadcast alias. */
export const EVENTS = Object.freeze({
  join: 'player:join',
  move: 'player:move',
  update: 'players:update',
  leave: 'player:leave',  // client -> server; optional before disconnect
  left: 'player:left',   // optional server -> client; current server uses players:update
});

/** Pure validated parser: testable with Node without a Socket.IO server. */
export function parsePlayers(payload, selfId) {
  if (!Array.isArray(payload)) return [];
  const unique = new Set();
  return payload.slice(0, 100).flatMap((p) => {
    if (!p || typeof p !== 'object' || typeof p.id !== 'string' || p.id === selfId || unique.has(p.id)) return [];
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > WORLD.width || p.y < 0 || p.y > WORLD.height) return [];
    unique.add(p.id);
    const name = typeof p.name === 'string' ? p.name.trim().slice(0, 30) : 'Guest';
    return [{ id: p.id, name: name || 'Guest', initials: (name || 'GU').slice(0, 2).toUpperCase(), role: typeof p.role === 'string' ? p.role.slice(0, 35) : 'Participant', x: p.x, y: p.y, socketId: typeof p.socketId === 'string' && p.socketId.length <= 128 ? p.socketId : null, color: /^#[0-9a-f]{6}$/i.test(p.color) ? p.color : '#8eaaff' }];
  });
}
