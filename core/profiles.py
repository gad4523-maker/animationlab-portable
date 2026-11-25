"""Portrait delivery settings shared by render, estimate and QC."""
PROFILES = {
    "draft": dict(width=360, height=640, fps=24, crf=25, preset="ultrafast",
                  intermediate_crf=16, effects=0, particles=0.35, samples=4),
    "balanced": dict(width=720, height=1280, fps=24, crf=20, preset="veryfast",
                     intermediate_crf=13, effects=1, particles=0.65, samples=12),
    "max": dict(width=1080, height=1920, fps=30, crf=17, preset="fast",
                intermediate_crf=11, effects=2, particles=1.0, samples=32),
}


def settings(ep, profile):
    config = {**PROFILES[profile], "name": profile}
    overrides = ep.get("profiles", {}).get(profile, {})
    customizable = {"width", "height", "fps", "effects", "particles", "samples", "crf", "intermediate_crf"}
    if unknown := overrides.keys() - customizable:
        raise ValueError(f"Unknown profile overrides {sorted(unknown)}")
    config.update(overrides)
    if profile == "max":
        for key in ("width", "height", "fps"):
            if key in ep and key not in overrides:
                config[key] = ep[key]
    w, h, fps = (config[key] for key in ("width", "height", "fps"))
    if any(type(value) is not int or value < 1 for value in (w, h, fps)) or w % 2 or h % 2:
        raise ValueError("Profile requires positive integer fps and positive even dimensions")
    for key, minimum, maximum in (("effects", 0, 2), ("samples", 1, 1024),
                                   ("crf", 0, 51), ("intermediate_crf", 0, 51)):
        if type(config[key]) is not int or not minimum <= config[key] <= maximum:
            raise ValueError(f"Profile {key} requires an integer from {minimum} through {maximum}")
    if not 0 < config["particles"] <= 1:
        raise ValueError("Particle multiplier must be greater than zero and at most one")
    return config
