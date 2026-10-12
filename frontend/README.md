# ProxiSpeak — Day 01 / Signaling & Movement

**Developer:** Bharath — Frontend Developer  
**Team lead:** Jinithasri — Team Lead & Audio  
**Teammates:** Jeevith (Backend), Rithesh (Proximity Logic)  
**Organization:** Infotact Solutions Internship  
**Scope:** Week 1 · Day 1 frontend only. This is a functional prototype, **not** a completed real-time voice app.

## Start on Windows / VS Code

```powershell
# Open this frontend folder in VS Code first, then:
node -v
npm.cmd -v
npm.cmd install
npm.cmd run dev
```

Open the printed `http://localhost:5173/` URL. If 5173 is taken, Vite may print another port.

**PowerShell tip:** `npm.cmd` avoids the common `npm.ps1` execution-policy error. No security setting changes are necessary.

## Verify before submission

```powershell
npm.cmd test
npm.cmd run build
```

See `docs/DAY1_SUBMISSION.md` for a live demo script, exact deliverables and GitHub commands.

## Day 1 features

- Distinct visual workspace with three themed zones and correct labeled team roster.
- True Canvas avatar rendered using the **same X/Y reference** as the visible HUD; changes in numbers visibly move Bharath's avatar.
- WASD and arrow movement, touchscreen D-pad, normalized diagonals and frame-time independent speed.
- Real desk collision rules + world boundaries; click-to-walk uses A* pathfinding around furniture.
- Local walking trail, reachable teammates highlighted inside a fixed virtual unit radius.
- HiDPI/responsive canvas, keyboard shortcuts guide, accessible controls and reduced-motion handling.
- Realistic **local demo** status and explicit Socket.IO client adapter with a documented event contract.
- Automated tests for geometry, proximity, blocked furniture, pathfinding, and defensive socket packet parsing.

## What is intentionally not implemented

- Real WebRTC voice, microphone capture, MongoDB persistence, user authentication, or a production backend.
- The avatars for Jinithasri, Jeevith, and Rithesh are **simulated** unless a compatible Socket.IO server is connected. Offline avatars do not represent connected users.
- A frontend `Connect` button does not mean real-time multiplayer works until the backend implements the documented events.

## Structure

```
frontend/
├── src/
│   ├── components/SpaceCanvas.jsx    # cached HiDPI Canvas renderer, same ref as HUD
│   ├── hooks/useMovement.js          # keyboard + click A* movement loop
│   ├── lib/world.js                  # world, team, furniture, zones
│   ├── lib/movement.js               # collision/distance/pathfinding
│   ├── lib/*.test.js                 # node built-in test runner
│   ├── services/signaling.js         # Socket.IO adapter + packet validation
│   ├── App.jsx                       # page components + application UI
│   └── styles.css
├── docs/
│   ├── DAY1_SUBMISSION.md
│   └── SOCKET_CONTRACT.md
├── .env.example
└── package.json
```

## Collaboration

Push only to **Bharath's assigned Git branch**, then submit/present according to Infotact's instructions. The already-linked branch normally does not need to be reconnected to the dashboard after each push. Avoid committing `.env`, `node_modules`, or build artifacts.
