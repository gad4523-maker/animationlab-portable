"""Stream RGB Pillow frames to the same SDR transport used by external engines."""
import runpy
import subprocess
import time

from renderers.media import SDR_TAGS, video_filter
from core.runtime import THREADS, tool


def render_cpu_shot(script, out, w, h, fps, shot):
    render_frame = runpy.run_path(str(script))["init_shot"](
        w, h, fps, shot, script.parent
    )
    started = time.perf_counter()
    frames = shot["_frames"]
    cmd = [
        tool("FFMPEG_BIN", "ffmpeg"), "-nostdin", "-y", "-v", "error",
        "-f", "rawvideo", "-pixel_format", "rgb24", "-video_size", f"{w}x{h}",
        "-framerate", str(fps), "-i", "pipe:0", "-filter_threads", THREADS,
        "-vf", video_filter(w, h, source_range="full"), "-an", "-c:v", "libx264",
        "-threads", THREADS, "-preset", "ultrafast", "-crf", str(shot["_profile"]["intermediate_crf"]),
        *SDR_TAGS, str(out),
    ]
    with subprocess.Popen(cmd, stdin=subprocess.PIPE) as process:
        try:
            for frame in range(frames):
                image = render_frame(frame, frame / fps)
                if image.size != (w, h):
                    raise ValueError(f"CPU renderer returned {image.size}, expected {(w,h)}")
                process.stdin.write(image.convert("RGB").tobytes())
            process.stdin.close()
            if process.wait():
                raise RuntimeError("FFmpeg failed while encoding the CPU shot")
        except BaseException:
            if process.poll() is None:
                process.kill()
            raise
    elapsed = time.perf_counter() - started
    return {"frames": frames, "render_sec": round(elapsed, 3),
            "render_fps": round(frames / elapsed, 2)}
