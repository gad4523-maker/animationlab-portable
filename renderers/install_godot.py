"""Install a pinned official Linux x86-64 Godot binary when requested."""
import hashlib
import os
import platform
import shutil
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.request import urlopen
from zipfile import ZipFile

from core.runtime import RUNTIME, at_least, capture, tool

NAME = "Godot_v4.7.2-stable_linux.x86_64"
URL = "https://github.com/godotengine/godot-builds/releases/download/4.7.2-stable/" + NAME + ".zip"
SHA256 = "cadd3204e728a35d3f13adb7fd0d7902636b79f6b95c40c265eb73b6c35329e4"


def main():
    godot = tool("GODOT_BIN", "godot4", "godot")
    if at_least(capture([godot, "--version"]), (4, 0)):
        return
    if platform.system() != "Linux" or platform.machine() != "x86_64":
        raise SystemExit("Supply Godot 4 for this platform and set GODOT_BIN")
    destination = RUNTIME / "bin" / "godot4"
    destination.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=destination.parent) as folder:
        archive = Path(folder) / "godot.zip"
        with urlopen(URL, timeout=45) as source, archive.open("wb") as target:
            shutil.copyfileobj(source, target, length=1024 * 1024)
        with archive.open("rb") as stream:
            if hashlib.file_digest(stream, "sha256").hexdigest() != SHA256:
                raise RuntimeError("Godot checksum mismatch")
        stage = Path(folder) / NAME
        with ZipFile(archive) as bundle, bundle.open(NAME) as source, stage.open("wb") as target:
            shutil.copyfileobj(source, target, length=1024 * 1024)
        stage.chmod(0o755)
        if not at_least(capture([str(stage), "--version"]), (4, 0)):
            raise RuntimeError("Godot could not launch on this host")
        os.replace(stage, destination)


if __name__ == "__main__":
    main()
