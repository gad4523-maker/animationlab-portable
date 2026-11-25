# Gemini Tasks startup prompt

Copy the block into Task mode after supplying the AnimationLab source through the transfer method available in your session. Optionally select @anime-shorts-director.

~~~text
Initialize AnimationLab Portable in your Linux code execution workspace. The source is my supplied or authorized AnimationLab directory or repository. Work in its own writable folder.

1. Use your terminal or file tools to locate the actual files README.md, bootstrap.sh, cli.py and package-lock.json. If a code attachment is visible only as chat context, state that and use a filesystem checkout or download only from an authorized URL I provided. If the session has no way to materialize the source, stop at that specific blocker. Do not claim installation from a chat import.
2. Read README.md and skills/anime-shorts-director/SKILL.md in full, even if the skill is already selected. Load only its relevant references. If the skill lives in an attachment, read it explicitly there. Follow the AnimationLab asset policy.
3. From the source root run bash bootstrap.sh --smoke. Reuse installed system tools. Allow the render and dependency installs to finish. Capture the real output. If the system browser fails, review its probe and use the authored CPU alternative with bash animlab render examples/beacon --profile draft --cpu-only. Use optional flags only when needed for the work.
4. Run bash animlab doctor. Inspect examples/beacon/out/draft/benchmark.json and run bash animlab qc examples/beacon --profile draft. The smoke episode should have 105 frames at 360×640 and 24 fps with decoding audio. Report the actual selected engines, geometry, frame count, elapsed time, motion flags, and output path. Label optional tools by whether they rendered a clip or only passed detection.
5. Provide the smoke MP4 as a downloadable artifact if your Task supports it. If I provided a film topic, continue immediately with prompts/GEMINI-PRODUCTION.md. If I supplied setup only, finish with the observed capabilities.
~~~
