import { useCallback, useEffect, useRef, useState } from 'react';
import { Headphones, Mic, MicOff, Radio, Shield, VolumeX, Wifi, WifiOff } from 'lucide-react';
import { getAudioZonePreview } from '../lib/audioZones.js';
import './audio-controls.css';

/**
 * Local microphone preparation controls. This component deliberately has NO
 * Socket.IO or RTCPeerConnection side effects. It does not transmit audio.
 * The team lead can later attach the agreed room-aware audio engine.
 */
export default function AudioControlPanel({ position, people, connection }) {
  const [micStatus, setMicStatus] = useState('off'); // off | requesting | ready | muted | error
  const [permission, setPermission] = useState('Not requested');
  const [error, setError] = useState('');
  const trackRef = useRef(null);
  const streamRef = useRef(null);
  const mountedRef = useRef(true);
  const requestId = useRef(0);
  const zone = getAudioZonePreview(position, people);
  const backendOnline = connection === 'online';

  const release = useCallback(() => {
    requestId.current += 1; // invalidate in-flight getUserMedia responses
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    trackRef.current = null;
    if (mountedRef.current) setMicStatus('off');
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestId.current += 1;
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      trackRef.current = null;
    };
  }, []);

  const enableMicrophone = async () => {
    if (micStatus === 'requesting' || streamRef.current) return;
    setError('');
    if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
      setError('Microphone requires HTTPS or localhost and a compatible browser.');
      setMicStatus('error');
      return;
    }
    const id = ++requestId.current;
    setMicStatus('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      if (!mountedRef.current || id !== requestId.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      const track = stream.getAudioTracks()[0];
      if (!track) {
        stream.getTracks().forEach(t => t.stop());
        throw new Error('No audio input track available.');
      }
      track.enabled = true;
      track.onended = () => {
        if (trackRef.current !== track) return;
        streamRef.current = null;
        trackRef.current = null;
        if (mountedRef.current) {
          setMicStatus('off');
          setPermission('Microphone stopped');
        }
      };
      streamRef.current = stream;
      trackRef.current = track;
      setPermission('Allowed');
      setMicStatus('ready');
    } catch (err) {
      if (!mountedRef.current || id !== requestId.current) return;
      const rejected = err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError';
      setPermission(rejected ? 'Denied' : 'Unavailable');
      setError(rejected ? 'Permission denied. Enable microphone access in browser settings to retry.' : (err?.message || 'Could not access microphone.'));
      setMicStatus('error');
    }
  };

  const toggleMute = () => {
    if (!trackRef.current || !streamRef.current) return;
    const nextEnabled = !trackRef.current.enabled;
    trackRef.current.enabled = nextEnabled;
    setMicStatus(nextEnabled ? 'ready' : 'muted');
  };

  const active = micStatus === 'ready' || micStatus === 'muted';
  const micLabel = micStatus === 'ready' ? 'Mic active locally' : micStatus === 'muted' ? 'Muted' : micStatus === 'requesting' ? 'Requesting permission' : 'Mic off';

  return <section className="audio-ui-panel" aria-label="Audio readiness controls">
    <div className="audio-ui-heading">
      <div className="audio-ui-title"><span className="audio-ui-title-icon"><Headphones size={20}/></span><div><strong>Audio readiness</strong><small>Microphone & room preview · not a voice call</small></div></div>
      <span className="audio-ui-coming"><VolumeX size={13}/> Voice engine pending</span>
    </div>

    <div className="audio-ui-grid">
      <div className="audio-ui-cell"><small>YOUR ROOM</small><strong>{zone.roomLabel}</strong><span>{zone.roomId ? `Room ID: ${zone.roomId}` : 'No audio room assigned'}</span></div>
      <div className="audio-ui-cell"><small>NEARBY IN SAME ROOM</small><strong>{zone.nearbyPeers.length} {zone.nearbyPeers.length === 1 ? 'player' : 'players'}</strong><span>Within {zone.radius} world units · {backendOnline ? 'live positions' : 'demo positions'}</span></div>
      <div className="audio-ui-cell"><small>BACKEND SIGNALING</small><strong className={backendOnline ? 'audio-ui-online' : ''}>{backendOnline ? 'Backend live' : 'Local demo'}</strong><span>{backendOnline ? <><Wifi size={12}/> Movement socket connected</> : <><WifiOff size={12}/> Audio still not connected</>}</span></div>
      <div className="audio-ui-cell"><small>MICROPHONE</small><strong>{micLabel}</strong><span><Shield size={12}/> Permission: {permission}</span></div>
    </div>

    <div className="audio-ui-actions">
      {!active ? <button type="button" onClick={enableMicrophone} disabled={micStatus === 'requesting'} className="audio-ui-primary"><Mic size={16}/>{micStatus === 'requesting' ? 'Requesting…' : 'Enable microphone'}</button> : <>
        <button type="button" onClick={toggleMute} aria-pressed={micStatus === 'muted'} className="audio-ui-primary">{micStatus === 'muted' ? <MicOff size={16}/> : <Mic size={16}/>} {micStatus === 'muted' ? 'Unmute' : 'Mute'}</button>
        <button type="button" onClick={release} className="audio-ui-secondary">Stop microphone</button>
      </>}
      <p className="audio-ui-disclaimer"><Radio size={13}/> Microphone stays on this device. No audio is sent until WebRTC integration is implemented.</p>
    </div>
    {error && <p className="audio-ui-error" role="alert">{error}</p>}
  </section>;
}
