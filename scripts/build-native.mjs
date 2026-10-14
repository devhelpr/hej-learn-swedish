import { execFileSync } from "node:child_process";
import { mkdirSync, copyFileSync } from "node:fs";
const host = execFileSync("rustc", ["-vV"], { encoding: "utf8" }).match(
  /host: (.+)/,
)[1];
const target =
  process.argv[2] ||
  process.env.TAURI_ENV_TARGET_TRIPLE ||
  process.env.CARGO_BUILD_TARGET ||
  host;
mkdirSync("src-tauri/binaries", { recursive: true });
if (process.platform === "darwin") {
  const arch = target.startsWith("aarch64") ? "arm64" : "x86_64";
  execFileSync(
    "swiftc",
    [
      "-O",
      "-target",
      `${arch}-apple-macosx13.0`,
      "-module-cache-path",
      "src-tauri/target/swift-cache",
      "src-tauri/native/Speech.swift",
      "-o",
      `src-tauri/binaries/speech-helper-${target}`,
    ],
    { stdio: "inherit" },
  );
} else if (process.platform === "win32") {
  execFileSync(
    process.env.HEJ_PYTHON || "python",
    ["scripts/prepare-voices.py", "--resources-only"],
    { stdio: "inherit" },
  );
  execFileSync(
    "dotnet",
    [
      "publish",
      "src-tauri/native/windows/SpeechHelper.csproj",
      "-c",
      "Release",
      "-r",
      "win-x64",
      "--self-contained",
      "true",
      "-p:PublishSingleFile=true",
      "-p:IncludeNativeLibrariesForSelfExtract=true",
      "-o",
      "src-tauri/target/speech-publish",
    ],
    { stdio: "inherit" },
  );
  copyFileSync(
    "src-tauri/target/speech-publish/SpeechHelper.exe",
    `src-tauri/binaries/speech-helper-${target}.exe`,
  );
} else throw new Error("Alleen Windows en macOS worden ondersteund.");
