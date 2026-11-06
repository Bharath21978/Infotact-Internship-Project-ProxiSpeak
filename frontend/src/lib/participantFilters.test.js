import test from 'node:test';
import assert from 'node:assert/strict';
import { filterParticipantsByRoom } from './participantFilters.js';

const members = [
  { id: 's', name: 'Jeevith', x: 500, y: 300 },
  { id: 'i', name: 'Jinithasri', x: 900, y: 160 },
  { id: 'l', name: 'Rithesh', x: 900, y: 540 },
  { id: 'bad', name: 'Ghost', x: NaN, y: 350 },
];
const ids = (people) => people.map((person) => person.id);

test('shows everyone when the room filter is disabled', () => {
  assert.deepEqual(ids(filterParticipantsByRoom(members, {x: 286, y: 365})), ['s', 'i', 'l', 'bad']);
});

test('filters participants to the current studio', () => {
  assert.deepEqual(ids(filterParticipantsByRoom(members, {x: 286, y: 365}, '', true)), ['s']);
});

test('follows the local avatar as it moves between rooms', () => {
  assert.deepEqual(ids(filterParticipantsByRoom(members, {x: 866, y: 270}, '', true)), ['i']);
  assert.deepEqual(ids(filterParticipantsByRoom(members, {x: 865, y: 558}, '', true)), ['l']);
});

test('search and same-room filtering work together regardless of case', () => {
  assert.deepEqual(ids(filterParticipantsByRoom(members, {x: 866, y: 270}, '  JINI ', true)), ['i']);
  assert.deepEqual(ids(filterParticipantsByRoom(members, {x: 866, y: 270}, 'rith', true)), []);
});

test('when avatar is outside all rooms, same-room view stays empty', () => {
  assert.deepEqual(filterParticipantsByRoom(members, {x: 790, y: 345}, '', true), []);
});

test('handles invalid inputs without crashing', () => {
  assert.deepEqual(filterParticipantsByRoom(null, null, '', true), []);
  assert.deepEqual(filterParticipantsByRoom([null, {name: null}], null), []);
  assert.deepEqual(filterParticipantsByRoom(members, null, 'rith'), [members[2]]);
});
