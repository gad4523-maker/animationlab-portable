# HD-2D pixel cinema

Use this **selectable art direction** for cinematic pixel-anime What-If stories, especially psychological thrillers. Keep other styles available when the brief calls for them. Reference: the supplied two-part Ayanokoji prompt (style and continuity, not its fixed timestamps).

## Look — one consistent visual grammar

- Keep silhouettes and eyes recognizable; use restrained expressions, human proportions, coherent clothing, a consistent pixel scale, and hand-crafted/appropriately licensed character artwork.
- Put sharp nearest-neighbor pixel sprites against **real depth**: layered foreground occluders, action plane, midground and distant atmospheric background. Use Three.js, PixiJS/Rigby, Blender or Godot as appropriate; the camera must move through space rather than zoom a single flat image.
- Choose one lighting hierarchy per location: readable key, subdued fill, selective rim, grounded contact shadows and a limited warm/cool palette. Let darkness carry tension; don't bury eyes under bloom or effects.
- For pure 2D pixel scenes, use an integer logical-to-delivery scale (for example 360×640 → 720×1280). For 2.5D/3D scenes, render the world at output resolution and use nearest sampling for sprite textures. The small `core/hd2d_pixel.js` helper (`pipeline/core/` in the full repo) provides `pixelCanvas`, `pixelTexture`, `pixelSnap`, and `pixelParallax`. Snap sprites when needed, not every camera movement. Avoid mismatched pixel scales and blur.
- Never use generative AI image or video models—not even for source sprites, stills, backgrounds or textures. TTS/audio is allowed.

## Camera beats — choose, don't stack

| Story function | Framing / motion | Edit point |
| --- | --- | --- |
| Hook or realization | Face/eye insert with a measured push-in | Cut when new information lands |
| Orientation | Wide or over-the-shoulder parallax reveal | Cut after geography is clear |
| Observation / suspicion | Detail inserts, eyeline-matched reverses, foreground occlusion | Cut on discovery or a glance |
| Confrontation | Hold readable two-shot, then selectively tighten singles | Let the silence and reactions breathe |
| Reversal / cliffhanger | Settle into the strongest silhouette or expression | End on a motivated sound/visual question |

Use **one dominant camera move per shot**. Establish who is looking where, preserve screen direction across cuts, and match the focal point and movement velocity at the cut. A stationary camera with an expressive blink can be stronger than an unnecessary orbit. Keep captions, mobile UI and eyes from competing for the same screen space.

## Pacing and continuity

- Start with a visible question and escalate via decisions, consequences and reactions—not constant cuts. The attachment's timestamps are one example, **not** a mandatory per-second schedule.
- Animate poses, facial acting and parallax on a frame clock. A deliberate on-twos character cadence can coexist with smooth 30-fps camera and particles; avoid accidental jerks.
- Use `evalCameraTrack(keys, seconds)` from `core/camera.js` (or `pipeline/core/camera.js`). Keyframe time is in **seconds**; paths now use time-aware continuous velocity across uneven durations. Optional `pace: 0..1.5` adjusts a key's incoming/outgoing speed; `hold: true` settles to zero velocity at a chosen reaction or edit beat. Keep `shake` near zero except justified impacts.
- For a sequel, preserve the last usable ungraded shot frame's pose, set, lighting, lens and camera state. Continue from that state without a recap; do not mistake a fade-to-black or text card for the story pose.
- Review first/last frames of cuts, adjacent motion, intersections, eye lines, subtitle clearance and the sound-led rhythm at phone size. Preserve source credits.

The art direction is a **reusable production option**, not a hardcoded character, engine or 60-second storyboard.
