# Use the director in Gemini Tasks

In the Gemini web app, open Skills, choose Create and then Upload. Select the director ZIP, review the skill, and create it. In Task mode, use @ to select the imported skill. The archive has a root SKILL.md and Markdown references.

If Skills or the selector is missing, attach SKILL.md and the relevant reference files through Upload & tools. You can also paste the instructions into the task. Say:

> Read the attached SKILL.md in full and follow its instructions as my animation director for this task. Read only the referenced guides needed for this shot. Name the production constraints you applied and identify any reference you couldn't read.

If files are already present in the code workspace, direct Gemini to read skills/anime-shorts-director/SKILL.md with its file or shell tool. Install and run the full AnimationLab pipeline from the Task's code workspace using the separate startup prompt. A Skills import delivers the directing instructions. Package downloads belong to the separate code task.

[Google's Skills import instructions](https://support.google.com/gemini/answer/18977944?hl=en)  
[Google's Task and file controls](https://support.google.com/gemini/answer/17094507?hl=en)
