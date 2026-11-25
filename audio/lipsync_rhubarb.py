"""Optional Rhubarb Lip Sync wrapper generating mouth viseme cues JSON for talking 2D character shots."""
import json
import subprocess
from pathlib import Path

from core.runtime import tool

RHUBARB_BIN = tool('RHUBARB_BIN', 'rhubarb')


def generate_mouth_cues(wav_path: Path, out_json: Path, transcript: str = "") -> dict:
    wav_path = Path(wav_path)
    out_json = Path(out_json)
    out_json.parent.mkdir(parents=True, exist_ok=True)
    cmd = [RHUBARB_BIN, "-f", "json", "-o", str(out_json), str(wav_path)]
    if transcript:
        txt_file = out_json.with_suffix(".txt")
        txt_file.write_text(transcript, encoding="utf-8")
        cmd = [RHUBARB_BIN, "-f", "json", "-d", str(txt_file), "-o", str(out_json), str(wav_path)]
    subprocess.run(cmd, check=True)
    return json.loads(out_json.read_text(encoding="utf-8"))
