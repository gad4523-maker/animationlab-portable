# AnimationLab Portable

A CPU-oriented production pipeline for original animated Shorts. It uses the same episode clock, authorable scenes and FFmpeg finishing across layered 2D, multiplane 2.5D and stylized 3D. **No generative AI image or video creation is permitted, including individual sprites, sprite sheets, textures, backgrounds or keyframes.** Create visuals through procedural/code-driven drawing, manual art or appropriately licensed human-made sources, then animate them with the engines. Static-image slideshows are prohibited. CPU narration synthesis and audio processing are allowed.

## Start on Debian 12

~~~bash
bash bootstrap.sh --smoke
bash animlab doctor
bash animlab qc examples/beacon --profile draft
~~~

The Beacon Wake demo targets 105 frames at 360×640 with stereo sound and a three-frame crossfade. For a final narration voice, prefer a supplied clean recording or optional Kokoro CPU (`bash bootstrap.sh --kokoro`); eSpeak is a lightweight fallback. Use `--cpu-only` with bootstrap and render to exercise the browser-free version. Use `bash bootstrap.sh --help` for optional installs. The installer checks the existing environment and keeps pip, npm and browser caches within .runtime. It can reuse system Chromium or download the pinned Playwright headless shell if none is present.

## Start a project

~~~bash
bash animlab init projects/new-short --template beacon --id new_short
bash animlab render projects/new-short --profile draft
bash animlab render projects/new-short --profile balanced
bash animlab estimate projects/new-short/out/balanced/benchmark.json --seconds 60
~~~

Ten optional, version-pinned third-party skill repositories are linked as Git submodules. Run `git submodule update --init --depth 1` when you need them, then consult [the skill pack guide](docs/SKILL-PACKS.md). They are not runtime dependencies.

For the selectable cinematic pixel-anime look and camera beat direction, use the [HD-2D pixel cinema guide](skills/anime-shorts-director/references/hd2d-pixel-cinema.md). Other styles remain available.

See [the authoring guide](docs/AUTHORING.md) for episode keys and scene contracts. See [transfer instructions](docs/GEMINI-TRANSFER.md), [startup prompt](prompts/GEMINI-STARTUP.md), and [production prompt](prompts/GEMINI-PRODUCTION.md) for Gemini Tasks. The director lives in [skills/anime-shorts-director](skills/anime-shorts-director/SKILL.md).

| Example | Command suffix after `bash animlab render` |
| --- | --- |
| Beacon Wake, layered cutout → Three.js multiplane, with authored CPU 2D alternate | `examples/beacon --profile draft` |
| Scout Signal, original sprite atlas and Pixi 8/Rigby animation and particles | `examples/pixi-scout --profile draft` |
| Signal Break, VRM cel actor, pose IK, facial morphs and depth-tested effects | `examples/signal-break --profile draft` |
| Cycles Orbit, Blender 3.4 API and offline CPU render | `examples/blender-cpu --profile draft` |
| Godot Arc, Godot 4 GL Compatibility software movie capture | `examples/godot --profile draft` |

Each project has profile-specific work and output directories. Final output and contact sheet are published after exact video validation and full decode. The benchmark records selected engines, frame count, codec and color tags, durations, approximate motion flags and audio mastering levels. For a visual quality decision, review the rendered sequence at phone size with sound.

[Compatibility and audit](docs/COMPATIBILITY.md) · [Attribution and licenses](docs/ATTRIBUTION.md)
