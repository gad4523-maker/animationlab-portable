#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

cpu_only=0
kokoro=0
godot=0
blender=0
smoke=0
for option in "$@"; do
  case "$option" in
    --cpu-only) cpu_only=1 ;;
    --kokoro) kokoro=1 ;;
    --godot) godot=1 ;;
    --blender) blender=1 ;;
    --smoke) smoke=1 ;;
    --help) echo 'Usage: bash bootstrap.sh [--cpu-only] [--kokoro] [--godot] [--blender] [--smoke]'; exit ;;
    *) echo "Unknown option: $option" >&2; exit 2 ;;
  esac
done

export ANIM_THREADS="${ANIM_THREADS:-2}"
export OPENBLAS_NUM_THREADS="$ANIM_THREADS"
export OMP_NUM_THREADS="$ANIM_THREADS"
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$ROOT/.runtime/browsers}"
export PIP_CACHE_DIR="${PIP_CACHE_DIR:-$ROOT/.runtime/pip-cache}"
export npm_config_cache="${npm_config_cache:-$ROOT/.runtime/npm-cache}"
mkdir -p .runtime/bin
export PATH="$ROOT/.runtime/bin:$PATH"
if command -v flock >/dev/null; then
  exec 9>.runtime/bootstrap.lock
  flock 9
fi

available_kib="$(df -Pk "$ROOT" | awk 'NR==2 {print $4}')"
mem_kib="$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)"
printf 'Host %s | %s | %s CPU(s) | %s MiB host RAM available | %s MiB disk free\n' \
  "$(uname -smr)" "$(sed -n 's/^PRETTY_NAME=//p' /etc/os-release | tr -d '"')" \
  "$(nproc)" "$((mem_kib / 1024))" "$((available_kib / 1024))"
if [[ -r /sys/fs/cgroup/memory.max ]]; then
  printf 'Cgroup memory limit: %s bytes (max means unrestricted)\n' "$(cat /sys/fs/cgroup/memory.max)"
fi
if (( available_kib < 600 * 1024 )); then
  echo 'Need 600 MiB of free workspace for installation and a small render.' >&2
  exit 1
fi
if (( mem_kib < 700 * 1024 )); then
  echo 'Low available memory. Close other jobs or use --cpu-only.' >&2
fi

apt_ready=0
apt_add() {
  local -a runner
  if ! command -v apt-get >/dev/null; then return 1; fi
  if (( EUID == 0 )); then
    runner=(apt-get)
  elif command -v sudo >/dev/null && sudo -n true 2>/dev/null; then
    runner=(sudo -n apt-get)
  else
    printf 'System installation unavailable for: %s\n' "$*" >&2
    return 1
  fi
  if (( ! apt_ready )); then
    "${runner[@]}" -o Acquire::Retries=2 update -qq || return 1
    apt_ready=1
  fi
  "${runner[@]}" -o Acquire::Retries=2 install -y -qq --no-install-recommends "$@"
}

if ! command -v python3 >/dev/null || ! python3 -c 'import sys; assert sys.version_info >= (3,11)' 2>/dev/null; then
  apt_add python3 python3-venv || { echo 'Python 3.11+ is required.' >&2; exit 1; }
fi
if ! python3 -c 'from core.runtime import capabilities; raise SystemExit(not capabilities(probe_browser=False)["ffmpeg"])'; then
  apt_add ffmpeg fonts-dejavu-core || { echo 'Provide FFmpeg 5.1+ and FFprobe on PATH or set FFMPEG_BIN/FFPROBE_BIN.' >&2; exit 1; }
fi
if command -v fc-list >/dev/null && [[ -z "$(fc-list | head -c 200)" ]]; then
  apt_add fonts-dejavu-core || echo 'Provide fonts for legible ASS captions.' >&2
fi

PY="$ROOT/.runtime/venv/bin/python"
if [[ ! -x "$PY" ]] || ! "$PY" -m pip --version >/dev/null 2>&1; then
  if ! python3 -m venv .runtime/venv; then
    if apt_add python3-venv; then
      python3 -m venv .runtime/venv
    elif command -v uv >/dev/null; then
      uv venv --allow-existing --seed --python "$(command -v python3)" .runtime/venv
    elif python3 -m pip --version >/dev/null 2>&1; then
      python3 -m pip install --disable-pip-version-check --target .runtime/virtualenv-bootstrap 'virtualenv==20.31.2'
      PYTHONPATH="$ROOT/.runtime/virtualenv-bootstrap" python3 -m virtualenv --no-download \
        --app-data "$ROOT/.runtime/virtualenv-cache" .runtime/venv
    else
      echo 'Python lacks ensurepip. Supply python3-venv, a usable pip, or uv.' >&2
      exit 1
    fi
  fi
fi
python_in_sync() {
  "$PY" - "$@" <<'PY_CHECK'
import importlib.metadata as metadata
from pathlib import Path
import sys

for name in sys.argv[1:]:
    for pin in Path(name).read_text().splitlines():
        if "==" not in pin:
            continue
        package, version = pin.split("==", 1)
        try:
            if metadata.version(package) != version:
                raise SystemExit(1)
        except metadata.PackageNotFoundError:
            raise SystemExit(1) from None
PY_CHECK
}
if ! python_in_sync requirements.txt || ! "$PY" -c 'import numpy, scipy, soundfile, PIL' 2>/dev/null; then
  "$PY" -m pip install --disable-pip-version-check --only-binary=:all: -r requirements.txt
fi

if ! command -v "${ESPEAK_BIN:-espeak-ng}" >/dev/null && ! command -v espeak >/dev/null; then
  if ! "$PY" -c 'import espeakng_loader' 2>/dev/null; then
    "$PY" -m pip install --disable-pip-version-check --only-binary=:all: espeakng-loader==0.2.4 ||
      apt_add espeak-ng || echo 'eSpeak disabled. Recorded narration remains available.' >&2
  fi
fi
if (( kokoro )); then
  if { python_in_sync requirements-kokoro.txt || "$PY" -m pip install --disable-pip-version-check --only-binary=:all: -r requirements.txt -r requirements-kokoro.txt; } &&
     "$PY" -m audio.kokoro_setup &&
     "$PY" -c 'import kokoro_onnx, onnxruntime'; then
    echo 'Kokoro CPU assets installed.'
  else
    echo 'Optional Kokoro installation failed. Use eSpeak or recorded narration.' >&2
  fi
fi
if (( blender )) && ! "${BLENDER_BIN:-blender}" --version >/dev/null 2>&1; then
  apt_add blender || echo 'Blender disabled. Supply Blender 3.4+ on PATH or set BLENDER_BIN.' >&2
fi
if (( godot )); then
  if ! "$PY" -m renderers.install_godot; then
    echo 'Optional Godot installation failed.' >&2
  fi
  if [[ -z "${DISPLAY:-}" ]] && ! command -v xvfb-run >/dev/null; then
    apt_add xvfb xauth libgl1-mesa-dri || echo 'Godot movie capture requires DISPLAY or xvfb-run and Mesa software GL.' >&2
  fi
fi

node_bin="${NODE_BIN:-node}"
npm_bin="${NPM_BIN:-npm}"
web_ready=0
if (( ! cpu_only )); then
  if ! "$node_bin" -e 'process.exit(Number(process.versions.node.split(".")[0]) < 18)' || ! "$npm_bin" --version >/dev/null 2>&1; then
    apt_add nodejs npm || echo 'Node 18+ / npm unavailable. CPU 2D remains enabled.' >&2
  fi
  if "$node_bin" -e 'process.exit(Number(process.versions.node.split(".")[0]) < 18)' && "$npm_bin" --version >/dev/null 2>&1; then
    lock_sha="$("$PY" -c 'import hashlib; print(hashlib.sha256(open("package-lock.json","rb").read()).hexdigest())')"
    if [[ "$(cat .runtime/npm-lock 2>/dev/null || :)" != "$lock_sha" ]] ||
       ! "$node_bin" -e 'require("playwright-core"); require("esbuild")' >/dev/null 2>&1; then
      if "$npm_bin" ci --no-audit --no-fund; then
        printf '%s' "$lock_sha" > .runtime/npm-lock
      else
        echo 'Optional npm install failed. CPU 2D remains enabled.' >&2
      fi
    fi
    if "$node_bin" -e 'require("playwright-core")' >/dev/null 2>&1; then
      web_ready=1
      if [[ ! -s dist/pixi.mjs || ! -s dist/probe-pixi.js || package-lock.json -nt dist/pixi.mjs ||
            rigby/pixi.mjs -nt dist/pixi.mjs || rigby/build.mjs -nt dist/pixi.mjs ||
            rigby/probe-pixi.mjs -nt dist/probe-pixi.js ]]; then
        "$node_bin" rigby/build.mjs || echo 'Pixi/Rigby bundle unavailable.' >&2
      fi
      # Reuse any installed browser, including a managed Playwright browser if it already launches.
      probe="$("$node_bin" renderers/probe.mjs || printf '{}')"
      if ! printf '%s' "$probe" | "$PY" -c 'import json,sys; sys.exit(not json.load(sys.stdin).get("canvas"))' &&
         [[ -z "${CHROME_PATH:-}" ]] &&
         ! command -v chromium >/dev/null && ! command -v chromium-browser >/dev/null &&
         ! command -v google-chrome >/dev/null && ! command -v google-chrome-stable >/dev/null; then
        "$node_bin" node_modules/playwright-core/cli.js install chromium --only-shell ||
          echo 'Managed Chromium unavailable. CPU 2D remains enabled.' >&2
      fi
    fi
  fi
fi

doctor_args=()
if (( ! web_ready )); then doctor_args+=(--cpu-only); fi
"$PY" cli.py doctor "${doctor_args[@]}"
"$PY" -c 'import audio.caption_timing, audio.tts_kokoro, audio.synth_sfx, renderers.cpu; print("Python production imports OK")'
if (( smoke )); then
  "$PY" cli.py render examples/beacon --profile draft "${doctor_args[@]}"
fi
