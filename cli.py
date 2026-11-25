"""Portable AnimationLab episode orchestration."""
import argparse
from contextlib import contextmanager
import json
import os
import shutil
import subprocess
import sys
import time
from tempfile import TemporaryDirectory
from pathlib import Path

PIPELINE_ROOT = Path(__file__).resolve().parent
if str(PIPELINE_ROOT) not in sys.path:
    sys.path.insert(0, str(PIPELINE_ROOT))

from audio.tts_kokoro import generate_narration_takes
from audio.caption_timing import align_narration
from audio.build_ass_subtitles import build_ass_subtitles
from audio.synth_sfx import build_master_audio, measure_loudness
from core.timeline import plan_timeline
from renderers.adapters import render_blender_shot, render_godot_shot
from renderers.cache import RenderInputs, write_json_atomic
from renderers.media import SDR_TAGS, require_exact_video, video_filter

from core.profiles import PROFILES, settings
from core.runtime import THREADS, capabilities, choose_engine, tool
from renderers.cpu import render_cpu_shot

FFMPEG_BIN = tool("FFMPEG_BIN", "ffmpeg")
FFPROBE_BIN = tool("FFPROBE_BIN", "ffprobe")


def cmd_doctor(args):
    report = capabilities(probe_browser=not args.cpu_only)
    print(json.dumps(report, indent=2))
    if not report["ffmpeg"]:
        raise SystemExit("FFmpeg 5.1+ with ffprobe, libx264, AAC, ASS, xfade and loudnorm is required.")


def cmd_init(args):
    tpl = args.template
    src_tpl = PIPELINE_ROOT / ("examples" if tpl == "beacon" else "templates") / tpl
    if not src_tpl.is_dir():
        raise SystemExit(f"Unknown template '{tpl}'. Available: {[d.name for d in (PIPELINE_ROOT / 'templates').iterdir() if d.is_dir()]}")
    dst = Path(args.dir).resolve()
    if dst.exists() and any(dst.iterdir()):
        raise SystemExit(f"Target directory already exists and is non-empty: {dst}")
    shutil.copytree(src_tpl, dst, dirs_exist_ok=True, ignore=shutil.ignore_patterns("out", "work", "__pycache__"))
    ep_file = dst / "episode.json"
    if ep_file.exists():
        ep = json.loads(ep_file.read_text(encoding="utf-8"))
        ep["episode_id"] = args.id or ep["episode_id"]
        if args.title:
            ep["title"] = args.title
        ep_file.write_text(json.dumps(ep, indent=2), encoding="utf-8")
    print(f"[INIT OK] Created episode project at {dst} (template={tpl})")


@contextmanager
def _render_lock(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a+b") as lock:
        lock.seek(0)
        if os.name == "nt":
            import msvcrt
            acquire = lambda: msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
            release = lambda: msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl
            acquire = lambda: fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            release = lambda: fcntl.flock(lock, fcntl.LOCK_UN)
        try:
            acquire()
        except OSError as exc:
            raise RuntimeError(f"Another render is already using {path.parent}") from exc
        try:
            yield
        finally:
            lock.seek(0)
            release()


def render_shots_and_audio(ep_dir, force=False, profile="balanced", cpu_only=False):
    work_dir = ep_dir / "work"
    with _render_lock(work_dir / profile / "render.lock"):
        return _render_episode(ep_dir, force, profile, cpu_only)


def _render_episode(ep_dir, force, profile, cpu_only):
    ep = json.loads((ep_dir / "episode.json").read_text(encoding="utf-8"))
    ep_id = ep["episode_id"]
    quality = settings(ep, profile)
    w, h, fps = (quality[key] for key in ("width", "height", "fps"))
    ids = [shot["id"] for shot in ep["shots"]]
    if not ids or len(ids) != len(set(ids)):
        raise ValueError("An episode requires nonempty, unique shot IDs")
    for stem in [ep_id, *ids]:
        if not stem or stem in (".", "..") or Path(stem).name != stem or Path(stem).is_reserved():
            raise ValueError(f"Invalid episode or shot filename {stem!r}")
    requested = ep["shots"]
    needs_web = any(s.get("engine") in (None, "auto", "web3d", "anime2d", "pixi")
                    or set(s.get("fallbacks", [])) & {"web3d", "anime2d", "pixi"} for s in requested)
    report = capabilities(probe_browser=needs_web and not cpu_only)
    if not report["ffmpeg"]:
        raise RuntimeError("FFmpeg toolchain unavailable. Run doctor and bootstrap.")
    available = report["engines"]
    if cpu_only:
        available = {key: value and key == "cpu2d" for key, value in available.items()}
    ep["shots"] = [choose_engine(s, available) for s in requested]
    print(f"[PROFILE] {profile}: {w}x{h} at {fps} fps, {THREADS} encoding threads", flush=True)

    work_dir = ep_dir / "work" / profile
    out_dir = ep_dir / "out" / profile
    shots_out = work_dir / "shots"
    audio_dir = work_dir / "audio"
    shots_out.mkdir(parents=True, exist_ok=True)
    audio_dir.mkdir(parents=True, exist_ok=True)
    out_dir.mkdir(parents=True, exist_ok=True)

    state_file = work_dir / "episode_state.json"
    try:
        state = json.loads(state_file.read_text(encoding="utf-8"))
        if not isinstance(state.get("shots"), dict):
            raise ValueError("Missing shot index")
    except (OSError, ValueError, AttributeError):
        state = {"shots": {}}

    t_total_start = time.perf_counter()

    # 1. Narration takes first with frame-quantized shot extension
    has_narration = any((s.get("narration") or "").strip() for s in ep["shots"])
    t_audio0 = time.perf_counter()
    narr_manifest = generate_narration_takes(
        ep["shots"], audio_dir,
        voice=ep.get("voice", "am_michael"),
        speed=float(ep.get("voice_speed", 1.08)),
        fps=fps, episode_dir=ep_dir, provider=ep.get("tts", "auto"),
        language=ep.get("voice_language", "en-us"),
    )
    words = align_narration(narr_manifest, ep_dir) if has_narration else {"method": "none", "words": []}
    audio_prep_sec = round(time.perf_counter() - t_audio0, 2)

    timeline, total_frames = plan_timeline(ep["shots"], fps)
    exact_total_dur = total_frames / fps
    for sh, timing in zip(ep["shots"], timeline):
        sh["_start_sec"] = timing["start"] / fps
        sh["_total_sec"] = exact_total_dur
        sh["_profile"] = quality

    inputs = RenderInputs(ep_dir, PIPELINE_ROOT)
    shot_results = []
    cached_count = 0
    for sh, timing in zip(ep["shots"], timeline):
        sid = sh["id"]
        frames = timing["frames"]
        eng = sh["engine"]
        sh_hash = inputs.shot_hash({**sh, "_runtime": report["versions"], "_browser": report["browser"], "_tools": report["tools"]}, w, h, fps)
        mp4_path = shots_out / f"{sid}.mp4"
        metrics_path = shots_out / f"{sid}.metrics.json"
        cached = state["shots"].get(sid, {})
        metrics = None

        if not force and cached.get("hash") == sh_hash and mp4_path.is_file():
            try:
                require_exact_video(mp4_path, w, h, fps, frames)
                metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
                if not isinstance(metrics, dict):
                    metrics = None
                    raise ValueError("Invalid shot metrics")
            except (OSError, ValueError, subprocess.CalledProcessError):
                pass
            else:
                metrics["cached"] = True
                cached_count += 1
                print(f"[SKIP] Shot {sid} unchanged ({frames} frames)")

        if metrics is None:
            print(f"=== Rendering shot {sid} [{eng}] {frames}f @ {w}x{h} ===", flush=True)
            with TemporaryDirectory(prefix="render-", dir=shots_out) as stage:
                staged = Path(stage) / mp4_path.name
                staged_metrics = Path(stage) / metrics_path.name
                if eng in ("web3d", "anime2d", "pixi"):
                    subprocess.run([
                        tool("NODE_BIN", "node"), str(PIPELINE_ROOT / "renderers" / "render_web_shot.mjs"),
                        "--episode-dir", str(ep_dir),
                        "--module", str((ep_dir / sh["scene_module"]).resolve()),
                        "--out", str(staged), "--metrics", str(staged_metrics),
                        "--w", str(w), "--h", str(h), "--fps", str(fps), "--frames", str(frames),
                        "--shot", json.dumps(sh), "--params", json.dumps(sh.get("params", {})),
                    ], check=True, env={**os.environ, "FFMPEG_BIN": FFMPEG_BIN})
                    metrics = json.loads(staged_metrics.read_text(encoding="utf-8"))
                elif eng == "godot":
                    project = (ep_dir / sh["godot_project"]).resolve()
                    metrics = render_godot_shot(
                        project, staged, w, h, fps, frames / fps,
                        scene_path=sh.get("scene_path"), params=sh.get("params"), quality=quality,
                    )
                elif eng == "blender":
                    script = (ep_dir / sh["blender_script"]).resolve()
                    blend = (ep_dir / sh["blend_file"]).resolve() if sh.get("blend_file") else None
                    metrics = render_blender_shot(script, staged, w, h, fps, frames, sh.get("params", {}), blend_file=blend, quality=quality)
                elif eng == "cpu2d":
                    metrics = render_cpu_shot((ep_dir / sh["cpu_script"]).resolve(), staged, w, h, fps, sh)
                else:
                    raise ValueError(f"Unsupported engine '{eng}' on shot {sid}")
                require_exact_video(staged, w, h, fps, frames)
                # Invalidate before replacing the pair so interruption never blesses new media with an old key.
                state["shots"].pop(sid, None)
                write_json_atomic(state_file, state)
                staged.replace(mp4_path)
                write_json_atomic(metrics_path, metrics)
            state["shots"][sid] = {"hash": sh_hash, "mp4": str(mp4_path)}
            write_json_atomic(state_file, state)

        shot_results.append({
            "id": sid, "engine": eng, "mp4": str(mp4_path),
            "start_frame": timing["start"], "frames": frames, "overlap_frames": timing["overlap"],
            "actual_dur": frames / fps, "metrics": metrics,
        })

    shot_timings = {
        item["id"]: {"start": item["start_frame"] / fps, "dur": item["actual_dur"]}
        for item in shot_results
    }

    ass_path = (
        build_ass_subtitles(words, audio_dir / "captions.ass", width=w, height=h, group_size=int(ep.get("subtitle_words", 3)), total_dur_sec=exact_total_dur)
        if has_narration else None
    )
    t_mix0 = time.perf_counter()
    audio_master = build_master_audio(ep, narr_manifest, audio_dir, exact_total_sec=exact_total_dur, shot_timings=shot_timings, episode_dir=ep_dir)
    audio_sec = round(audio_prep_sec + (time.perf_counter() - t_mix0), 2)

    t_asm0 = time.perf_counter()
    final_mp4 = out_dir / f"{ep_id}.mp4"
    contact_png = out_dir / "contact_sheet.png"
    with TemporaryDirectory(prefix="assemble-", dir=out_dir) as stage:
        staged_mp4 = Path(stage) / final_mp4.name
        staged_sheet = Path(stage) / contact_png.name
        assemble_episode(ep, shot_results, Path(audio_master["master_audio"]), ass_path, staged_mp4, w, h, fps, quality)
        require_exact_video(staged_mp4, w, h, fps, total_frames)
        asm_sec = round(time.perf_counter() - t_asm0, 2)
        qc_res = run_qc(ep, staged_mp4, staged_sheet, w, h)
        staged_mp4.replace(final_mp4)
        staged_sheet.replace(contact_png)
    total_sec = round(time.perf_counter() - t_total_start, 2)
    benchmark = {
        "episode_id": ep_id,
        "resolution": f"{w}x{h}",
        "fps": fps,
        "total_duration_sec": qc_res["ffprobe"].get("duration_sec", 0.0),
        "cached_shots_count": cached_count,
        "audio_pipeline_sec": audio_sec,
        "assembly_sec": asm_sec,
        "total_wall_sec": total_sec,
        "profile": profile,
        "threads": int(THREADS),
        "audio_stats": audio_master.get("loudnorm", {}),
        "caption_timing": words.get("method"),
        "narration_providers": sorted({take["provider"] for take in narr_manifest["takes"] if take.get("provider")}),
        "word_count": len(words.get("words", [])),
        "shots": shot_results,
        "qc": qc_res,
        "final_mp4": str(final_mp4),
        "contact_sheet": str(contact_png),
    }
    write_json_atomic(out_dir / "benchmark.json", benchmark)
    print(f"[PIPELINE DONE] {ep_id} -> {final_mp4} ({final_mp4.stat().st_size // 1024} KB) in {total_sec}s")


def assemble_episode(ep: dict, shot_results: list, master_wav: Path, ass_path: Path | None, out_mp4: Path, w: int, h: int, fps: int, quality):
    shots_cfg = ep["shots"]
    n = len(shot_results)
    cmd = [FFMPEG_BIN, "-y", "-loglevel", "error", "-filter_complex_threads", THREADS]
    for sr in shot_results:
        cmd.extend(["-threads", "1", "-i", sr["mp4"]])
    cmd.extend(["-i", str(master_wav)])

    exact_pts = f"settb=expr=1/{fps},setpts=N"
    pixel_format = "yuv444p" if any(s["overlap_frames"] for s in shot_results) else "yuv420p"
    transport = video_filter(w, h, pix_fmt=pixel_format)
    filters = [
        f"[{i}:v]{transport},fps={fps},{exact_pts}[v{i}]"
        for i in range(n)
    ]
    cur_label = "v0"
    for i, shot in enumerate(shot_results[:-1]):
        next_idx = i + 1
        next_label = f"v{next_idx}"
        out_label = f"vx{i}"
        overlap = shot["overlap_frames"]
        if overlap:
            transition = (shots_cfg[i].get("transition") or {})["type"]
            if not transition.replace("_", "").isalnum():
                raise ValueError(f"Invalid xfade transition {transition!r}")
            offset = shot_results[next_idx]["start_frame"] / fps
            filters.append(
                f"[{cur_label}][{next_label}]xfade=transition={transition}:"
                f"duration={overlap / fps:.9f}:offset={offset:.9f},{exact_pts}[{out_label}]"
            )
        else:
            filters.append(f"[{cur_label}][{next_label}]concat=n=2:v=1:a=0,{exact_pts}[{out_label}]")
        cur_label = out_label

    if ass_path and ass_path.exists():
        # An FFmpeg filtergraph can use a literal local filename across OSes.
        shutil.copyfile(ass_path, out_mp4.parent / "captions.ass")
        filters.append(f"[{cur_label}]ass=captions.ass[v_final]")
    else:
        filters.append(f"[{cur_label}]null[v_final]")

    cmd.extend([
        "-filter_complex", ";".join(filters),
        "-map", "[v_final]",
        "-map", f"{n}:a:0",
        "-r", str(fps),
        "-c:v", "libx264", "-threads", THREADS, "-preset", quality["preset"], "-crf", str(quality["crf"]),
        "-pix_fmt", "yuv420p", *SDR_TAGS,
        "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
        str(out_mp4),
    ])
    subprocess.run(cmd, cwd=out_mp4.parent, check=True)


def run_qc(ep: dict, mp4_path: Path, contact_png: Path, w: int = 1080, h: int = 1920) -> dict:
    if not mp4_path.exists():
        raise FileNotFoundError(f"Output MP4 missing: {mp4_path}")
    pr = subprocess.check_output(
        [FFPROBE_BIN, "-v", "error", "-show_entries", "format=duration,size:stream=duration,codec_name,codec_type,width,height,r_frame_rate,nb_frames,color_space,color_range,color_transfer,color_primaries,channels", "-of", "json", str(mp4_path)],
        text=True,
    )
    info = json.loads(pr)
    v_st = next((s for s in info.get("streams", []) if s.get("codec_type") == "video"), {})
    a_st = next((s for s in info.get("streams", []) if s.get("codec_type") == "audio"), {})
    dur = float(info.get("format", {}).get("duration", 0.0))

    subprocess.run([FFMPEG_BIN, "-v", "error", "-xerror", "-threads", THREADS, "-i", str(mp4_path), "-f", "null", "-"], check=True)

    # Sample 6 evenly spread true-PTS frames across [4% .. 92%] of video duration (no fps filter PTS reset!)
    tw = 360
    th = max(200, int(round(360 * (h / max(1, w)))))
    step = max(0.15, (dur * 0.88) / 5.0)
    t0 = dur * 0.04
    filter_chain = (
        f"select='gte(t,{t0:.3f})*(isnan(prev_selected_t)+gte(t-prev_selected_t,{step:.4f}))',"
        f"scale={tw}:{th},tile=3x2"
    )
    subprocess.run([
        FFMPEG_BIN, "-y", "-v", "error", "-threads", "2", "-i", str(mp4_path),
        "-filter_threads", THREADS, "-vf", filter_chain,
        "-frames:v", "1", "-threads", "1", str(contact_png),
    ], check=True)
    if not a_st or a_st.get("codec_name") != "aac":
        raise ValueError("Missing AAC audio in final output")
    audio_seconds = float(a_st["duration"])
    video_seconds = float(v_st["duration"])
    if abs(audio_seconds - video_seconds) > 0.025:
        raise ValueError(f"Audio duration {audio_seconds:.3f}s and picture duration {video_seconds:.3f}s disagree")
    motion = subprocess.run([
        FFMPEG_BIN, "-hide_banner", "-nostats", "-threads", "2", "-i", str(mp4_path),
        "-filter_threads", THREADS, "-vf",
        "scale=160:-2,blackdetect=d=0.4:pix_th=0.10,freezedetect=n=-50dB:d=0.65",
        "-an", "-f", "null", "-",
    ], capture_output=True, text=True, check=True)
    loudness = measure_loudness(mp4_path)
    motion_flags = [line.strip() for line in motion.stderr.splitlines()
                    if "black_start:" in line or "freeze_start:" in line]

    return {
        "ffprobe": {
            "duration_sec": round(dur, 3),
            "size_bytes": int(info.get("format", {}).get("size", 0)),
            "video_codec": v_st.get("codec_name"),
            "width": v_st.get("width"),
            "height": v_st.get("height"),
            "r_frame_rate": v_st.get("r_frame_rate"),
            "frames": int(v_st["nb_frames"]) if v_st.get("nb_frames", "").isdigit() else None,
            "color_space": v_st.get("color_space"),
            "color_range": v_st.get("color_range"),
            "audio_codec": a_st.get("codec_name"),
            "audio_channels": a_st.get("channels"),
            "audio_duration_sec": audio_seconds,
            "video_duration_sec": video_seconds,
        },
        "decode_ok": True,
        "aac_integrated_lufs": loudness["input_i"],
        "aac_true_peak_dbtp": loudness["input_tp"],
        "motion_flags": motion_flags,
    }


def main():
    p = argparse.ArgumentParser(prog="animpipe", description="AnimationLab Production Pipeline CLI")
    sub = p.add_subparsers(dest="cmd", required=True)

    p_doc = sub.add_parser("doctor", help="Probe available CPU and optional renderers")
    p_doc.add_argument("--cpu-only", action="store_true")

    p_init = sub.add_parser("init", help="Initialize a new episode from a template")
    p_init.add_argument("dir", help="Target directory for new episode")
    p_init.add_argument("--template", default="beacon", choices=["beacon", "explainer3d", "anime2d", "hybrid"])
    p_init.add_argument("--id", default="", help="Episode ID")
    p_init.add_argument("--title", default="", help="Episode title")

    p_ren = sub.add_parser("render", help="Render shots, narration, SFX, subtitles, assemble & QC")
    p_ren.add_argument("dir", help="Episode directory containing episode.json")
    p_ren.add_argument("--force", action="store_true", help="Ignore shot cache and re-render all shots")
    p_ren.add_argument("--cpu-only", action="store_true", help="Limit engine selection to authored CPU 2D")
    p_ren.add_argument("--draft", dest="profile", action="store_const", const="draft")
    p_ren.add_argument("--no-whisperx", action="store_true", help=argparse.SUPPRESS)
    p_ren.add_argument("--allow-red-qc", action="store_true", help=argparse.SUPPRESS)
    p_qc = sub.add_parser("qc", help="Decode and inspect a rendered MP4")
    p_qc.add_argument("dir")
    p_est = sub.add_parser("estimate", help="Estimate wall time using a measured profile benchmark")
    p_est.add_argument("benchmark", type=Path)
    p_est.add_argument("--seconds", type=float, default=60)
    for command in (p_ren, p_qc):
        command.add_argument("--profile", choices=PROFILES, default="balanced")

    args = p.parse_args()
    if args.cmd == "doctor":
        cmd_doctor(args)
    elif args.cmd == "init":
        cmd_init(args)
    elif args.cmd == "render":
        render_shots_and_audio(Path(args.dir).resolve(), args.force, args.profile, args.cpu_only)
    elif args.cmd == "qc":
        ep_dir = Path(args.dir).resolve()
        ep = json.loads((ep_dir / "episode.json").read_text(encoding="utf-8"))
        quality = settings(ep, args.profile)
        out = ep_dir / "out" / args.profile
        res = run_qc(ep, out / f"{ep['episode_id']}.mp4", out / "contact_sheet.png", quality["width"], quality["height"])
        print(json.dumps(res, indent=2))
    elif args.cmd == "estimate":
        baseline = json.loads(args.benchmark.read_text(encoding="utf-8"))
        if args.seconds <= 0 or baseline["cached_shots_count"] or not baseline["total_duration_sec"]:
            p.error("Estimate requires positive duration and a full, uncached measurement")
        estimate = args.seconds * baseline["total_wall_sec"] / baseline["total_duration_sec"]
        print(f"{estimate:.1f}s at profile {baseline['profile']} for equivalent scene complexity and engine mix")


if __name__ == "__main__":
    main()
