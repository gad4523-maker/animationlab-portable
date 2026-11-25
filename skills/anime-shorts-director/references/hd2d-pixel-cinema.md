# HD-2D pixel cinema (primary art direction, any genre)

**Use HD-2D pixel cinema as the default look for every new anime Short unless the user explicitly requests another art style.** This is a visual identity, not a genre or engine restriction: keep layered pixel sprites and real depth while changing mood, lighting, expressions, lens choices, effects, and pacing to suit the anime and scene. Never carry psychological-thriller direction into unrelated action, comedy, adventure, drama, or explanations.

## Visual system

- Use manually authored or properly licensed pixel-sprite characters and environments; preserve recognizable silhouettes, costume shapes, eye lines, proportions, and a consistent pixel scale. **No generative AI image or video creation**, including sprites, sprite sheets, backgrounds, textures, or individual frames. TTS and audio tools are allowed.
- Create physical depth with foreground occluders, character/action planes, midground sets, and atmospheric distance. Animate genuine poses and parallax; do not fake a scene by zooming a flat still.
- Render pure 2D sprites at an integer upscale (e.g. 360×640 to 720×1280). For 2.5D scenes render the world at delivery size, apply nearest sampling to sprite textures, and snap selected sprites without quantizing the camera. The optional `core/hd2d_pixel.js` helper (`pipeline/core/` in the full repo) provides `pixelCanvas`, `pixelTexture`, `pixelSnap`, and `pixelParallax`.
- Set a coherent light direction, contact shadows, readable subject/background separation, and controlled effects. Choose color, contrast, atmosphere, and facial acting **from the scene's emotion**: daylight and vibrancy for wonder/comedy; forceful highlights and readable silhouettes for combat; quiet contrast and selective darkness only when justified.

## Direct the camera by intent

| Scene intent | Useful composition and movement | Timing principle |
| --- | --- | --- |
| Combat / power reveal | Wide geography, low-angle scale, motivated tracking, brief speed ramp or impact shake | Establish anticipation → clear action → impact → recovery; let key poses read |
| Comedy / surprise | Legible two-shot, deadpan hold, quick reaction insert or punch-in | Protect setup and payoff; the hold can be funnier than the cut |
| Exploration / spectacle | Wide reveal, foreground fly-through, rising crane or measured orbit | Give the environment room to register before the next surprise |
| Explanation / powerscaling | Clear subject, motivated cutaway, anchored labels and scale comparisons | Let the viewer understand each new claim before escalating |
| Character drama | Close-up, eyeline-matched reverse, subtle dolly or a composed static frame | Favor expression and silence over camera activity |
| Mystery / psychological suspense | Controlled push-in, occlusion, selective detail insert, delayed reverse | Withhold or reveal information deliberately; don't import this grammar into other genres |

These are options, **not fixed shot orders or per-second schedules**. Choose the move based on the subject's action and viewer's focal point. One dominant move per shot is usually enough; vary move size and lens language with dramatic intensity. Preserve screen direction, eyeline matches, and camera velocity across cuts. Avoid simultaneous spinning, dollying, shaking, rack focus, and zooming unless each is motivated and readable on a phone.

## Motion, pacing, continuity

- Determine the episode's genre, emotional curve, hook, escalation, payoff, and ending first. Time shots to **information, performance and motion**, not a copied template. A thrilling fight and a quiet reveal should not share an automatic cut rhythm.
- Use frame-stepped pose and facial animation, consistent contact points, hand-drawn smears where appropriate, and multiplane motion. On-twos sprite animation can coexist with smooth camera movement; avoid unintended jitter.
- Use `evalCameraTrack(keys, seconds)` in `core/camera.js` (full repo: `pipeline/core/camera.js`): time-aware interpolation works across unevenly spaced keys, `pace: 0..1.5` tunes travel through an interior key, and `hold: true` deliberately settles movement. Reserve camera shake for impacts that earn it.
- For a sequel, match the last *usable story frame* (pose, light, set, lens, motion trajectory), not an outro card or fade. Preserve script and external asset credits.
- Check adjacent frames at every action peak and cut, direction changes, geometry intersections, text safe zones, focal clarity, and sound sync at actual phone size.

**Keep the HD-2D visual identity by default**, but never lock character, genre, mood, renderer, camera move, or shot length. Switch to another visual style when the user explicitly chooses it; keep that choice consistent within the episode.
