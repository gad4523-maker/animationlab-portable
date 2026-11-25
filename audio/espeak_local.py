"""Minimal rootless narration through the bundled eSpeak NG C API."""
import ctypes as c
import sys
import wave
from pathlib import Path

import espeakng_loader


def main(output, voice, speed):
    library = c.CDLL(espeakng_loader.get_library_path())
    shorts = c.POINTER(c.c_short)
    callback_type = c.CFUNCTYPE(c.c_int, shorts, c.c_int, c.c_void_p)
    library.espeak_Initialize.argtypes = (c.c_int, c.c_int, c.c_char_p, c.c_int)
    library.espeak_SetVoiceByName.argtypes = (c.c_char_p,)
    library.espeak_SetParameter.argtypes = (c.c_int, c.c_int, c.c_int)
    library.espeak_SetSynthCallback.argtypes = (callback_type,)
    library.espeak_Synth.argtypes = (c.c_char_p, c.c_size_t, c.c_uint, c.c_int,
                                    c.c_uint, c.c_uint, c.c_void_p, c.c_void_p)
    # Synchronous sample callback. eSpeak expects the directory containing espeak-ng-data.
    rate = library.espeak_Initialize(2, 0, str(Path(espeakng_loader.get_data_path()).parent).encode(), 0)
    if rate <= 0:
        raise RuntimeError("eSpeak NG failed to initialize")
    try:
        if library.espeak_SetVoiceByName(voice.encode()) or library.espeak_SetParameter(1, int(speed), 0):
            raise ValueError(f"Invalid eSpeak voice or rate: {voice!r}, {speed}")
        pcm = bytearray()

        @callback_type
        def collect(samples, size, _events):
            if samples and size:
                pcm.extend(c.string_at(samples, size * 2))
            return 0

        library.espeak_SetSynthCallback(collect)
        text = sys.stdin.buffer.read() + b"\0"
        if library.espeak_Synth(text, len(text), 0, 1, 0, 1, None, None) or not pcm:
            raise RuntimeError("eSpeak NG produced no narration")
        with wave.open(output, "wb") as wav:
            wav.setparams((1, 2, rate, 0, "NONE", "not compressed"))
            wav.writeframes(pcm)
    finally:
        library.espeak_Terminate()


if __name__ == "__main__":
    main(*sys.argv[1:])
