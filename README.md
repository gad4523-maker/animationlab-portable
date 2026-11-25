# AnimationLab Portable

A CPU-oriented production pipeline for original animated Shorts. It uses the same episode clock, authorable scenes and FFmpeg finishing across layered 2D, multiplane 2.5D and stylized 3D. AnimationLab's asset policy permits programmatic art and human-authored or permissively licensed assets, including credited reference assets. AI-generated images and video are prohibited, including individual frames, sprites, plates and other components. CPU narration synthesis is supported.

## Start on Debian 12

~~~bash
bash bootstrap.sh --smoke
bash animlab doctor
bash animlab qc examples/beacon --profile draft
~~~

The Beacon Wake demo renders 105 frames at 360×640 with stereo sound and an exact three-frame crossfade. Use `--cpu-only` with bootstrap and render to exercise the browser-free version. Use `bash bootstrap.sh --help` for optional installs. The installer checks the existing environment and keeps pip, npm and browser caches within .runtime. It can reuse system Chromium or download the pinned Playwright headless shell if none is present.

## Start a project

~~~bash
bash animlab init projects/new-short --template beacon --id new_short
bash animlab render projects/new-short --profile draft
bash animlab render projects/new-short --profile balanced
bash animlab estimate projects/new-short/out/balanced/benchmark.json --seconds 60
~~~

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
