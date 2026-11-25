# Gemini anime What If production prompt

Replace the three bracketed fields. Leave the rest as written.

~~~text
Produce a 50–60-second cinematic anime What If Short.

Topic: [TOPIC]
Voice and language: [VOICE OR LANGUAGE, OTHERWISE CHOOSE A SUITABLE AVAILABLE OPTION]
Delivery profile: [balanced OR max]

Read README.md, docs/AUTHORING.md, and skills/anime-shorts-director/SKILL.md. Use the director's references selectively. **Never use generative AI for image or video creation**—not even for sprites, sprite sheets, textures, character illustrations, backgrounds or individual frames. Use procedural/programmatic art, human-made original assets or appropriately licensed human-created assets, then animate them through the actual engines. Do not create static-image slideshows. CPU TTS and audio processing are allowed. Record provenance for all externally sourced assets and audio. Verify important scientific or factual claims and distinguish hypothetical premises from real consequences.

For psychological anime What-If topics, prefer the selectable HD-2D pixel-cinema look from skills/anime-shorts-director/references/hd2d-pixel-cinema.md: sharp layered pixel art, real depth, expressive restrained acting, dramatic lighting, and camera shots paced to reactions. If the brief chooses another style, follow it. Avoid rigid per-second scene timing.

Run the runtime doctor and choose the strongest visual approach per shot. Use layered acting for expressions, multiplane or Three.js for spatial reveals, and rigged cel or Cycles CPU where the shot earns the cost. Establish a consistent character silhouette, camera grammar, palette and key light across shots. If a renderer is unavailable, design an alternate shot for a functioning renderer and report the change.

Build the cut around a visible first-second hook, escalating consequences, and a visually earned hero moment or reversal. Plan at the selected frame rate. Give scenes a foreground, a readable subject and spatial context. Create original frame-stepped motion through pose changes, parallax, character acting, and action. Set aside room for captions and Shorts UI.

Write and time narration first. Prefer clean supplied narration or Kokoro CPU for a finished voice; install optional Kokoro if the CPU/session budget allows. Use eSpeak as a lightweight draft or fallback, not the automatic quality target. Use authored timing if provided and label estimated word timing. Budget the duration including narration extension, lead-in, transitions, and silence. Layer restrained music and small cue-specific effects. Keep the strongest audio accent at the visual payoff.

Create a clean project with an episode.json, scripts, asset credits, and any bespoke assets. Render one focused draft. Review opening, hero beat, impact neighbors and outro at phone size with sound. Correct consequential faults. Measure a representative GPU-free timing sample and keep renders sequential. Deliver the profile selected above. If it exceeds the session budget, report the measured block and save the current editable project and verified draft.

Verify final duration 50–60 seconds, profile dimensions and cadence, exact decoded sequence, A/V sync, captions, SDR color tags, and full decode. Attach the final MP4 and editable source if the workspace supports both, plus short notes on engines, timings, render cost, and material limitations. Do not upload or publish to an external destination.
~~~
