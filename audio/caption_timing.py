"""Authored word timing with a model-free proportional fallback."""
import json
import math
import re
from pathlib import Path


def _proportional(take):
    tokens = take["text"].split()
    weights = [max(1, len(re.sub(r"\W", "", token))) for token in tokens]
    total = sum(weights)
    cursor = 0
    for token, weight in zip(tokens, weights):
        yield token, take["speech_dur_sec"] * cursor / total, take["speech_dur_sec"] * (cursor + weight) / total
        cursor += weight


def align_narration(manifest, episode_dir):
    words = []
    methods = set()
    for take in manifest["takes"]:
        if not take["text"]:
            continue
        timing_file = take.get("word_timing_file")
        if timing_file:
            items = json.loads((Path(episode_dir) / timing_file).read_text(encoding="utf-8"))
            timing = [(str(i["word"]), float(i["start"]), float(i["end"])) for i in items]
            methods.add("authored_word_timing")
        else:
            timing = _proportional(take)
            methods.add("proportional_estimate")
        previous = 0.0
        for token, start, end in timing:
            if not token.strip() or not math.isfinite(start) or not math.isfinite(end) or not previous <= start < end <= take["speech_dur_sec"] + 0.001:
                raise ValueError(f"Invalid word timing for {take['shot_id']}: {token!r} {start:.3f}–{end:.3f}s")
            offset = take["speech_start_sec"]
            words.append({"word": token, "start": offset + start, "end": offset + end, "shot_id": take["shot_id"]})
            previous = end
    return {"method": "+".join(sorted(methods)) or "none", "words": words}
