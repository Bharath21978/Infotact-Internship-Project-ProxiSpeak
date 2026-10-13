# ProxiSpeak — Cinematic Office Visuals (V8)

**Frontend from Bharath's original Day 01 Elite project, with dashboard and team data retained.**

## What changed
- The **workspace-only visual mode** now displays the supplied cinematic office artwork, cropped to the office area (the source image's left/right UI is excluded).
- The **existing sidebar, team directory, Day 01 report, status panel, GitHub signaling integration prep, and four original team member names** come from the original React application.
- The **Cinematic** toggle in the workspace toolbar switches between this architectural **photo-backed visual mode** and the previous **fully interactive 2D movement map**.
- The picture is not 3D, and furniture/avatars baked into it do not move. **Real keyboard movement, collision detection, pathfinding, and proximity radius visualization remain functional in Movement map mode.**
- Room hover/click hotspots let you select the Studio, Ideation Lab, and Focus Lounge in the cinematic view; switch to Map to see navigation.
- This site does not claim live presence or voice calling. Online sync still requires Jeevith's backend.

## Windows / VS Code
Open the `frontend` folder in VS Code, then run:

```powershell
npm.cmd install
npm.cmd test
npm.cmd run build
npm.cmd run dev
```

Use the link Vite prints to view the site. Press **Cinematic / Movement map** to toggle workspace modes.

## Updating GitHub / Netlify
1. Run and verify this copy locally **before** replacing your current GitHub `frontend` folder.
2. Back up the current committed version.
3. Copy only the verified new `frontend` into your existing local clone of `Infotact-Internship-Project-ProxiSpeak`.
4. Run `npm.cmd test` and `npm.cmd run build` within that cloned `frontend`, then `git add frontend`, `git commit -m "Improve workspace cinematic visuals with original dashboard"`, `git push origin main` from repository root.
5. Redeploy the resulting `frontend/dist` folder to the **existing** Netlify project (do not create a new site), if desired.
6. Infotact Project Progress should keep tracking your existing linked `main` branch; check after refreshing.

## Source details / honesty
The reference image was uploaded by the user and is embedded as a static scene artwork at `public/images/cinematic-office.webp`. The central scene artwork includes illustrated people; the **room badges are DOM overlays with counts computed from the original team model**. The text inside illustrated avatar labels in the source artwork remains static. Actual application names and roster come from `src/lib/world.js`. If you need the scene artwork to have no baked-in avatars/text, a newly rendered/cleaned background asset would be required.
