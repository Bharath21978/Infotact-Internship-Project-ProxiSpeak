/** Human-readable WebRTC voice state; backend presence alone does not mean audio is connected. */
export function getVoiceStatus({ backendOnline = false, micStatus = 'off', eligiblePeers = 0, peerStates = {} } = {}) {
  if (!backendOnline) return { phase: 'offline', label: 'Backend offline' };
  if (micStatus === 'requesting') return { phase: 'connecting', label: 'Requesting microphone' };
  if (micStatus === 'error') return { phase: 'error', label: 'Microphone unavailable' };
  if (micStatus === 'off') return { phase: 'offline', label: 'Enable microphone for voice' };

  const states = Object.values(peerStates || {});
  const connected = states.filter(state => state === 'connected').length;
  if (micStatus === 'muted') {
    return { phase: 'muted', label: connected ? `Muted · listening to ${connected} ${connected === 1 ? 'peer' : 'peers'}` : 'Muted · not transmitting' };
  }
  if (connected > 0) return { phase: 'connected', label: `Voice connected · ${connected} ${connected === 1 ? 'peer' : 'peers'}` };
  if (states.includes('failed')) return { phase: 'error', label: 'Voice connection failed' };
  if (states.some(state => ['new', 'connecting', 'checking', 'disconnected'].includes(state))) {
    return { phase: 'connecting', label: 'Connecting to voice peers…' };
  }
  if (eligiblePeers > 0) return { phase: 'waiting', label: 'Waiting for peer microphone' };
  return { phase: 'waiting', label: 'No eligible voice peers nearby' };
}
