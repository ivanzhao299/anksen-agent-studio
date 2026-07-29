#!/usr/bin/env python3

import argparse
import json
import math
import re
import wave
from pathlib import Path

try:
    from pypinyin import Style, pinyin
except ImportError:
    Style = None
    pinyin = None


PUNCTUATION = set("，。！？；：、,.!?;:\n")
INITIAL_TO_VISEME = {
    "b": "MBP",
    "p": "MBP",
    "m": "MBP",
    "f": "FV",
    "d": "L",
    "t": "L",
    "n": "L",
    "l": "L",
    "g": "AI",
    "k": "AI",
    "h": "AI",
    "j": "WQ",
    "q": "WQ",
    "x": "WQ",
    "zh": "WQ",
    "ch": "WQ",
    "sh": "WQ",
    "r": "WQ",
    "z": "EE",
    "c": "EE",
    "s": "EE",
    "y": "EE",
    "w": "U",
}


def audio_duration(path: Path) -> float:
    with wave.open(str(path), "rb") as handle:
        return handle.getnframes() / float(handle.getframerate())


def final_viseme(final: str) -> str:
    lowered = final.lower()
    if any(token in lowered for token in ("u", "ou", "ong")):
        return "U"
    if any(token in lowered for token in ("o", "uo")):
        return "O"
    if any(token in lowered for token in ("e", "er")):
        return "E"
    if any(token in lowered for token in ("i", "v", "ü")):
        return "EE"
    return "AI"


def syllable_visemes(character: str):
    if pinyin is None:
        group = ord(character) % 5
        return [("AI", 0.48), (["EE", "O", "U", "E", "AI"][group], 0.52)]
    initial = pinyin(character, style=Style.INITIALS, strict=False, errors="ignore")
    final = pinyin(character, style=Style.FINALS, strict=False, errors="ignore")
    initial_value = initial[0][0] if initial and initial[0] else ""
    final_value = final[0][0] if final and final[0] else ""
    onset = INITIAL_TO_VISEME.get(initial_value, "AI")
    return [(onset, 0.42), (final_viseme(final_value), 0.58)]


def build_track(text: str, duration: float, start: float):
    units = []
    for character in text.strip():
        if character.isspace():
            units.append(("REST", 0.25))
        elif character in PUNCTUATION:
            units.append(("REST", 0.7 if character in "。！？!?." else 0.4))
        else:
            units.extend(syllable_visemes(character))
    if not units:
        units = [("REST", 1.0)]
    total_weight = sum(weight for _, weight in units)
    usable_duration = max(0.1, duration)
    cursor = start
    keyframes = [{"time": round(start, 4), "viseme": "REST", "value": 0.0}]
    for index, (viseme, weight) in enumerate(units):
        span = usable_duration * weight / total_weight
        value = 0.0 if viseme == "REST" else 0.92
        keyframes.append(
            {
                "time": round(cursor, 4),
                "viseme": viseme,
                "value": value,
                "attack": round(min(0.045, span * 0.22), 4),
                "release": round(min(0.06, span * 0.28), 4),
                "unit": index,
            }
        )
        cursor += span
    keyframes.append({"time": round(start + duration, 4), "viseme": "REST", "value": 0.0})
    return keyframes


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--text", required=True)
    parser.add_argument("--audio", required=True)
    parser.add_argument("--speaker", required=True)
    parser.add_argument("--start", type=float, default=0.0)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    audio = Path(args.audio).resolve()
    output = Path(args.output).resolve()
    duration = audio_duration(audio)
    track = {
        "schemaVersion": 1,
        "speaker": args.speaker,
        "text": args.text,
        "audio": str(audio),
        "start": args.start,
        "duration": round(duration, 6),
        "alignment": "script-driven-pinyin" if pinyin is not None else "script-driven-unicode-fallback",
        "visemes": build_track(args.text, duration, args.start),
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(track, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
