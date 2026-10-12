import { io } from 'socket.io-client';
export { EVENTS, parsePlayers } from '../lib/socketProtocol.js';

/** Client adapter for Jeevith's backend, not an embedded server. */
export function createSignalClient() {
  const endpoint = import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000';
  return io(endpoint, { autoConnect: false, reconnection: false, timeout: 2600, transports: ['websocket', 'polling'] });
}
