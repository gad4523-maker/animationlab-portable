"""Build frame-safe karaoke captions inside the pipeline's Shorts layout guides."""
import math
import unicodedata
from pathlib import Path


def _fmt_ass_time(ticks: int) -> str:
    seconds, cs = divmod(ticks, 100)
    minutes, s = divmod(seconds, 60)
    h, m = divmod(minutes, 60)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def _estimated_width(text, size):
    width = 0.0
    for char in text:
        if unicodedata.combining(char):
            continue
        if char.isspace() or char in "ilI!.,'":
            width += .40
        elif char in "mwMW" or unicodedata.east_asian_width(char) in "WF":
            width += 1.03
        else:
            width += .73
    return math.ceil(width * size + len(text) * size * .018)


def build_ass_subtitles(
    word_timestamps: dict,
    out_ass: Path,
    width: int = 1080,
    height: int = 1920,
    group_size: int = 3,
    total_dur_sec: float | None = None,
) -> Path:
    words = word_timestamps.get("words") or []
    out_ass = Path(out_ass)
    out_ass.parent.mkdir(parents=True, exist_ok=True)
    group_size = max(1, int(group_size))

    size = max(10, round(width * .062))
    bottom = math.ceil(height * .225)
    left = math.ceil(width * .075)
    right = math.ceil(width * .125)
    outline = max(1, round(size * .095))
    shadow = max(0, round(size * .04))
    spacing = round(size * .015)
    budget = max(1, width - left - right - 2 * (outline + shadow) - math.ceil(width * .025))
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {width}
PlayResY: {height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: ShortsKaraoke,Segoe UI,{size},&H0038DFFF,&H00FFFFFF,&H00080C18,&HB0040814,-1,0,0,0,100,100,{spacing},0,1,{outline},{shadow},2,{left},{right},{bottom + outline + shadow},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    last_end = 0
    clip_end = math.floor(total_dur_sec * 100 + 1e-7) if total_dur_sec is not None else None
    if clip_end is not None:
        words = [word for word in words if round(word["start"] * 100) < clip_end]
    lines = []
    i = 0
    while i < len(words):
        chunk = [words[i]]
        j = i + 1
        while j < len(words) and len(chunk) < group_size:
            prospective = " ".join(word["word"] for word in [*chunk, words[j]])
            if (
                words[j].get("shot_id") != chunk[-1].get("shot_id")
                or words[j]["start"] - chunk[-1]["end"] >= .35
                or _estimated_width(prospective, size) > budget
            ):
                break
            chunk.append(words[j])
            j += 1

        start = max(last_end, 0, round(chunk[0]["start"] * 100))
        end = max(start + 8, round((chunk[-1]["end"] + .06) * 100))
        if j < len(words):
            end = min(end, round(words[j]["start"] * 100))
        if clip_end is not None:
            end = min(end, clip_end)
        i = j
        if end <= start:
            continue

        weights = [max(1, round((word["end"] - word["start"]) * 100)) for word in chunk]
        elapsed, preceding = 0, 0
        text = []
        for word, weight in zip(chunk, weights):
            elapsed += weight
            boundary = round((end - start) * elapsed / sum(weights))
            safe = word["word"].replace("{", "(").replace("}", ")").replace("\\", "／")
            safe = " ".join(safe.split())
            text.append(f"{{\\k{boundary - preceding}}}{safe}")
            preceding = boundary

        estimated = _estimated_width(" ".join(word["word"] for word in chunk), size)
        scale = min(100, max(1, math.floor(100 * budget / max(1, estimated))))
        fade = min(55, (end - start) * 3)
        text_line = " ".join(text)
        lines.append(
            f"Dialogue: 0,{_fmt_ass_time(start)},{_fmt_ass_time(end)},ShortsKaraoke,,0,0,0,,"
            f"{{\\fad({fade},{fade})\\fscx{scale}}}{text_line}"
        )
        last_end = end

    out_ass.write_text(header + "\n".join(lines) + "\n", encoding="utf-8")
    return out_ass
