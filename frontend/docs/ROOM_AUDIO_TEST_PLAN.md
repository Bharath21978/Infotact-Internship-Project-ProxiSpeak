# ProxiSpeak — Room Audio Integration Test Plan

## Purpose

Verify that WebRTC voice communication follows the team's finalized room audio policies without breaking existing Socket.IO avatar synchronization.

## 1. Studio — Collaboration Hub

* Participants within 168 world units can hear each other.
* Audio volume decreases as distance increases.
* Participants beyond 168 units cannot hear each other.
* Participants in other rooms cannot hear Studio conversations.

## 2. Ideation Lab

* All participants inside the room can communicate regardless of distance.
* Participants outside the room cannot hear the conversation.

## 3. Focus Lounge

* All participants inside the room can communicate regardless of distance.
* Participants outside the room cannot hear the conversation.

## 4. Room Transitions

* Audio eligibility updates when participants enter or leave rooms.
* Previous room audio must stop after leaving.
* New room audio follows the destination room's policy.

## 5. Microphone and Mute

* Microphone permission and connection errors are handled.
* Muted participants cannot transmit audible microphone audio.
* Unmuting restores communication when the connection is active.

## 6. Regression Testing

* Avatar movement remains synchronized across browser sessions.
* Existing Socket.IO connections remain functional.
* Room mapping and proximity calculations remain correct.
* Frontend production build and automated tests pass.

## Current Status

Frontend room eligibility preview and automated tests are implemented.

Actual WebRTC communication, distance-based volume attenuation, mute enforcement, and end-to-end room transitions require integration testing.

## Integration Coordination

Frontend: Bharath
Audio integration: Jinithasri
Backend: Jeevith
Proximity logic and testing: Rithesh
