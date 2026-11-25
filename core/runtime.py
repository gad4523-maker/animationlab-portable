"""Discover tools without binding to a user's machine or GPU."""
import json
from importlib.util import find_spec
import os
import platform
import re
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / ".runtime"
THREADS = str(max(1, min(16, int(os.environ.get("ANIM_THREADS", "2")))))


def tool(variable, *commands):
    override = os.environ.get(variable)
    if override:
        return shutil.which(override) or override
    for command in commands:
        found = shutil.which(command)
        if found:
            return found
        local = RUNTIME / "bin" / command
        if local.is_file() and os.access(local, os.X_OK):
            return str(local)
    return ""


def browser():
    found = tool("CHROME_PATH", "chromium", "chromium-browser", "google-chrome", "google-chrome-stable")
    if not found and os.name == "nt":
        for var in ("ProgramFiles", "ProgramFiles(x86)"):
            for relative in ("Google/Chrome/Application/chrome.exe", "Microsoft/Edge/Application/msedge.exe"):
                path = Path(os.environ.get(var, "/")) / relative
                if path.is_file():
                    return str(path)
    return found


def capture(command, timeout=12):
    try:
        result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                text=True, encoding="utf-8", errors="replace", timeout=timeout)
        return result.stdout.strip() if result.returncode == 0 else ""
    except (OSError, subprocess.TimeoutExpired):
        return ""


def at_least(version, minimum):
    match = re.search(r"\b(\d+)\.(\d+)", version)
    return match is not None and tuple(map(int, match.groups())) >= minimum


def capabilities(probe_browser=True):
    ff = tool("FFMPEG_BIN", "ffmpeg")
    ffprobe = tool("FFPROBE_BIN", "ffprobe")
    node = tool("NODE_BIN", "node")
    blender = tool("BLENDER_BIN", "blender")
    godot = tool("GODOT_BIN", "godot4", "godot")
    speech = tool("ESPEAK_BIN", "espeak-ng", "espeak")
    chrome = browser()
    flags = capture([ff, "-hide_banner", "-encoders"])
    filters = capture([ff, "-hide_banner", "-filters"])
    ff_ok = (at_least(capture([ff, "-version"]), (5, 1))
             and bool(capture([ffprobe, "-version"]))
             and all(name in flags for name in ("libx264", " aac "))
             and all(name in filters for name in (" ass ", "xfade", "loudnorm")))
    versions = {
        "ffmpeg": capture([ff, "-version"]), "node": capture([node, "--version"]),
        "blender": capture([blender, "--version"], timeout=30),
        "godot": capture([godot, "--version"], timeout=20),
        "espeak": capture([speech, "--version"]),
    }
    web = {}
    if probe_browser and at_least(versions["node"], (18, 0)) and (ROOT / "node_modules/playwright-core/package.json").is_file():
        raw = capture([node, str(ROOT / "renderers/probe.mjs")], timeout=50)
        try:
            web = json.loads(raw)
        except ValueError:
            web = {"error": "Chromium probe could not complete"}
    engines = {
        "cpu2d": ff_ok, "anime2d": ff_ok and bool(web.get("canvas")),
        "web3d": ff_ok and bool(web.get("webgl2")),
        "pixi": ff_ok and bool(web.get("pixi")),
        "blender": ff_ok and at_least(versions["blender"], (3, 4)),
        "godot": ff_ok and at_least(versions["godot"], (4, 0))
        and (os.name == "nt" or bool(os.environ.get("DISPLAY") or
                                    (shutil.which("xvfb-run") and shutil.which("xauth")))),
    }
    disabled = {name.strip() for name in os.environ.get("ANIM_DISABLE_ENGINES", "").split(",")}
    for name in engines.keys() & disabled:
        engines[name] = False
    return {
        "platform": platform.platform(), "ffmpeg": ff_ok,
        "versions": {k: v.splitlines()[0] if v else "" for k, v in versions.items()},
        "tools": {"chrome": chrome, "blender": blender, "godot": godot},
        "browser": web, "threads": int(THREADS),
        "engines": engines,
        "narration": {
            "file": True,
            "espeak": ("executable" if versions["espeak"] else
                       "rootless wheel" if find_spec("espeakng_loader") else False),
            "kokoro": bool(find_spec("kokoro_onnx")) and all(
                Path(os.environ.get(key, RUNTIME / path)).is_file()
                for key, path in (("KOKORO_MODEL", "voices/kokoro-v1.0.int8.onnx"),
                                  ("KOKORO_VOICES", "voices/voices-v1.0.bin"))
            ),
        },
    }


ENGINE_ORDER = {
    "layered": ("pixi", "anime2d", "cpu2d"),
    "multiplane": ("web3d", "pixi", "anime2d", "cpu2d"),
    "cel3d": ("web3d", "blender", "godot"),
}
ENGINE_KEYS = {
    "cpu2d": "cpu_script", "anime2d": "scene_module", "pixi": "scene_module",
    "web3d": "scene_module", "blender": "blender_script", "godot": "godot_project",
}


def choose_engine(shot, available):
    primary = shot.get("engine", "auto")
    authored = shot.get("implementations", {})
    if primary == "auto":
        style = shot.get("style", "layered")
        if style not in ENGINE_ORDER:
            raise ValueError(f"Unknown style {style!r} on {shot['id']}")
        candidates = ENGINE_ORDER[style]
    else:
        candidates = (primary, *shot.get("fallbacks", []))
    for engine in candidates:
        if engine not in ENGINE_KEYS:
            raise ValueError(f"Unknown renderer {engine!r} on {shot['id']}")
        implementation = {**shot, **authored.get(engine, {})}
        if engine != primary and engine not in authored:
            continue
        if available.get(engine) and implementation.get(ENGINE_KEYS[engine]):
            return {**implementation, "engine": engine, "_requested_engine": primary}
    raise RuntimeError(f"Shot {shot['id']} has no available authored implementation among {', '.join(candidates)}")
