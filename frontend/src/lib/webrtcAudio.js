import { canConnectAudio, getAudioVolume } from './audioZones.js';

const SIGNALING_ROOM = 'main';
const ICE_SERVERS = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

/**
 * WebRTC audio for users who are inside an eligible spatial audio zone.
 * Both clients should enable the microphone to transmit/receive audio.
 * Call syncPeers whenever participants or the local position change.
 */
export function createWebRTCAudio({
  socket, localStream, getLocalPosition, getParticipants,
  onRemoteStream, onRemoteStreamRemoved, onRemoteVolume, onError = console.error,
}) {
  const peers = new Map();
  const pendingCandidates = new Map();
  const inProgress = new Set();
  let closed = false;

  const participant = id => getParticipants()?.find(p => p.socketId === id);
  const eligible = id => !closed && !!socket?.connected && !!participant(id) &&
    canConnectAudio(getLocalPosition(), participant(id));
  const send = (event, to, payload) => {
    if (socket.connected) socket.emit(event, { roomId: SIGNALING_ROOM, to, ...payload });
  };

  function closePeer(id) {
    const peer = peers.get(id);
    if (peer) {
      peer.onicecandidate = null;
      peer.ontrack = null;
      peer.onconnectionstatechange = null;
      peer.close();
      peers.delete(id);
    }
    inProgress.delete(id);
    pendingCandidates.delete(id);
    onRemoteStreamRemoved?.(id);
  }

  function createPeer(id) {
    if (!eligible(id)) return null;
    if (peers.has(id)) return peers.get(id);
    const peer = new RTCPeerConnection(ICE_SERVERS);
    peers.set(id, peer);
    // Don't reset ICE candidates that arrived before the offer.
    if (!pendingCandidates.has(id)) pendingCandidates.set(id, []);

    for (const track of localStream.getAudioTracks()) peer.addTrack(track, localStream);
    peer.onicecandidate = event => {
      if (event.candidate && eligible(id)) send('rtc:ice-candidate', id, { candidate: event.candidate.toJSON() });
    };
    peer.ontrack = event => {
      if (eligible(id) && event.streams?.[0]) {
        onRemoteStream?.(id, event.streams[0]);
        onRemoteVolume?.(id, getAudioVolume(getLocalPosition(), participant(id)));
      }
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'failed') {
        onError(new Error(`WebRTC connection failed with ${id}; check network/ICE`));
        closePeer(id);
      } else if (peer.connectionState === 'closed') {
        onRemoteStreamRemoved?.(id);
      }
    };
    return peer;
  }

  async function flushCandidates(id, peer) {
    const candidates = pendingCandidates.get(id) ?? [];
    pendingCandidates.set(id, []);
    for (const candidate of candidates) {
      try { await peer.addIceCandidate(candidate); }
      catch (error) { onError(error); }
    }
  }

  async function callPeer(id) {
    if (!eligible(id) || inProgress.has(id)) return;
    // Deterministic offerer prevents simultaneous offers.
    if (socket.id.localeCompare(id) > 0) return;
    const peer = createPeer(id);
    if (!peer || peer.signalingState !== 'stable') return;
    inProgress.add(id);
    try {
      const offer = await peer.createOffer();
      if (!eligible(id)) { closePeer(id); return; }
      await peer.setLocalDescription(offer);
      send('rtc:offer', id, { description: peer.localDescription });
    } catch (error) {
      inProgress.delete(id);
      onError(error);
    }
  }

  async function handleOffer({ from, roomId, description } = {}) {
    if (roomId !== SIGNALING_ROOM || !from || !description || !eligible(from)) return;
    try {
      const peer = createPeer(from);
      if (!peer) return;
      await peer.setRemoteDescription(description);
      await flushCandidates(from, peer);
      const answer = await peer.createAnswer();
      if (!eligible(from)) { closePeer(from); return; }
      await peer.setLocalDescription(answer);
      send('rtc:answer', from, { description: peer.localDescription });
    } catch (error) { onError(error); }
  }

  async function handleAnswer({ from, roomId, description } = {}) {
    if (roomId !== SIGNALING_ROOM || !from || !description || !eligible(from)) return;
    const peer = peers.get(from);
    if (!peer || peer.signalingState !== 'have-local-offer') return;
    try {
      await peer.setRemoteDescription(description);
      await flushCandidates(from, peer);
      inProgress.delete(from);
    } catch (error) { onError(error); }
  }

  async function handleCandidate({ from, roomId, candidate } = {}) {
    if (roomId !== SIGNALING_ROOM || !from || !candidate || !eligible(from)) return;
    const peer = peers.get(from);
    if (!peer?.remoteDescription) {
      if (!pendingCandidates.has(from)) pendingCandidates.set(from, []);
      pendingCandidates.get(from).push(candidate);
      return;
    }
    try { await peer.addIceCandidate(candidate); }
    catch (error) { onError(error); }
  }

  function syncPeers() {
    if (closed || !socket?.connected) return;
    const ids = new Set();
    for (const p of getParticipants() ?? []) {
      if (!p.socketId || p.socketId === socket.id) continue;
      ids.add(p.socketId);
      if (eligible(p.socketId)) {
        onRemoteVolume?.(p.socketId, getAudioVolume(getLocalPosition(), p));
        void callPeer(p.socketId);
      } else closePeer(p.socketId);
    }
    for (const id of [...peers.keys()]) {
      if (!ids.has(id) || !eligible(id)) closePeer(id);
    }
  }

  function handleReady({ from, roomId } = {}) {
    if (roomId === SIGNALING_ROOM && from && eligible(from)) void callPeer(from);
  }

  function close() {
    if (closed) return;
    closed = true;
    socket.off('rtc:offer', handleOffer);
    socket.off('rtc:answer', handleAnswer);
    socket.off('rtc:ice-candidate', handleCandidate);
    socket.off('rtc:ready', handleReady);
    for (const id of [...peers.keys()]) closePeer(id);
  }

  socket.on('rtc:offer', handleOffer);
  socket.on('rtc:answer', handleAnswer);
  socket.on('rtc:ice-candidate', handleCandidate);
  socket.on('rtc:ready', handleReady);

  return {
    syncPeers, close,
    announceReady() { if (socket.connected) socket.emit('rtc:ready', { roomId: SIGNALING_ROOM }); },
    getPeerIds: () => [...peers.keys()],
  };
}
