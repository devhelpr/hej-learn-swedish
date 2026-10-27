"""Verify the published Windows helper with all real model packages; needs no audio device."""
import hashlib
import json
import os
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import zipfile

root = Path(__file__).resolve().parent.parent
catalog = json.loads((root / "src-tauri/voice-catalog.json").read_text())
helper = Path(sys.argv[1]).resolve()
# The published helper itself must use the Windows GUI subsystem, so even a
# launcher without CREATE_NO_WINDOW cannot flash a console or steal focus.
with helper.open("rb") as executable:
    assert executable.read(2) == b"MZ", "Expected a Windows speech helper"
    executable.seek(0x3c)
    pe_offset = struct.unpack("<I", executable.read(4))[0]
    executable.seek(pe_offset)
    assert executable.read(4) == b"PE\0\0", "Invalid Windows speech helper"
    executable.seek(pe_offset + 24 + 68)
    assert struct.unpack("<H", executable.read(2))[0] == 2, "Speech helper must not create a console"
print("Speech helper Windows GUI subsystem: OK", flush=True)
# Exercise redirected stdin/stdout with real UTF-8 bytes, matching Rust's
# serde_json output. Escaped JSON alone would hide a Windows code-page bug.
# Match the app's CREATE_NO_WINDOW launch without an attached console.
for text in ["Åsa går över ån. Vi äter äpplen på ön. åäö ÅÄÖ", "A\u030asa ga\u030ar o\u0308ver a\u030an."]:
    for escaped in (False, True):
        result = subprocess.run(
            [str(helper), "--verify-encoding"],
            input=(json.dumps({"text": text}, ensure_ascii=escaped) + "\n").encode("utf-8"),
            capture_output=True, timeout=30,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
        if result.returncode:
            # CalledProcessError alone hides captured .NET startup exceptions.
            for name, output in (("stdout", result.stdout), ("stderr", result.stderr)):
                print(f"Speech helper {name}:\n{output.decode('utf-8', errors='replace')}", file=sys.stderr, flush=True)
            print(f"Speech helper exit code: 0x{result.returncode & 0xffffffff:08X}", file=sys.stderr, flush=True)
            result.check_returncode()
        assert result.stdout.decode("utf-8").rstrip("\r\n") == text, "Speech helper changed Unicode text"
print("Speech helper UTF-8 pipe roundtrip: OK", flush=True)
with tempfile.TemporaryDirectory(prefix="hej-voice-check-") as temporary:
    for voice in catalog:
        archive = root / "src-tauri/target/voice-packages" / voice["url"].split("/")[-1]
        with archive.open("rb") as stream:
            assert hashlib.file_digest(stream, "sha256").hexdigest() == voice["sha256"]
        target = Path(temporary) / (voice["id"][6:] + "-" + voice["version"])
        target.mkdir()
        with zipfile.ZipFile(archive) as zipped:
            assert set(zipped.namelist()) == set(voice["files"])
            for name, spec in voice["files"].items():
                data = zipped.read(name)
                assert len(data) == spec["size"] and hashlib.sha256(data).hexdigest() == spec["sha256"]
                (target / name).write_bytes(data)
        (target / "installed.json").write_text(json.dumps(voice))
    env = dict(os.environ, HEJ_VOICE_DIR=temporary, HEJ_SPEECH_DATA=str(root / "src-tauri/target/voice-resources"))
    subprocess.run([str(helper), "--verify-models"], env=env, check=True, timeout=600)
    if os.name == "nt":
        # Tauri's installed resource directory can be a verbatim (\\?\) path,
        # unlike the plain build-tree paths in the first smoke test.
        def verbatim(path):
            absolute = str(Path(path).resolve())
            if absolute.startswith("\\\\?\\"):
                return absolute
            if absolute.startswith("\\\\"):
                return "\\\\?\\UNC\\" + absolute[2:]
            return "\\\\?\\" + absolute

        env["HEJ_VOICE_DIR"] = verbatim(env["HEJ_VOICE_DIR"])
        env["HEJ_SPEECH_DATA"] = verbatim(env["HEJ_SPEECH_DATA"])
        print("Checking verbatim Windows model and speech-data paths", flush=True)
        subprocess.run([str(helper), "--verify-models"], env=env, check=True, timeout=600)
