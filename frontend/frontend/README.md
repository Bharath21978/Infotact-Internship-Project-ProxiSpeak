# ProxiSpeak — Day 2 Expanded 3D Office

A source-code update to Bharath's existing Infotact ProxiSpeak React frontend. **The office opens in a real Three.js 3D scene by default**. The original dashboard navigation, names, team directory, movement map, avatar movement model, proximity calculations, and Day 01 report remain available.

## Changes in this version

- **3D first paint:** no static reference photograph and no cinematic-background mode. Three.js generates architecture and furniture using genuine geometry.
- **Much larger workspace display:** the office takes the full dashboard content width and is 600–940px tall on desktops. The team directory is below the workspace instead of constraining its width.
- **Room-focused view:** Entire office, Studio, Ideation Lab, and Focus Lounge buttons smoothly refocus and zoom the camera without reinitializing the scene.
- **Camera:** drag to orbit; scroll or +/- buttons to zoom; fullscreen available. Roof transparency toggle.
- **Avatars:** WASD/arrow movement, demo teammate positions, moving proximity halo, trail, click-to-move with existing A* / collision logic.
- **Fallback:** if WebGL initialization fails, an interactive fallback Canvas renders and a warning appears.
- **No backend or voice claims:** users are simulated when the Socket.IO server is not connected; audio requires a later team integration.

## Local run (Windows, PowerShell)

1. Extract ZIP and open the **frontend** folder in VS Code.
2. In the VS Code terminal:

```powershell
npm.cmd install
npm.cmd test
npm.cmd run build
npm.cmd run dev
```

3. Open the **Local:** URL printed by Vite (normally `http://localhost:5173`). Do not assume the `192.168.x.x` address is accessible outside your local network.
4. Test Entire office, Studio, Ideation Lab and Focus Lounge, the camera drag, WASD, Radius toggle, roof toggle and 2D map fallback.

## Keeping Git history

**Do not delete/recreate the repository or force-push.** Copy the contents of this `frontend` folder over the `frontend` folder in the existing clone (keep `.git` at the repository root), validate locally, and create an ordinary Day 2 commit:

```powershell
git add frontend
git commit -m "Day 2: Expand interactive 3D office and room-focused navigation"
git push origin main
```

The pushed files become the GitHub source for the existing Infotact Project Progress connection. **Netlify does not update automatically** when the original site was deployed using Netlify Drop: run `npm.cmd run build` and redeploy the new `frontend/dist` into the same Netlify project. Verify the live URL manually. Do not claim the Infotact dashboard or Netlify site changed until that action is done.

## Testing boundaries

The included Node unit tests cover movement, collision/pathfinding, and signaling protocol. They do not prove the browser's WebGL rendering works. Browser testing is required before submission. `npm.cmd install` must obtain Three.js from npm because this project intentionally does not vendor library bundles.
