# ProxiSpeak Cross-Device WebRTC Test Plan

## Objective
Verify real-time voice communication between two physical devices.

## Prerequisites
- Frontend accessible securely via HTTPS.
- Backend reachable from both devices.
- Microphone permissions enabled.
- Both participants connected to the same workspace.

## Test Cases
1. Verify microphone audio between two devices.
2. Verify Studio proximity-based communication.
3. Verify audio stops when participants exceed the allowed range.
4. Verify participants in different rooms cannot hear each other.
5. Verify mute and unmute functionality.
6. Verify audio reconnects after a temporary network interruption.

## Expected Outcome
Audio must follow room eligibility, proximity, and mute rules.

## Status
Pending cross-device verification.
