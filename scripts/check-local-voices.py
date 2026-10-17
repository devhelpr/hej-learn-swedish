"""Verify the published Windows helper with all real model packages; needs no audio device."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import zipfile

root = Path(__file__).resolve().parent.parent
catalog = json.loads((root / "src-tauri/voice-catalog.json").read_text())
helper = Path(sys.argv[1]).resolve()
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
