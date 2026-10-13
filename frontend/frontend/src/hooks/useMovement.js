import { useCallback, useEffect, useRef, useState } from 'react';
import { MOVE_SPEED, SPAWN } from '../lib/world.js';
import { distance, findPath, moveWithCollisions, normalizedDirection, simplifyPath } from '../lib/movement.js';

const BINDINGS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright']);

export function useMovement(onBroadcast) {
  const [position, setPosition] = useState({ ...SPAWN });
  const [movement, setMovement] = useState('Idle');
  const [metersTravelled, setMetersTravelled] = useState(0);
  const positionRef = useRef({ ...SPAWN });
  const keySet = useRef(new Set());
  const waypointsRef = useRef([]);
  const trailRef = useRef([]);
  const broadcasts = useRef(onBroadcast);
  broadcasts.current = onBroadcast;

  const moveTo = useCallback((point) => {
    const originalPath = findPath(positionRef.current, point);
    if (!originalPath.length) return false;
    waypointsRef.current = simplifyPath(positionRef.current, originalPath);
    return true;
  }, []);
  const cancelPath = useCallback(() => { waypointsRef.current = []; }, []);
  const reset = useCallback(() => {
    keySet.current.clear(); waypointsRef.current = [];
    positionRef.current = { ...SPAWN }; trailRef.current = [];
    setPosition({ ...SPAWN }); setMovement('Idle');
    broadcasts.current?.(positionRef.current);
  }, []);
  const hold = useCallback((key, held) => {
    if (!BINDINGS.has(key)) return;
    if (held) { keySet.current.add(key); waypointsRef.current = []; }
    else keySet.current.delete(key);
  }, []);

  useEffect(() => {
    let frameId;
    let previous = performance.now();
    let lastPaint = 0;
    let lastBroadcast = 0;
    let lastTrail = 0;
    let pendingDistance = 0;
    let mode = 'Idle';

    const onDown = (e) => {
      const element = e.target;
      if (e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented || (element instanceof Element && element.closest('input, textarea, select, [contenteditable="true"]'))) return;
      const key = e.key.toLowerCase();
      if (!BINDINGS.has(key)) return;
      e.preventDefault(); hold(key, true);
    };
    const onUp = (e) => { hold(e.key.toLowerCase(), false); };
    const onBlur = () => { keySet.current.clear(); };
    const onVisibility = () => { if (document.hidden) keySet.current.clear(); };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);

    const tick = (now) => {
      const dt = Math.min((now - previous) / 1000, 0.045);
      previous = now;
      let direction = normalizedDirection(keySet.current);
      let state = 'Idle';
      const hasKeyboard = direction.x !== 0 || direction.y !== 0;
      if (hasKeyboard) {
        waypointsRef.current = [];
        state = 'Walking';
      } else if (waypointsRef.current.length) {
        let goal = waypointsRef.current[0];
        let d = distance(positionRef.current, goal);
        while (d < 4 && waypointsRef.current.length) {
          waypointsRef.current.shift();
          goal = waypointsRef.current[0];
          if (goal) d = distance(positionRef.current, goal);
        }
        if (goal) { direction = { x: (goal.x - positionRef.current.x) / d, y: (goal.y - positionRef.current.y) / d }; state = 'Navigating'; }
      }
      if (state !== 'Idle') {
        const start = positionRef.current;
        let step = MOVE_SPEED * dt;
        if (state === 'Navigating' && waypointsRef.current[0]) step = Math.min(step, distance(start, waypointsRef.current[0]));
        const desired = { x: start.x + direction.x * step, y: start.y + direction.y * step };
        const next = moveWithCollisions(start, desired);
        const travelled = distance(start, next);
        if (travelled > 0.0001) {
          positionRef.current = next;
          pendingDistance += travelled;
          if (now - lastTrail > 75) {
            trailRef.current.push({ ...next, at: now });
            if (trailRef.current.length > 22) trailRef.current.shift();
            lastTrail = now;
          }
          if (now - lastBroadcast > 80) { broadcasts.current?.(next); lastBroadcast = now; }
        } else if (state === 'Navigating') {
          // A path should be traversable, but cancel instead of endlessly jittering on a corner.
          waypointsRef.current = [];
        }
      }
      if (now - lastPaint > 38) {
        setPosition({ ...positionRef.current });
        if (mode !== state) { mode = state; setMovement(state); }
        if (pendingDistance) { const travelled = pendingDistance; pendingDistance = 0; setMetersTravelled((v) => v + travelled); }
        lastPaint = now;
      }
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [hold]);

  return { position, positionRef, movement, metersTravelled, waypointsRef, trailRef, moveTo, cancelPath, reset, hold };
}
