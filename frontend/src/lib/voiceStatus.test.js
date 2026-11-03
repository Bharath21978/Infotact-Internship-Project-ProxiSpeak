import test from 'node:test';
import assert from 'node:assert/strict';
import { getVoiceStatus } from './voiceStatus.js';

test('voice status distinguishes backend offline from active WebRTC', () => {
  assert.equal(getVoiceStatus({ micStatus: 'ready', peerStates: { abc: 'connected' } }).phase, 'offline');
});

test('voice status waits for mic before claiming voice readiness', () => {
  assert.equal(getVoiceStatus({ backendOnline: true, micStatus: 'off', eligiblePeers: 1 }).phase, 'offline');
});

test('voice status reports negotiating peer', () => {
  assert.equal(getVoiceStatus({ backendOnline: true, micStatus: 'ready', peerStates: { abc: 'connecting' } }).phase, 'connecting');
});

test('voice status reports established connection and count', () => {
  const status = getVoiceStatus({ backendOnline: true, micStatus: 'ready', peerStates: { a: 'connected', b: 'connected' } });
  assert.equal(status.phase, 'connected');
  assert.match(status.label, /2 peers/);
});

test('voice status does not call muted audio an active microphone transmission', () => {
  const status = getVoiceStatus({ backendOnline: true, micStatus: 'muted', peerStates: { a: 'connected' } });
  assert.equal(status.phase, 'muted');
  assert.match(status.label, /Muted/);
});

test('voice status waits for eligible peer to enable microphone', () => {
  assert.equal(getVoiceStatus({ backendOnline: true, micStatus: 'ready', eligiblePeers: 1 }).phase, 'waiting');
});

test('voice status reports peer failure', () => {
  assert.equal(getVoiceStatus({ backendOnline: true, micStatus: 'ready', peerStates: { a: 'failed' } }).phase, 'error');
});
