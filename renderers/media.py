"""Common SDR video transport and strict validation for rendered shots."""
import json
import subprocess

from core.runtime import tool

FFPROBE_BIN = tool('FFPROBE_BIN', 'ffprobe')
SDR_TAGS = [
    "-color_range", "tv", "-colorspace", "bt709",
    "-color_primaries", "bt709", "-color_trc", "bt709",
]


def video_filter(width, height, *, source_matrix="bt709", source_range="tv", pix_fmt="yuv420p"):
    return (
        f"scale={width}:{height}:force_original_aspect_ratio=decrease:force_divisible_by=2:"
        f"in_color_matrix={source_matrix}:out_color_matrix=bt709:"
        f"in_range={source_range}:out_range=tv,format={pix_fmt},"
        f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1,"
        "setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709"
    )


def require_exact_video(path, width, height, fps, frames):
    probe = subprocess.check_output([
        FFPROBE_BIN, "-v", "error", "-select_streams", "v:0", "-show_entries",
        "stream=width,height,avg_frame_rate,nb_frames,color_range,color_space,color_transfer,color_primaries,sample_aspect_ratio",
        "-of", "json", str(path),
    ], text=True)
    streams = json.loads(probe)["streams"]
    expected = {
        "width": width, "height": height, "avg_frame_rate": f"{fps}/1",
        "nb_frames": str(frames), "color_range": "tv", "color_space": "bt709",
        "color_transfer": "bt709", "color_primaries": "bt709", "sample_aspect_ratio": "1:1",
    }
    actual = {key: (streams[0].get(key) if streams else None) for key in expected}
    if actual != expected:
        mismatch = {key: (actual[key], value) for key, value in expected.items() if actual[key] != value}
        raise ValueError(f"Invalid video {path} (actual, expected): {mismatch}")
