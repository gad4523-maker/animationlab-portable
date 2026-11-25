# Upstream animation skills

Ten third-party skill repositories are linked as **pinned Git submodules** to keep AnimationLab Portable small.

## Make their files available in Gemini Tasks

After cloning the main repository, run:

```bash
git submodule update --init --depth 1
```

Alternatively clone with `git clone --recurse-submodules https://github.com/gad4523-maker/animationlab-portable.git`.

These are **skill instructions and source references**, not automatically installed engine binaries. Do not run third-party hooks, startup scripts, or MCP servers blindly. Read only relevant SKILL.md files; the AnimationLab director, user brief, original-asset policy, and available CPU-only engine versions take priority.

| Source | Fit for our cinematic Shorts |
| --- | --- |
| [iart-ai/motion-design-skills](https://github.com/iart-ai/motion-design-skills) | Recommended: motion art direction, composition, timing, beat-sync |
| [pixijs/pixijs-skills](https://github.com/pixijs/pixijs-skills) | Recommended: PixiJS v8 API and sprite animation |
| [gamedev-skills/awesome-gamedev-agent-skills](https://github.com/gamedev-skills/awesome-gamedev-agent-skills) | Select camera, shader, audio and performance disciplines |
| [arjun988/blender-skills](https://github.com/arjun988/blender-skills) | Reference: cameras, anime style, lighting; many tasks assume Blender MCP |
| [mromidev/claude-animated-shorts](https://github.com/mromidev/claude-animated-shorts) | Reference only: Remotion/Three.js; its output and caption rules differ |
| [AnastasiyaW/codex-claude-code-config](https://github.com/AnastasiyaW/codex-claude-code-config) | Reference pixel-art/storyboard skills only; do not apply global config/hooks |
| [RobLe3/cc-blender-skill](https://github.com/RobLe3/cc-blender-skill) | Blender 5.x/MCP-focused; verify before applying on Blender 3.4 |
| [smixs/visual-skills](https://github.com/smixs/visual-skills) | AI-video/image-generation prompt skills; **do not activate** under current asset restrictions; CC-BY-4.0 attribution |
| [finktheartist/sakuga-vfx](https://github.com/finktheartist/sakuga-vfx) | Anime-styled UI controls, not a complete combat VFX engine |
| [CloudAI-X/threejs-skills](https://github.com/CloudAI-X/threejs-skills) | Targets Three.js r186, while this repository vendors r170; check API differences |

Submodules are locked to specific upstream commits. Their licenses and reference materials stay in their own repositories. Initialization makes files available under `skills/external/`, but does not automatically activate any skill in Gemini; read/import only the one appropriate to the shot.
