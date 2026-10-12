# ProxiSpeak — Bharath / Day 01 submission & demonstration

## Scope from assignment

1. React frontend setup.
2. Initial HTML5 Canvas component.
3. Display avatar and implement keyboard movement.
4. Prepare to receive coordinate updates from the backend.

## Extra Day 01 quality (not future sprint claims)

- Responsive, visually designed spatial workspace; actual moving player drawn in Canvas.
- Furniture collision bounds, diagonal normalization, key release/blur handling.
- A* routing on click, simple mobile controls, walking trails and local proximity preview.
- Basic test suite and well-defined Socket.IO event adapter.
- Honest demo/live label; real teammates are not incorrectly represented as online.

## Quick demo script (2–3 minutes)

1. Start with `npm.cmd run dev` and show the header saying **LOCAL DEMO**.
2. Point to "BHARATH · YOU". Hold **D** then **S**; avatar visibly moves. X/Y change in the status bar.
3. Try walking into a desk; the avatar **does not pass through furniture**.
4. Click across the team table; avatar follows a dotted A* route around obstacles.
5. Approach a teammate; proximity ring and nearby member indicator update.
6. Use **Range**, **Trail**, **Reset**, and the **Team directory**. Show Jinithasri as Team Lead.
7. Open **Day 01 report**; distinguish implemented frontend features from pending backend/WebRTC work.
8. Run `npm.cmd test` and `npm.cmd run build`; show successful terminal output.

## Checklist before pushing

- [ ] Browser opens, with no red errors in developer console.
- [ ] Avatar **visibly** walks when holding WASD and arrows.
- [ ] Furniture blocks movement; clicking around table produces a path.
- [ ] Proximity changes as Bharath moves near others.
- [ ] Mobile D-pad works if tested with narrow viewport.
- [ ] Jinithasri (Team Lead) is shown and spelled exactly.
- [ ] `npm.cmd test` passes; `npm.cmd run build` completes.
- [ ] Push is to Bharath's already-connected branch, not teammates' branches.
- [ ] Infotact dashboard reflects submission/commit according to their rules.

## Git commands (inside shared repository)

**Do not create a second repository.** Extract the `frontend` folder into the **existing cloned repository root** while working on **your own branch**. Do not replace teammates' folders.

```powershell
git status
git branch --show-current
# Confirm branch is YOUR assigned branch before proceeding.
git add frontend
git commit -m "feat(frontend): build Day 1 spatial movement workspace"
git push origin <your-existing-branch-name>
```

Replace `<your-existing-branch-name>` with the branch displayed by `git branch --show-current`. If Git says "not a git repository", first open the actual cloned repository folder; the extracted ZIP alone is not a Git checkout.

### Limitations to disclose

Backend signaling is event-ready, not fully integrated. Voice calls, persistent locations, MongoDB geospatial indexing and login are NOT Day 01 frontend functionality. This is not a "full ProxiSpeak app" claim.
