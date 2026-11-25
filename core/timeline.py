"""Canonical frame counts shared by narration, shot timing and video assembly."""
import math


def overlap_frames(shot, fps):
    transition = shot.get("transition") or {}
    if transition.get("type", "cut") == "cut":
        return 0
    seconds = float(transition.get("duration_sec", 0.0))
    if not math.isfinite(seconds) or seconds < 0:
        raise ValueError(f"Invalid transition duration on {shot['id']}: {seconds}")
    return math.floor(seconds * fps + 0.5)


def plan_timeline(shots, fps):
    if fps < 1 or not shots:
        raise ValueError("An episode requires positive fps and at least one shot")
    overlaps = [overlap_frames(shot, fps) for shot in shots[:-1]] + [0]
    timeline = []
    start = 0
    for i, (shot, overlap) in enumerate(zip(shots, overlaps)):
        frames = shot["_frames"]
        incoming = overlaps[i - 1] if i > 0 else 0
        if frames <= incoming + overlap:
            raise ValueError(f"Transition overlap leaves no independent frame in {shot['id']}")
        timeline.append({"start": start, "frames": frames, "overlap": overlap})
        start += frames - overlap
    return timeline, start
