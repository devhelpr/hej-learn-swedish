import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";

export function createManifest(root, repository, tag) {
  const version = JSON.parse(
    readFileSync("src-tauri/tauri.conf.json", "utf8"),
  ).version;
  const npmVersion = JSON.parse(readFileSync("package.json", "utf8")).version;
  const cargoVersion = readFileSync("src-tauri/Cargo.toml", "utf8").match(
    /^version = "([^"]+)"/m,
  )?.[1];
  if (
    tag !== `v${version}` ||
    npmVersion !== version ||
    cargoVersion !== version
  ) {
    throw new Error("Release tag and npm/Tauri/Cargo versions must match.");
  }
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository))
    throw new Error("Invalid GitHub repository.");
  function files(dir) {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? files(join(dir, entry.name))
        : [join(dir, entry.name)],
    );
  }
  const installers = files(root).filter((path) => path.endsWith("-setup.exe"));
  if (installers.length !== 1)
    throw new Error("Expected exactly one Windows NSIS update installer.");
  const installer = installers[0];
  const expected = `Hej_${version}_x64-setup.exe`;
  if (basename(installer) !== expected)
    throw new Error(`Expected ${expected}.`);
  const signature = readFileSync(`${installer}.sig`, "utf8").trim();
  if (!signature) throw new Error("Missing updater signature.");
  return {
    version,
    notes: `Hej ${version}. Bekijk de release notes op https://github.com/${repository}/releases/tag/${tag}`,
    pub_date: new Date().toISOString(),
    platforms: {
      "windows-x86_64": {
        signature,
        url: `https://github.com/${repository}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(expected)}`,
      },
    },
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [root, repository, tag, output] = process.argv.slice(2);
  if (!output)
    throw new Error(
      "Usage: create-update-manifest.mjs <installers> <owner/repo> <tag> <output>",
    );
  writeFileSync(
    output,
    `${JSON.stringify(createManifest(root, repository, tag), null, 2)}\n`,
  );
}
