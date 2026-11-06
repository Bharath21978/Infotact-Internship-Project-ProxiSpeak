import { getRoomIdAtPosition } from './world.js';

/** Filters the remote-player roster using the same room boundaries as the workspace. */
export function filterParticipantsByRoom(people, position, search = '', sameRoomOnly = false) {
  if (!Array.isArray(people)) return [];
  const query = String(search ?? '').trim().toLocaleLowerCase();
  const ownRoom = getRoomIdAtPosition(position?.x, position?.y);

  return people.filter((person) => {
    if (!person || typeof person.name !== 'string') return false;
    if (!person.name.toLocaleLowerCase().includes(query)) return false;
    if (!sameRoomOnly) return true;
    return Boolean(ownRoom) && getRoomIdAtPosition(person.x, person.y) === ownRoom;
  });
}
