import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { resolve } from "node:path";
const target = process.argv[2];
const host = execFileSync("rustc", ["-vV"], { encoding: "utf8" }).match(
  /host: (.+)/,
)[1];
const triple = target || host;
const opts = { stdio: "inherit" };
execFileSync(process.execPath, ["scripts/build-native.mjs", triple], opts);
const args = ["node_modules/@tauri-apps/cli/tauri.js", "build"];
if (target) args.push("--target", target);
args.push("--bundles", process.platform === "darwin" ? "app" : "nsis,msi");
execFileSync(process.execPath, args, opts);
if (process.platform === "darwin") {
  const version = JSON.parse(readFileSync("package.json", "utf8")).version;
  const root = resolve("src-tauri/target", target || "", "release/bundle");
  const stage = resolve(root, "dmg/staging");
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });
  cpSync(resolve(root, "macos/Hej.app"), resolve(stage, "Hej.app"), {
    recursive: true,
  });
  symlinkSync("/Applications", resolve(stage, "Applications"));
  const arch = triple.startsWith("aarch64") ? "aarch64" : "x64";
  const output = resolve(root, `dmg/Hej_${version}_${arch}.dmg`);
  execFileSync(
    "/usr/bin/hdiutil",
    [
      "create",
      "-volname",
      "Hej",
      "-srcfolder",
      stage,
      "-ov",
      "-format",
      "UDZO",
      output,
    ],
    opts,
  );
  rmSync(stage, { recursive: true, force: true });
  console.log(`Installatiebundel: ${output}`);
}
