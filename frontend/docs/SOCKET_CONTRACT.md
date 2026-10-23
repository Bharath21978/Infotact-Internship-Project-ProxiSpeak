# Day 01 Socket.IO integration contract (proposal to Jeevith)

The frontend does not start its own backend. Jeevith's server needs to use this agreed event contract. The exact names below are frontend assumptions; confirm with the team before integration.

Default URL: `http://localhost:4000`. Edit `VITE_SOCKET_URL` in a local `.env` file (never commit secrets).

## Emit from client

`player:join`
```json
{"roomId":"main","player":{"id":"bharath-unique","name":"Bharath","role":"Frontend Developer","initials":"BH","color":"#81eeda","x":286,"y":365}}
```

`player:move` (sent at most about 12.5 times/second while moving)
```json
{"roomId":"main","id":"bharath-unique","x":320,"y":392}
```

`player:leave` (optional): frontend emits this event with no payload when the user manually disconnects. Jeevith's backend listens for it, and also removes the player automatically on Socket.IO `disconnect`. A browser tab closing may rely on the latter.

## Receive from server

`players:update`: full array of other currently connected players. Example:
```json
[
  {"id":"jeevith-1","name":"Jeevith","role":"Backend Developer","x":608,"y":350,"color":"#8eaaff"}
]
```

Current backend does **not** emit `player:left`. It emits a refreshed `players:update` after `player:leave` and Socket.IO disconnect, removing the departed player from the array. The frontend optionally supports `player:left` as a legacy notification if another server implementation provides it.

## Security / correctness agreement

- Server owns authoritative socket ID and membership. It must never trust a client-supplied player ID as an authenticated user identity.
- Server must validate finite X/Y values within `[0,1200] × [0,720]`, rate limit, and check room membership before broadcasting.
- Server should broadcast the canonical list per room; never send location events to unrelated rooms.
- For production: authentication, CORS allowlists, TLS, and authoritative movement validation are needed.
- Distances here are **virtual Euclidean Canvas units**, not geographic metres. MongoDB geospatial indexes are a later backend decision; they are not used for this Day 01 local movement preview.
- Backend should send `players:update` on join/move/disconnect so the frontend reflects real players. Demo actors are removed immediately when frontend connects.
