"""Content-addressed shot inputs and recoverable state publication."""
import hashlib
import json
import os
from pathlib import Path
from tempfile import NamedTemporaryFile

_GENERATED = {"work", "out", ".git", ".godot", ".cache", "__pycache__", "node_modules", ".venv", ".runtime", "dist"}


def _fingerprint(root):
    if root.is_dir():
        files = []
        for folder, dirs, names in os.walk(root):
            dirs[:] = sorted(d for d in dirs if d not in _GENERATED)
            for name in sorted(names):
                path = Path(folder) / name
                if path.is_file() and path.suffix not in {".pyc", ".blend1"}:
                    files.append((path.relative_to(root).as_posix(), _file_sha(path)))
        return files
    return _file_sha(root)


def _file_sha(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


class RenderInputs:
    def __init__(self, episode, pipeline):
        self.episode = episode
        self.episode_files = _fingerprint(episode)
        # Episode JSON is reflected in each shot, its resolved timeline, and render settings.
        self.episode_files = [(name, sha) for name, sha in self.episode_files if name != "episode.json"]
        self.pipeline = {part: _fingerprint(pipeline / part) for part in ("core", "renderers", "vendor")}
        self.shared = {}

    def shot_hash(self, shot, width, height, fps):
        external = {}
        for key in ("scene_module", "cpu_script", "blender_script", "godot_project", "blend_file", "render_dependencies"):
            values = shot.get(key)
            for value in ([values] if isinstance(values, str) else (values or [])):
                path = (self.episode / value).resolve()
                if path == self.episode or (path.is_relative_to(self.episode) and path.relative_to(self.episode).parts[0] not in _GENERATED):
                    continue
                if path not in self.shared:
                    self.shared[path] = _fingerprint(path)
                external[value] = self.shared[path]
        tools = {name: os.environ.get(name) for name in ("CHROME_PATH", "PIPE_ANGLE", "BLENDER_BIN", "GODOT_BIN", "FFMPEG_BIN", "ANIM_THREADS", "ANIM_CHROME_SANDBOX", "GALLIUM_DRIVER", "GALLIUM_OVERRIDE_CPU_CAPS")}
        payload = [shot, width, height, fps, self.pipeline, self.episode_files, external, tools]
        return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()


def write_json_atomic(path, value):
    with NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, delete=False) as stream:
        temp = Path(stream.name)
    try:
        temp.write_text(json.dumps(value, indent=2), encoding="utf-8")
        temp.replace(path)
    finally:
        temp.unlink(missing_ok=True)
