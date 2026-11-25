"""Deterministic procedural NumPy sound design, ducked ambient score, and 2-pass EBU R128 mastering."""
import json
import math
import re
import subprocess
import zlib
from pathlib import Path
from tempfile import TemporaryDirectory

import numpy as np
import soundfile as sf
from scipy.ndimage import uniform_filter1d
from scipy.signal import butter, sosfilt

from core.runtime import tool

FFMPEG_BIN = tool('FFMPEG_BIN', 'ffmpeg')


def _noise_band(rng, n, sr, low, high):
    return sosfilt(butter(2, [low, high], fs=sr, btype="bandpass", output="sos"), rng.standard_normal(n))


def _synth_cue(kind: str, dur: float, sr: int, intensity: float = 1.0) -> np.ndarray:
    n = max(1, int(round(dur * sr)))
    t = np.linspace(0.0, dur, n, endpoint=False, dtype=np.float32)
    seed = zlib.crc32(f"{kind}:{dur:.3f}".encode("utf-8"))
    rng = np.random.default_rng(seed)

    if kind == "impact":
        freq = 120.0 * np.exp(-t * 9.0) + 34.0
        sub = np.sin(2 * np.pi * np.cumsum(freq) / sr) * np.exp(-t * 4.5)
        crack = rng.normal(0.0, 1.0, n).astype(np.float32) * np.exp(-t * 28.0) * 0.45
        sig = (sub * 0.9 + crack) * 0.85
    elif kind == "whoosh":
        noise = rng.normal(0.0, 1.0, n).astype(np.float32)
        env = np.sin(np.pi * (t / max(1e-4, dur))) ** 1.6
        sweep = np.sin(2 * np.pi * np.cumsum(140.0 + 360.0 * np.sin(np.pi * t / dur)) / sr)
        sig = (0.55 * noise + 0.45 * sweep) * env * 0.55
    elif kind == "charge":
        f = 75.0 + 210.0 * (t / max(1e-4, dur)) ** 1.8
        hum = np.sin(2 * np.pi * np.cumsum(f) / sr) + 0.4 * np.sin(4 * np.pi * np.cumsum(f) / sr)
        env = np.minimum(1.0, t / 0.15) * (0.4 + 0.6 * (t / max(1e-4, dur))) * np.maximum(0.0, 1.0 - np.maximum(0.0, t - (dur - 0.12)) / 0.12)
        sig = hum * env * 0.45
    elif kind == "electric":
        crackle = rng.normal(0.0, 1.0, n).astype(np.float32)
        bursts = (np.sin(2 * np.pi * t * 19.0) > 0.35).astype(np.float32)
        sig = crackle * bursts * np.sin(np.pi * t / max(1e-4, dur)) * 0.42
    elif kind == "fabric":
        env = np.sin(np.pi * t / dur) ** 1.5
        sig = _noise_band(rng, n, sr, 220, 2100) * env * .58
    elif kind == "step":
        body = np.sin(2 * np.pi * (73*t + 6*(1-np.exp(-t*18)))) * np.exp(-t*20)
        grit = _noise_band(rng, n, sr, 310, 4300) * np.exp(-t*38)
        sig = body*.60 + grit*.43
    elif kind == "servo":
        cycles = 92*t + 8*np.sin(t*7)
        hum = np.sin(2*np.pi*cycles) + .24*np.sin(6*np.pi*cycles)
        grit = _noise_band(rng, n, sr, 370, 1750)
        sig = (hum*.48+grit*.18) * np.sin(np.pi*t/dur)**1.7
    elif kind == "spark":
        grit = _noise_band(rng, n, sr, 1700, 8700)
        hits = np.maximum(0, np.cos(t*149 + np.sin(t*33))-.41)
        sig = grit * hits * np.exp(-t*5.9)
    else:
        tone = np.sin(2 * np.pi * 880.0 * t) + 0.5 * np.sin(2 * np.pi * 1320.0 * t)
        sig = tone * np.exp(-t * 14.0) * 0.35

    edge = min(n // 2, max(1, int(.004 * sr)))
    if edge:
        ramp = np.linspace(0, 1, edge)
        sig[:edge] *= ramp
        sig[-edge:] *= ramp[::-1]
    return (sig * float(intensity)).astype(np.float32)


def _synth_music_bed(total_dur: float, sr: int, mood: str = "cosmic") -> np.ndarray:
    n = int(round(total_dur * sr))
    t = np.linspace(0.0, total_dur, n, endpoint=False, dtype=np.float32)
    if mood == "relay":
        ring = np.sin(2*np.pi*58*t + .48*np.sin(2*np.pi*.23*t))
        harmonic = .31*np.sin(2*np.pi*88*t) + .17*np.sin(2*np.pi*174.4*t)
        fan = _noise_band(np.random.default_rng(1834), n, sr, 82, 320)
        env = np.minimum(1.,t/.36)*np.minimum(1.,np.maximum(0.,total_dur-t)/.63)
        return ((ring*.125 + harmonic*.125 + fan*.16) * 1.65 * env * (.88+.12*np.sin(t*2.1))).astype(np.float32)
    roots = (55.0, 82.41, 110.0, 164.81) if mood == "cosmic" else (65.41, 98.0, 130.81, 196.0)
    bed = np.zeros(n, dtype=np.float32)
    for i, f in enumerate(roots):
        mod = 1.0 + 0.004 * np.sin(2 * np.pi * (0.25 + i * 0.1) * t)
        bed += np.sin(2 * np.pi * f * mod * t) * (0.35 / (i + 1))
    pulse = 0.72 + 0.28 * np.sin(2 * np.pi * 1.5 * t)
    fade_in = np.minimum(1.0, t / 0.4)
    fade_out = np.minimum(1.0, np.maximum(0.0, total_dur - t) / 0.6)
    return (bed * pulse * fade_in * fade_out * 0.26).astype(np.float32)


def _file_audio(path, sr, channels, max_seconds):
    with TemporaryDirectory(prefix="audio-") as tmp:
        decoded = Path(tmp) / "audio.wav"
        subprocess.run([FFMPEG_BIN, "-nostdin", "-v", "error", "-y", "-i", str(path), "-vn",
                        "-t", str(max_seconds), "-ar", str(sr), "-ac", str(channels),
                        "-c:a", "pcm_f32le", str(decoded)], check=True)
        return sf.read(decoded, dtype="float32")[0]


def build_master_audio(
    episode: dict,
    narration_manifest: dict,
    out_dir: Path,
    sr: int = 48000,
    exact_total_sec: float | None = None,
    shot_timings: dict | None = None,
    episode_dir: Path = Path("."),
) -> dict:
    """
    Mixes narration, deterministic SFX cues (supports both at_sec and normalized at_norm 0..1),
    and ducked synth music, then applies R128-measured gain with true-peak headroom.
    """
    out_dir = Path(out_dir)
    total_dur = float(narration_manifest["total_sec"] if exact_total_sec is None else exact_total_sec)
    n_samples = max(1, int(round(total_dur * sr)))

    narr_path = Path(narration_manifest["narration_full"])
    narr, _ = sf.read(narr_path, dtype="float32")
    if narr.ndim > 1:
        narr = narr.mean(axis=1)
    if len(narr) < n_samples:
        narr = np.pad(narr, (0, n_samples - len(narr)))
    else:
        narr = narr[:n_samples]

    env_win = int(0.08 * sr)
    speech_env = uniform_filter1d(np.abs(narr), max(1, env_win), mode="constant")
    duck = 1.0 - np.clip(speech_env * 8.5, 0.0, 0.72)

    mood = episode.get("audio_mood", "cosmic")
    if episode.get("music_file"):
        bed = _file_audio(Path(episode_dir) / episode["music_file"], sr, 2, total_dur)
        bed = np.pad(bed[:n_samples], ((0, max(0, n_samples - len(bed))), (0, 0)))
        music = bed * float(episode.get("music_gain", 0.20)) * duck[:, None]
    else:
        bed = _synth_music_bed(total_dur, sr, mood=mood) * duck
        music = np.column_stack((bed, bed))

    sfx_L = np.zeros(n_samples, dtype=np.float32)
    sfx_R = np.zeros(n_samples, dtype=np.float32)

    default_timings = {
        t["shot_id"]: {"start": float(t["shot_start_sec"]), "dur": float(t["shot_dur_sec"])}
        for t in narration_manifest.get("takes", [])
    }
    timing_map = shot_timings or default_timings

    cues = list(episode.get("sfx_cues", []))
    for sh in episode.get("shots", []):
        st_info = timing_map.get(sh["id"], {"start": 0.0, "dur": float(sh.get("duration_sec", 4.0))})
        st = st_info["start"]
        sdur = st_info["dur"]
        for c in sh.get("sfx_cues", []):
            c2 = dict(c)
            rel = float(c["at_norm"]) * sdur if "at_norm" in c else float(c.get("at_sec", 0.0))
            c2["at_sec"] = st + rel
            cues.append(c2)

    for c in cues:
        at = float(c.get("at_sec", 0.0))
        cdur = float(c.get("duration_sec", 0.8))
        if cdur <= 0:
            continue
        pan = float(c.get("pan", 0.0))
        if c.get("file"):
            sig = _file_audio(Path(episode_dir) / c["file"], sr, 1, cdur) * float(c.get("gain", 0.55))
        else:
            sig = _synth_cue(c.get("type", "whoosh"), cdur, sr, float(c.get("gain", 0.55)))
        start = int(round(at * sr))
        idx0 = max(0, start)
        idx1 = min(n_samples, start + len(sig))
        if idx1 > idx0:
            chunk = sig[idx0 - start : idx1 - start]
            gL = np.sqrt(0.5 * (1.0 - max(-1.0, min(1.0, pan))))
            gR = np.sqrt(0.5 * (1.0 + max(-1.0, min(1.0, pan))))
            sfx_L[idx0:idx1] += chunk * gL
            sfx_R[idx0:idx1] += chunk * gR

    mix_L = narr * 0.95 + music[:, 0] + sfx_L
    mix_R = narr * 0.95 + music[:, 1] + sfx_R
    stereo = np.stack([mix_L, mix_R], axis=1)
    raw_mix = out_dir / "pre_master_mix.wav"
    master_wav = out_dir / "master_audio.wav"
    try:
        # Float preserves transient headroom before gain is calculated.
        sf.write(str(raw_mix), stereo, sr, subtype="FLOAT")
        source_stats = measure_loudness(raw_mix)
        integrated = float(source_stats["input_i"])
        true_peak = float(source_stats["input_tp"])
        desired_gain = -14.0 - integrated if math.isfinite(integrated) else 0.0
        peak_cap = -2.3 - true_peak if math.isfinite(true_peak) else desired_gain
        gain = min(desired_gain, peak_cap)
        subprocess.run([
            FFMPEG_BIN, "-hide_banner", "-loglevel", "error", "-y", "-i", str(raw_mix),
            "-af", f"volume={gain:.6f}dB", "-ar", str(sr), "-c:a", "pcm_s24le", str(master_wav),
        ], check=True)
        measured = measure_loudness(master_wav)
        loud_stats = {
            "normalization_type": "linear_peak_limited" if gain < desired_gain else "linear",
            "target_i": -14.0, "target_tp": -2.3, "gain_db": round(gain, 2),
            "input_i": source_stats["input_i"], "input_tp": source_stats["input_tp"],
            "output_i": measured["input_i"], "output_tp": measured["input_tp"],
            "output_lra": measured["input_lra"],
        }
    finally:
        raw_mix.unlink(missing_ok=True)

    return {
        "master_audio": str(master_wav),
        "total_sec": total_dur,
        "sfx_count": len(cues),
        "loudnorm": loud_stats,
    }


def measure_loudness(path):
    result = subprocess.run([
        FFMPEG_BIN, "-hide_banner", "-i", str(path), "-vn",
        "-af", "loudnorm=I=-14:TP=-2.3:LRA=11:print_format=json", "-f", "null", "-",
    ], capture_output=True, text=True, check=True)
    match = re.search(r'\{[^{}]*"input_i"[^{}]*\}', result.stderr)
    if not match:
        raise RuntimeError(f"FFmpeg did not return EBU R128 statistics for {path}")
    return json.loads(match.group())
