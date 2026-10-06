# Rain effect sources

## Heartfelt

Heartfelt by Martijn Steinrucken (BigWings), 2017.
Source: https://www.shadertoy.com/view/ltffzl

The original shader declares Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported (CC BY-NC-SA 3.0): https://creativecommons.org/licenses/by-nc-sa/3.0/

The source snapshot is `references/heartfelt-original.frag`. The adapted rain functions in `src/shaders/heartfelt.glsl`, the stateful adaptation in `src/heartfelt-field.js`, and their integration in `src/shaders/water.frag` are distributed under the same CC BY-NC-SA 3.0 terms. This includes attribution, noncommercial use and sharing adaptations under the same license. A separate permission from the author is needed for commercial use outside those terms.

Changes: a defined descending smoothstep, app-driven clocks for pause/reset/reduced motion, wind drift, audio-controlled rainfall and phase, and WebGL 1 sharp/blurred texture compositing. Static cell seeds are shared with CPU collisions. Original Saw-driven trajectories supply spawn positions and lateral movement for stateful CPU drops; release speed follows scaled radius-squared mass times 9.81, then the shared Codrops-derived friction can arrest movement. Moving heads are rendered from their shared height map and leave their programmed lateral path when merging. Adhered heads do not follow their moving source coordinates or display a moving tail. The original heart story, lightning, postprocessing, background media and audio are excluded. N13 credits Dave Hoskins in the original source.

## Codrops RainEffect

Rain & Water Effect Experiments by Lucas Bebber / Codrops.
Demo: https://tympanus.net/Development/RainEffect/
Source: https://github.com/codrops/RainEffect
License referenced by the original package: https://tympanus.net/codrops/licensing/

Source snapshots: `references/codrops-raindrops.js`, `references/codrops-water.frag`, `references/codrops-index.js`. The original `drop-alpha.png` and `drop-color.png` assets are used.

Changes: ES modules, seconds-based fixed timestep, bounded population/radius, scaled drop sizes, cached normal rotations, wind/audio integration, the app's video background and mist controls. Size-based release probability, spreading recovery, trail births, 80% area merge, RGBA sprite composition, soft 96-pixel foreground and refraction formulas derive from the original. Mass is radius squared times a tunable scale (default 0.10); release speed is mass times 9.81. The original dry-friction curve uses 0.07 strength for the reduced size/mass, followed by an app-authored settling phase and a visible adhesion hold. Repeated fine contacts cannot perpetually reset settling or immediately break adhesion; merging and substantial new mass can restart runoff. App-authored one-dimensional gradient noise adds smooth lateral variation to moving paths. A tunable 0–4 noise multiplier also controls Heartfelt's lateral wiggle, independently of mass and adhesion.

## Layer interaction

Codrops and moving Heartfelt drops share a spatial collision grid. Both absorb the static microtexture, including Heartfelt's shader-rendered beads. Consumed shader beads are removed from their rendering seed mask until a new condensation cycle. Microbeads can coalesce and release into moving droplets; absorption adds 80% of the smaller areas and recalculates the mass-based fall speed. Both moving renderers use an app-authored, speed-driven deformation spring with merge pulses, a leading-head/trailing-neck warp and delayed relaxation at rest. Codrops normals and Heartfelt height-map alpha follow the shared outline and orientation. This is a stateful adaptation of both original algorithms rather than a pixel-identical copy of either entire demo.
