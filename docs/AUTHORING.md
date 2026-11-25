# Author a film

An episode is a folder containing episode.json, scene modules or scripts, and its own assets. Use relative filenames. The pipeline calculates a single integer frame plan for captures, incoming/outgoing transitions, sound and captions. Keep random sequences seeded and drive motion from frame index or time in seconds.

**Visual asset policy:** No generative AI image or video creation is permitted—not even individual sprite sheets, character illustrations, textures, backgrounds or keyframes. Author visuals with procedural code, manual drawing/modeling, or properly licensed human-made assets. Audio TTS remains allowed.

The optional [HD-2D pixel cinema direction](../skills/anime-shorts-director/references/hd2d-pixel-cinema.md) uses layered pixel sprites, spatial parallax and story-aware camera pacing. Camera tracks in `core/camera.js` now preserve velocity across unevenly timed keys; `pace: 0..1.5` tunes velocity and `hold: true` creates deliberate reaction settles. The art style is a choice, not a forced engine setting.

## Renderer selection

| Engine | When to use | Required shot fields and entry point |
| --- | --- | --- |
| cpu2d | Browser-free cutouts, sprite sheets, graphics and multiplane builds | cpu_script. `init_shot(width, height, fps, shot, asset_root)` returns `render(frame, seconds)` that supplies a Pillow image of the exact size. |
| anime2d | Canvas 2D, original procedural IK, sprites, type and graphic VFX | scene_module. Export `initShot(ctx)` that returns `renderFrame(frame, seconds)`. |
| pixi | PixiJS 8 shared atlases, Rigby skeletal animation and sprite effects | Same module contract. Import PIXI, rigbyPixi, Emitter and GlowFilter from /pipeline/dist/pixi.mjs. Stop the ticker and step delta once per authored frame. |
| web3d | Three.js r170 camera choreography, multiplane, GLTF/GLB and cel VRM 0.x | Same module contract. Import Three from /pipeline/vendor/three/three.module.min.js and combine GL with HUD canvas as needed. |
| blender | Work with rigs, geometry, simulation baked to frame, or offline shading in Cycles CPU | blender_script and optional blend_file. Read the JSON filename after `--`. Write f_0001.png through f_NNNN.png to frames_dir. |
| godot | Animated 2D scenes and compatible 3D scenes with software OpenGL | godot_project and optional scene_path. Uses Godot 4 GL Compatibility Movie Maker under DISPLAY or Xvfb. Read `--animpipe-config` and the next argument from user args. |

Browser ctx supplies glCanvas, hudCanvas, width, height, fps, shot, params and profile. Use the bundled camera.js for camera paths and shake, anime_rig.js for Canvas character blocking and effects, overlay_hud.js for safe titles, and cel_humanoid.js for the tested VRM 0.x subset. GLTFLoader is available for GLB rigs and standard animations. Supply any additional decoders required by your own compressed assets. In a scene that uses createCinemaComposer, pass effects from ctx.profile to select post-processing cost. For custom Blender scripts pass the profile samples and threads to Cycles. Godot project source is copied for each capture so engine-generated UIDs and import cache stay isolated. Keep viewport aspect and target profile aspect aligned.

Set engine to auto and style to layered, multiplane, or cel3d. Supply an implementations object keyed by renderer, each containing that renderer's entry fields and optional alternate params. Auto selects the first available authored implementation in the style's order:

- Layered → Pixi, Canvas, Pillow.
- Multiplane → Three, Pixi, Canvas, Pillow.
- Cel3d → Three, Blender, Godot.

For an explicit engine, supply fallbacks in preference order and an implementation for each alternate. This preserves how the scene was authored. An unavailable engine with no compatible authored version is a clear error for that shot. A scene crash is surfaced for repair.

## Episode keys

Set episode_id, title and shots. Every shot needs id, duration_sec, and an engine or authored implementations. params goes to the scene. An outgoing transition uses `{"type":"fade","duration_sec":0.125}` or another FFmpeg xfade type. Use `cut` for zero overlap. The timeline rounds overlaps and ensures independent frames in each shot. The scene receives shot._frames, shot._start_sec and shot._total_sec. Use render_dependencies for extra source inputs outside the episode that should invalidate the shot cache.

Audio can be generated, recorded or supplied as licensed media:

- Set shot narration text and choose tts auto, espeak, or kokoro at episode or shot level. Set voice and voice_language for Kokoro, and espeak_voice per shot for a specific eSpeak variant. Set voice_speed per shot or episode. Auto prefers configured Kokoro and otherwise selects eSpeak. Bootstrap reuses a system eSpeak CLI or installs a small rootless eSpeak NG wheel. Run `bash bootstrap.sh --kokoro` only when neural narration is required.
- Set narration_file to any audio input FFmpeg can decode. Set narration to the corresponding transcript for captions. A word_timing_file can provide an array such as `[{"word":"Look","start":0.06,"end":0.36}]` in seconds relative to the recorded take. The pipeline offsets it into the timeline. The fallback estimates durations by word length, with no acoustic alignment. An optional system Rhubarb executable can generate mouth cues via audio/lipsync_rhubarb.py when imported from the root.
- Use music_file and music_gain for an approved bed, or audio_mood for the procedural bed. sfx_cues can refer to a file or a procedural cue type. Set at_sec relative to the shot, at_norm as a shot fraction, or use episode-level SFX with absolute at_sec. duration_sec, gain and pan control individual cues.
- Narration can extend shots to fit lead-in, speech, tail and outgoing overlap. Budget story duration after TTS. Captions are burned in by libass. The editable ASS resides at work/PROFILE/audio/captions.ass.

## CPU profiles

| Profile | Default geometry | Browser and compositor | Blender defaults |
| --- | --- | --- | --- |
| draft | 360×640 at 24 fps | Fast JPEG, grade without DOF or bloom, 35% particle budget | 4 CPU samples |
| balanced | 720×1280 at 24 fps | High-quality JPEG, six-tap bloom, 65% particles | 12 CPU samples |
| max | 1080×1920 at 30 fps | PNG capture, full HDR composer where supported, 18-tap bloom, DOF, full particles | 32 CPU samples |

Set per-profile overrides under profiles in episode.json. Supported keys are width, height, fps, effects (0–2), particles (0–1, exclusive of zero), samples, crf and intermediate_crf. Legacy episode width, height and fps override max defaults. Defaults cap encode threads to two. Set ANIM_THREADS to change that. Rendering is sequential. Browser and Pillow stream compressed shot files rather than a folder of images. The Blender and Godot adapters stage frames or a movie and remove those intermediates after encoding.

Use measured uncached timings from a representative clip at the intended profile. The estimate command scales that observation linearly. Capture format, shading, mix, storage and machine contention affect wall time. Keep authored picture in a display-referred SDR look and use a reference swatch across renderers. Final output is limited-range BT.709 H.264 in yuv420p and stereo AAC.

## Environment overrides

To disable renderer candidates, set ANIM_DISABLE_ENGINES to a comma-separated list such as blender,godot. Use CHROME_PATH, PIPE_ANGLE, NODE_BIN, FFMPEG_BIN, FFPROBE_BIN, BLENDER_BIN, GODOT_BIN, ESPEAK_BIN and RHUBARB_BIN as needed. Override KOKORO_MODEL and KOKORO_VOICES together for a compatible local model and voice set. Chromium defaults to SwiftShader. Use ANIM_CHROME_SANDBOX=1 only when the host supports Chromium's sandbox and render assets and scripts come from the trusted project. The localhost renderer serves the episode plus the code and asset directories needed for browser shots while a shot is active.
