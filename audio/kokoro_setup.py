"""Fetch the explicitly requested pinned Kokoro CPU model and voices."""
import hashlib
from pathlib import Path
from tempfile import NamedTemporaryFile
from urllib.request import urlopen

BASE = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/"
FILES = {
    "kokoro-v1.0.int8.onnx": "ae315a79b623f244700e4afb9246c46a26066782e049ba174bf3ba433970ee9c",
    "voices-v1.0.bin": "bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d",
}


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def install(folder):
    folder.mkdir(parents=True, exist_ok=True)
    for name, expected in FILES.items():
        destination = folder / name
        if destination.is_file() and digest(destination) == expected:
            continue
        with NamedTemporaryFile(dir=folder, delete=False) as stream:
            temporary = Path(stream.name)
        try:
            with urlopen(BASE + name, timeout=45) as source, temporary.open("wb") as target:
                while chunk := source.read(1024 * 1024):
                    target.write(chunk)
            if digest(temporary) != expected:
                raise ValueError(f"Checksum mismatch: {name}")
            temporary.replace(destination)
        finally:
            temporary.unlink(missing_ok=True)


if __name__ == "__main__":
    install(Path(__file__).resolve().parents[1] / ".runtime" / "voices")
