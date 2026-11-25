"""Recorded or synthesized narration with content caching and frame-exact duration fit."""
import hashlib
import json
import math
import os
import subprocess
import sys
from importlib.metadata import version
from importlib.util import find_spec
from tempfile import TemporaryDirectory
from math import gcd
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

from core.timeline import overlap_frames, plan_timeline

from core.runtime import RUNTIME, tool
from renderers.cache import write_json_atomic

DEFAULT_MODEL = os.environ.get("KOKORO_MODEL", str(RUNTIME / "voices/kokoro-v1.0.int8.onnx"))
DEFAULT_VOICES = os.environ.get("KOKORO_VOICES", str(RUNTIME / "voices/voices-v1.0.bin"))


def _digest(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def _read_audio(path, folder):
    with TemporaryDirectory(prefix="voice-", dir=folder) as tmp:
        decoded = Path(tmp) / "mono.wav"
        subprocess.run([tool("FFMPEG_BIN", "ffmpeg"), "-nostdin", "-v", "error", "-y",
                        "-i", str(path), "-vn", "-ac", "1", "-ar", "48000", str(decoded)], check=True)
        return sf.read(decoded, dtype="float32")


def _trim_silence(buf: np.ndarray, sr: int, thresh: float = 0.004) -> np.ndarray:
    active = np.flatnonzero(np.abs(buf) > thresh)
    if len(active) == 0:
        return buf
    pad_pre = min(active[0], int(0.015 * sr))
    pad_post = int(0.040 * sr)
    return buf[max(0, active[0] - pad_pre) : min(len(buf), active[-1] + pad_post)]


def _resample_clean(buf: np.ndarray, src_sr: int, dst_sr: int) -> np.ndarray:
    if src_sr == dst_sr:
        return buf.astype(np.float32)
    g = gcd(src_sr, dst_sr)
    return resample_poly(buf, dst_sr // g, src_sr // g).astype(np.float32)


def generate_narration_takes(
    shots: list,
    out_dir: Path,
    voice: str = "am_michael",
    speed: float = 1.08,
    target_sr: int = 48000,
    fps: int = 30,
    model_path: str = DEFAULT_MODEL,
    voices_path: str = DEFAULT_VOICES,
    episode_dir: Path = Path("."),
    provider: str = "auto",
    language: str = "en-us",

) -> dict:
    """
    Generate per-shot WAV narration clips cached by SHA-256, frame-quantizing eff_dur
    to exact multiples of (1/fps) so audio, subtitles, and FFmpeg frames stay frame-locked.
    """
    out_dir = Path(out_dir)
    takes_dir = out_dir / "takes"
    takes_dir.mkdir(parents=True, exist_ok=True)
    cache_index_path = takes_dir / "cache_index.json"
    try:
        cache_index = json.loads(cache_index_path.read_text(encoding="utf-8"))
        if not isinstance(cache_index, dict):
            cache_index = {}
    except (OSError, ValueError):
        cache_index = {}

    kokoro = None
    takes_info = []
    lead_in = 0.16
    model_signature = None
    espeak = tool("ESPEAK_BIN", "espeak-ng", "espeak")
    rootless_speech = find_spec("espeakng_loader") is not None
    neural_ready = all(Path(f).is_file() for f in (model_path, voices_path)) and find_spec("kokoro_onnx") is not None

    for idx, shot in enumerate(shots):
        sid = shot["id"]
        text = (shot.get("narration") or "").strip()
        authored_dur = float(shot["duration_sec"])
        audio_file = (Path(episode_dir) / shot["narration_file"]).resolve() if shot.get("narration_file") else None
        active = "file" if audio_file else shot.get("tts", provider)
        if active == "auto":
            active = "kokoro" if neural_ready else "espeak"
        shot_voice = shot.get("voice", voice)
        shot_language = shot.get("voice_language", language)
        shot_speed = float(shot.get("voice_speed", speed))
        overlap = overlap_frames(shot, fps) if idx < len(shots) - 1 else 0
        xfade_dur = overlap / fps

        wav_path = takes_dir / f"{sid}.wav"
        if text or audio_file:
            if active == "file" and audio_file:
                signature = _digest(audio_file)
            elif active == "kokoro" and neural_ready:
                if model_signature is None:
                    model_signature = [_digest(path) for path in (model_path, voices_path)]
                signature = model_signature
            elif active == "espeak" and (espeak or rootless_speech):
                signature = (subprocess.check_output([espeak, "--version"], text=True)
                             if espeak else f"espeakng-loader {version('espeakng-loader')}")
            else:
                raise RuntimeError(f"Narration provider {active!r} unavailable on {sid}. Supply narration_file, install eSpeak, or bootstrap --kokoro.")
            key_data = ["portable-take-v1", active, signature, text, shot_voice, shot_language, shot.get("espeak_voice"), shot_speed, target_sr]
            key = hashlib.sha256(json.dumps(key_data).encode("utf-8")).hexdigest()
            audio = None
            if cache_index.get(sid) == key and wav_path.is_file():
                try:
                    audio, _ = sf.read(wav_path, dtype="float32")
                except (OSError, RuntimeError):
                    pass
            if audio is None:
                if active == "file":
                    raw_buf, raw_sr = _read_audio(audio_file, takes_dir)
                elif active == "espeak":
                    with TemporaryDirectory(prefix="espeak-", dir=takes_dir) as tmp:
                        wave = Path(tmp) / "voice.wav"
                        variant = shot.get("espeak_voice", shot_language)
                        rate = str(round(165 * shot_speed))
                        command = ([espeak, "-v", variant, "-s", rate, "-w", str(wave), "--stdin"] if espeak else
                                   [sys.executable, str(Path(__file__).with_name("espeak_local.py")), str(wave), variant, rate])
                        subprocess.run(command, input=text.encode("utf-8"), check=True)
                        raw_buf, raw_sr = sf.read(wave, dtype="float32")
                else:
                    if kokoro is None:
                        import onnxruntime as ort
                        from kokoro_onnx import Kokoro
                        from core.runtime import THREADS
                        options = ort.SessionOptions()
                        options.intra_op_num_threads = int(THREADS)
                        options.inter_op_num_threads = 1
                        session = ort.InferenceSession(model_path, sess_options=options, providers=["CPUExecutionProvider"])
                        kokoro = Kokoro.from_session(session, voices_path)
                    raw_buf, raw_sr = kokoro.create(text, voice=shot_voice, speed=shot_speed, lang=shot_language)
                # Recorded takes can have externally timed word cues. Preserve their offsets.
                prepared = raw_buf if active == "file" else _trim_silence(np.asarray(raw_buf, dtype=np.float32), raw_sr)
                audio = _resample_clean(prepared, raw_sr, target_sr)
                with TemporaryDirectory(prefix="take-", dir=takes_dir) as tmp:
                    staged = Path(tmp) / "take.wav"
                    sf.write(staged, audio, target_sr, subtype="PCM_16")
                    staged.replace(wav_path)
                cache_index[sid] = key
            speech_dur = len(audio) / float(target_sr)
            tail_pad = 0.35 + xfade_dur
            raw_needed = max(authored_dur, lead_in + speech_dur + tail_pad)
            frames = max(1, math.ceil(raw_needed * fps))
            eff_dur = frames / float(fps)
            shot["duration_sec"] = eff_dur
            shot["_frames"] = frames

            takes_info.append({
                "shot_id": sid,
                "shot_index": idx,
                "text": text,
                "wav_path": str(wav_path),
                "provider": active,
                "word_timing_file": shot.get("word_timing_file"),
                "take_sha": key,
                "shot_dur_sec": round(eff_dur, 4),
                "authored_dur_sec": round(authored_dur, 4),
                "speech_dur_sec": speech_dur,
                "fits_shot": True,
            })
        else:
            frames = max(1, int(round(authored_dur * fps)))
            eff_dur = frames / float(fps)
            shot["duration_sec"] = eff_dur
            shot["_frames"] = frames
            takes_info.append({
                "shot_id": sid,
                "shot_index": idx,
                "text": "",
                "wav_path": None,
                "take_sha": "",
                "shot_dur_sec": round(eff_dur, 4),
                "authored_dur_sec": round(authored_dur, 4),
                "speech_dur_sec": 0.0,
                "fits_shot": True,
            })

    timeline, total_frames = plan_timeline(shots, fps)
    for timing, take in zip(timeline, takes_info):
        start = timing["start"] / fps
        take["shot_start_sec"] = start
        take["speech_start_sec"] = start + (lead_in if take["wav_path"] else 0.0)

    write_json_atomic(cache_index_path, cache_index)

    total_dur = total_frames / fps
    total_samples = int(round(total_dur * target_sr))
    timeline = np.zeros(total_samples, dtype=np.float32)

    for info in takes_info:
        if not info["wav_path"]:
            continue
        buf, _ = sf.read(info["wav_path"], dtype="float32")
        if buf.ndim > 1:
            buf = buf.mean(axis=1)
        start_idx = int(round(info["speech_start_sec"] * target_sr))
        end_idx = min(total_samples, start_idx + len(buf))
        if end_idx > start_idx:
            timeline[start_idx:end_idx] += buf[: end_idx - start_idx]

    peak = float(np.max(np.abs(timeline))) if len(timeline) else 0.0
    if peak > 0.95:
        timeline = timeline * (0.95 / peak)

    full_wav = out_dir / "narration_full.wav"
    sf.write(str(full_wav), timeline, target_sr, subtype="PCM_16")
    manifest = {"total_sec": total_dur, "sample_rate": target_sr, "fps": fps, "narration_full": str(full_wav), "takes": takes_info}
    (out_dir / "narration_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest
