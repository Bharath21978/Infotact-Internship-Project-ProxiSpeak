/** All coordinates are virtual Canvas world units, not geographic metres. */
export const WORLD = Object.freeze({ width: 1200, height: 720 });
export const PLAYER_RADIUS = 18;
export const PROXIMITY_RADIUS = 168;
export const MOVE_SPEED = 235; // world units / second
export const SPAWN = Object.freeze({ x: 286, y: 365 });

export const SPACES = Object.freeze([
  { id: 'studio', label: 'Collaboration Hub', short: 'Studio', x: 42, y: 44, w: 734, h: 629, color: '#79ebd6', spawn: { x: 286, y: 365 } },
  { id: 'ideation', label: 'Ideation Lab', short: 'Ideation', x: 799, y: 44, w: 356, h: 286, color: '#b9a7ff', spawn: { x: 866, y: 270 } },
  { id: 'lounge', label: 'Focus Lounge', short: 'Lounge', x: 799, y: 353, w: 356, h: 320, color: '#f5b985', spawn: { x: 865, y: 558 } },
]);

/** Solid objects. Every render and movement collision reads this same model. */
export const FURNITURE = Object.freeze([
  { id: 'desk-nw', type: 'desk', x: 122, y: 177, w: 159, h: 77 },
  { id: 'desk-ne', type: 'desk', x: 420, y: 177, w: 159, h: 77 },
  { id: 'desk-sw', type: 'desk', x: 122, y: 468, w: 159, h: 77 },
  { id: 'desk-se', type: 'desk', x: 420, y: 468, w: 159, h: 77 },
  { id: 'table', type: 'table', x: 357, y: 330, w: 174, h: 78 },
  { id: 'ideation-table', type: 'table', x: 930, y: 208, w: 128, h: 60 },
  { id: 'sofa', type: 'sofa', x: 911, y: 460, w: 191, h: 65 },
  { id: 'coffee', type: 'table', x: 952, y: 565, w: 103, h: 49 },
]);

export const MY_PLAYER = Object.freeze({ id: 'bharath-local', name: 'Bharath', role: 'Frontend Developer', initials: 'BH', color: '#81eeda', x: SPAWN.x, y: SPAWN.y });
export const TEAM = Object.freeze([
  { id: 'lead-demo', name: 'Jinithasri', role: 'Team Lead · Audio', initials: 'JS', color: '#b8a3ff', x: 1080, y: 132 },
  { id: 'jeevith-demo', name: 'Jeevith', role: 'Backend Developer', initials: 'JE', color: '#8eaaff', x: 608, y: 350 },
  { id: 'rithesh-demo', name: 'Rithesh', role: 'Proximity Logic', initials: 'RI', color: '#f4bb8b', x: 605, y: 585 },
]);

export function simulatedTeam(timeSeconds) {
  return TEAM.map((person, index) => ({
    ...person,
    x: person.x + Math.sin(timeSeconds * 0.56 + index * 2.5) * 8,
    y: person.y + Math.cos(timeSeconds * 0.48 + index * 2.2) * 7,
  }));
}
