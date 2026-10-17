#!/usr/bin/env python3
"""Build reproducible, uncompressed voice ZIPs. Run --update-catalog only for a new voice release.

Conversion follows sherpa-onnx v1.13.8 scripts/piper/add_meta_data.py
(Copyright 2025 Xiaomi Corp., Apache-2.0). Python is a build dependency only.
"""
import argparse
import hashlib
import json
import shutil
import tarfile
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src-tauri/target/voice-packages"
RESOURCES = ROOT / "src-tauri/target/voice-resources"
CATALOG = ROOT / "src-tauri/voice-catalog.json"
RELEASE = "speech-models-v1"
SOURCES = [
    ("alma", "Alma", "yeagersthlm/piper-voice-sv-alma", "b03e1489762690deabd2ad45dc75ff7f26c645c2", "", "b4bfecd22e30cf28f514eeea06c0da440be1721435a652d0571ee65963ce8f65", "CC-BY-4.0.txt", "Daniel Nylander; CC BY 4.0"),
    ("nst", "NST", "rhasspy/piper-voices", "375a0fe641dea077c2a47b4e9a056d6da521eed3", "sv/sv_SE/nst/medium/", "df011f56825a59dd1efc080c38a65a1ef70407e60f63050e9246f43a3d7e471e", "PIPER-LICENSE.txt", "KBLab, National Library of Sweden; Piper repository MIT, NST dataset CC0"),
]
DATA_URL = "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-sv_SE-nst-medium.tar.bz2"
DATA_SHA = "5aed0f5ab75135fc3ba6a4f3567e171d72df753305b08a01ca42f79411587f67"


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def fetch(url, path, sha=None):
    if not path.is_file() or (sha and digest(path) != sha):
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(path.suffix + ".part")
        with urllib.request.urlopen(url, timeout=120) as response, temporary.open("wb") as stream:
            shutil.copyfileobj(response, stream)
        if sha and digest(temporary) != sha:
            temporary.unlink()
            raise RuntimeError(f"Checksum mismatch: {url}")
        temporary.replace(path)


def resources():
    archive = OUT / "phonemizer.tar.bz2"
    fetch(DATA_URL, archive, DATA_SHA)
    RESOURCES.mkdir(parents=True, exist_ok=True)
    prefix = "vits-piper-sv_SE-nst-medium/espeak-ng-data/"
    with tarfile.open(archive) as tar:
        for item in tar:
            if not item.isfile() or not item.name.startswith(prefix):
                continue
            relative = Path(item.name.removeprefix(prefix))
            if relative.is_absolute() or ".." in relative.parts:
                raise RuntimeError("Unsafe phonemizer path")
            target = RESOURCES / "espeak-ng-data" / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            with tar.extractfile(item) as source, target.open("wb") as dest:
                shutil.copyfileobj(source, dest)
    for source in (ROOT / "scripts/voice-licenses").iterdir():
        shutil.copyfile(source, RESOURCES / source.name)


SUPERTONIC_URL = "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/sherpa-onnx-supertonic-3-tts-int8-2026-05-11.tar.bz2"
SUPERTONIC_SHA = "82fa96f91c4ef8abaae3a14a3f4153facf88bed821d1f7331cec2700f432c427"


def pack(key, name, stage):
    files = {p.name: {"size": p.stat().st_size, "sha256": digest(p)} for p in sorted(stage.iterdir()) if p.is_file()}
    asset = f"hej-voice-{key}-v1.zip"
    archive = OUT / asset
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_STORED) as zipped:
        for filename in files:
            info = zipfile.ZipInfo(filename, date_time=(2026, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            zipped.writestr(info, (stage / filename).read_bytes())
    return dict(id=f"local:{key}", name=name, version="1", url=f"https://github.com/devhelpr/hej-learn-swedish/releases/download/{RELEASE}/{asset}", size=archive.stat().st_size, sha256=digest(archive), files=files)


def supertonic_package():
    archive = OUT / "supertonic-original.tar.bz2"
    fetch(SUPERTONIC_URL, archive, SUPERTONIC_SHA)
    stage = OUT / "supertonic"
    stage.mkdir(parents=True, exist_ok=True)
    names = ["duration_predictor.int8.onnx", "text_encoder.int8.onnx", "vector_estimator.int8.onnx", "vocoder.int8.onnx", "tts.json", "unicode_indexer.bin", "voice.bin", "LICENSE"]
    with tarfile.open(archive) as tar:
        for name in names:
            item = tar.getmember("sherpa-onnx-supertonic-3-tts-int8-2026-05-11/" + name)
            if not item.isfile():
                raise RuntimeError("Invalid Supertonic model file: " + name)
            target = "CODE-LICENSE.txt" if name == "LICENSE" else name
            with tar.extractfile(item) as source, (stage / target).open("wb") as dest:
                shutil.copyfileobj(source, dest)
    shutil.copyfile(ROOT / "scripts/voice-licenses/SUPERTONIC-MODEL-LICENSE.txt", stage / "LICENSE.txt")
    (stage / "NOTICE.txt").write_text("Supertonic 3: Copyright Supertone Inc. Model weights: BigScience OpenRAIL-M; usage restrictions apply. Code: MIT.\nSource: https://huggingface.co/Supertone/supertonic-3/tree/3cadd1ee6394adea1bd021217a0e650ede09a323\nQuantized ONNX distribution by sherpa-onnx: " + SUPERTONIC_URL + "\nUpstream archive SHA-256: " + SUPERTONIC_SHA + "\nHej redistributes the quantized model without changing its weights.\n", encoding="utf-8", newline="\n")
    entry = pack("supertonic", "Supertonic 3", stage)
    entry.update(engine="supertonic", voices=[dict(id=f"local:supertonic:{i}", name=f"Supertonic {i+1}", speaker=i) for i in range(10)])
    return entry


def packages(update):
    import onnx
    entries = []
    for key, name, repo, revision, prefix, sha, license_file, credit in SOURCES:
        stage = OUT / key
        stage.mkdir(parents=True, exist_ok=True)
        base = f"https://huggingface.co/{repo}/resolve/{revision}/{prefix}sv_SE-{key}-medium.onnx"
        original = OUT / f"{key}-original.onnx"
        fetch(base, original, sha)
        fetch(base + ".json", stage / "config.json")
        config = json.loads((stage / "config.json").read_text())
        model = onnx.load(original)
        del model.metadata_props[:]
        metadata = dict(model_type="vits", comment="piper", language="Swedish", voice=config["espeak"]["voice"], version=1, has_espeak=1, has_g2pw=0, n_speakers=config["num_speakers"], sample_rate=config["audio"]["sample_rate"])
        for k, value in metadata.items():
            prop = model.metadata_props.add()
            prop.key, prop.value = k, str(value)
        onnx.save(model, stage / "model.onnx")
        with (stage / "tokens.txt").open("w", encoding="utf-8", newline="\n") as stream:
            for token, ids in config["phoneme_id_map"].items():
                if token != "\n":
                    stream.write(f"{token} {ids[0] if isinstance(ids, list) else ids}\n")
        shutil.copyfile(ROOT / "scripts/voice-licenses" / license_file, stage / "LICENSE.txt")
        if key == "nst":
            shutil.copyfile(ROOT / "scripts/voice-licenses/CC0-1.0.txt", stage / "DATASET-LICENSE.txt")
        (stage / "NOTICE.txt").write_text(f"{name}: {credit}\nSource: https://huggingface.co/{repo}/tree/{revision}\nModel metadata adapted for sherpa-onnx; voice weights unchanged.\n", encoding="utf-8", newline="\n")
        entries.append(pack(key, name, stage))
    entries.append(supertonic_package())
    content = json.dumps(entries, ensure_ascii=False, indent=2) + "\n"
    if update:
        CATALOG.write_text(content, encoding="utf-8", newline="\n")
    elif json.loads(CATALOG.read_text()) != entries:
        raise RuntimeError("Voice packages differ from the committed catalog. Do not publish changed assets under an existing voice version.")
    print("Verified voice packages:", ", ".join(x["name"] for x in entries))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--resources-only", action="store_true")
    parser.add_argument("--update-catalog", action="store_true")
    args = parser.parse_args()
    resources()
    if not args.resources_only:
        packages(args.update_catalog)
