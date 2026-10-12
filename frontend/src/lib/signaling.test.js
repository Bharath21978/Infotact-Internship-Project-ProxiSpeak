import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePlayers, EVENTS } from './socketProtocol.js';

test('socket event names are explicit and stable', () => {
  assert.equal(EVENTS.join,'player:join');
  assert.equal(EVENTS.move,'player:move');
  assert.equal(EVENTS.update,'players:update');
});
test('invalid coordinates and self are excluded', () => {
  const players=parsePlayers([
    {id:'me',name:'Self',x:10,y:20},
    {id:'joe',name:'Joe',x:42,y:50,color:'#abcdef'},
    {id:'bad',x:Infinity,y:2},
    {id:'outside',x:5000,y:2},
    {id:'joe',name:'Duplicate',x:42,y:50},
  ],'me');
  assert.equal(players.length,1);
  assert.equal(players[0].name,'Joe');
  assert.equal(players[0].color,'#abcdef');
});
test('malformed packets and labels are safely handled',()=>{
  assert.deepEqual(parsePlayers({},'me'),[]);
  assert.deepEqual(parsePlayers(null,'me'),[]);
  const p=parsePlayers([{id:'x',x:2,y:2,name:'A'.repeat(100),color:'javascript:red'}],'me')[0];
  assert.equal(p.name.length,30);
  assert.equal(p.color,'#8eaaff');
});
