"""Deterministic external-engine capture for Godot Movie Maker and Blender."""
import json
import os
import shutil
import subprocess
import time
from pathlib import Path
from tempfile import TemporaryDirectory

from renderers.media import SDR_TAGS, require_exact_video, video_filter

from core.runtime import THREADS, tool

GODOT_BIN = tool("GODOT_BIN", "godot4", "godot")
BLENDER_BIN = tool("BLENDER_BIN", "blender")
FFMPEG_BIN = tool("FFMPEG_BIN", "ffmpeg")


def _encode(src, out, width, height, fps, frames, *, matrix, source_range, quality):
    subprocess.run([
        FFMPEG_BIN, "-y", "-loglevel", "error", *src,
        "-filter_threads", THREADS, "-vf", video_filter(width, height, source_matrix=matrix, source_range=source_range) + f",fps={fps}",
        "-frames:v", str(frames), "-c:v", "libx264", "-threads", THREADS, "-preset", "veryfast", "-crf", str(quality["intermediate_crf"]),
        "-pix_fmt", "yuv420p", *SDR_TAGS, "-an", str(out),
    ], check=True)
    require_exact_video(out, width, height, fps, frames)


def _metrics(start, frames):
    elapsed = time.perf_counter() - start
    return {"frames": frames, "render_sec": round(elapsed, 3), "render_fps": round(frames / max(0.001, elapsed), 2)}


def render_godot_shot(
    project_dir: Path, out_mp4: Path, width: int, height: int, fps: int, duration_sec: float,
    *, scene_path: str | None = None, params: dict | None = None, quality: dict,
) -> dict:
    """Import in a private project copy, then capture using its GPU renderer."""
    project_dir, out_mp4 = Path(project_dir).resolve(), Path(out_mp4).resolve()
    if not (project_dir / "project.godot").is_file():
        raise FileNotFoundError(f"Godot project.godot missing in {project_dir}")
    if scene_path:
        scene_path = scene_path.removeprefix("res://").replace("\\", "/")
        scene_file = (project_dir / scene_path).resolve()
        if not scene_file.is_relative_to(project_dir) or not scene_file.is_file():
            raise FileNotFoundError(f"Godot scene {scene_path} missing in {project_dir}")
    out_mp4.parent.mkdir(parents=True, exist_ok=True)
    frames = max(1, round(duration_sec * fps))
    start = time.perf_counter()

    with TemporaryDirectory(prefix="godot-", dir=out_mp4.parent) as temp:
        temp = Path(temp)
        # Godot generates UIDs and import state beside the input scenes. Isolate both
        # from the source project so a render cannot change its own cache signature.
        capture_project = temp / "project"
        shutil.copytree(
            project_dir, capture_project,
            ignore=shutil.ignore_patterns(".godot", ".git", "work", "out"),
        )
        avi = temp / "capture.avi"
        config = temp / "shot_params.json"
        config.write_text(json.dumps({"width": width, "height": height, "fps": fps, "frames": frames, "params": params or {}, "profile": quality}), encoding="utf-8")
        subprocess.run([GODOT_BIN, "--headless", "--path", str(capture_project), "--import"], check=True, timeout=180)
        prefix = [] if os.name == "nt" or os.environ.get("DISPLAY") else ["xvfb-run", "-a"]
        cmd = [
            *prefix, GODOT_BIN, "--path", str(capture_project), "--resolution", f"{width}x{height}",
            "--rendering-method", "gl_compatibility", "--audio-driver", "Dummy",
            "--write-movie", str(avi), "--fixed-fps", str(fps), "--quit-after", str(frames + 1),
        ]
        if scene_path:
            cmd.extend(["--scene", "res://" + scene_path])
        capture = subprocess.run(
            [*cmd, "--", "--animpipe-config", str(config)], timeout=600,
            capture_output=True, text=True, encoding="utf-8", errors="replace",
            env={**os.environ, "LIBGL_ALWAYS_SOFTWARE": "1", "LP_NUM_THREADS": THREADS},
        )
        if capture.returncode or "SCRIPT ERROR:" in capture.stdout + capture.stderr or not avi.is_file():
            raise RuntimeError(f"Godot capture failed (exit {capture.returncode}):\n{capture.stdout}\n{capture.stderr}")
        _encode(["-i", str(avi)], out_mp4, width, height, fps, frames, matrix="bt601", source_range="full", quality=quality)
    return _metrics(start, frames)


def render_blender_shot(
    script_path: Path, out_mp4: Path, width: int, height: int, fps: int, frames: int, params: dict,
    *, blend_file: Path | None = None, quality: dict,
) -> dict:
    """Execute a shot script and reject missing PNGs or partial renders before encoding."""
    script_path, out_mp4 = Path(script_path).resolve(), Path(out_mp4).resolve()
    if not script_path.is_file() or (blend_file and not blend_file.is_file()):
        raise FileNotFoundError(f"Blender script or project missing: {script_path}, {blend_file}")
    out_mp4.parent.mkdir(parents=True, exist_ok=True)
    start = time.perf_counter()

    with TemporaryDirectory(prefix="blender-", dir=out_mp4.parent) as temp:
        folder = Path(temp)
        config = folder / "shot_params.json"
        config.write_text(json.dumps({
            "width": width, "height": height, "fps": fps, "frames": frames, "frames_dir": str(folder), "params": params,
            "profile": quality, "threads": int(THREADS),
        }), encoding="utf-8")
        command = [BLENDER_BIN, "--background", "--disable-autoexec", "--threads", THREADS]
        if blend_file:
            command.append(str(blend_file))
        else:
            command.append("--factory-startup")
        subprocess.run([
            *command, "--python-exit-code", "1", "--python", str(script_path), "--", str(config),
        ], cwd=script_path.parent, check=True)
        missing = next((i for i in range(1, frames + 1) if not (folder / f"f_{i:04}.png").is_file()), None)
        if missing is not None:
            raise RuntimeError(f"Blender shot {script_path.name} did not write frame {missing} of {frames}")
        _encode(
            ["-framerate", str(fps), "-start_number", "1", "-i", str(folder / "f_%04d.png")],
            out_mp4, width, height, fps, frames, matrix="bt709", source_range="full", quality=quality,
        )
    return _metrics(start, frames)
