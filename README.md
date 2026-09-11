# NycTouch

A simple browser game for practicing touch rugby backline plays. Click Start,
get a random play, drag your six offensive players and pass the ball to run
the play correctly — attacking the right defender on the right shoulder —
then click Done for a checklist of exactly what you got right and wrong.

## Running locally

No build step. Serve the folder with any static file server (ES modules need
`http://`, not `file://`):

```
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Plays (v1)

Splitter, Rooster, Sweeper, Hot Dog, ML — variants (QB/Ninja/X calls, Phase
reads) are planned for a later pass.

## Structure

- `js/constants.js` — field dimensions, roles, defense drift config, grading thresholds
- `js/geometry.js` — path interpolation, shoulder-crossing detection, heading math
- `js/defense-script.js` — deterministic defender shift based on ball position
- `js/plays-data.js` — the 5 plays, each as data: positions, pass events, checklist
- `js/checklist-engine.js` — the grading predicates + `evaluatePlay`
- `js/field.js` — SVG rendering and drag/pass interaction
- `js/app.js` — start/done state machine wiring it all together
