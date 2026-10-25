import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createManifest } from "./create-update-manifest.mjs";

const version = JSON.parse(readFileSync("package.json", "utf8")).version;
const roots: string[] = [];
afterEach(() =>
  roots
    .splice(0)
    .forEach((root) => rmSync(root, { recursive: true, force: true })),
);
function fixture(signature = "signed-installer") {
  const root = mkdtempSync(join(tmpdir(), "hej-update-"));
  roots.push(root);
  const dir = join(root, "hej-windows-2022", "nsis");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `Hej_${version}_x64-setup.exe`);
  writeFileSync(file, "installer");
  writeFileSync(`${file}.sig`, signature);
  return { root, file };
}
it("publishes the NSIS URL and signature for Windows x64", () => {
  const { root } = fixture();
  const manifest = createManifest(
    root,
    "devhelpr/hej-learn-swedish",
    `v${version}`,
  );
  expect(manifest.version).toBe(version);
  expect(manifest.platforms["windows-x86_64"]).toEqual({
    signature: "signed-installer",
    url: `https://github.com/devhelpr/hej-learn-swedish/releases/download/v${version}/Hej_${version}_x64-setup.exe`,
  });
});
it("rejects a tag that does not match the built version", () => {
  expect(() =>
    createManifest(fixture().root, "devhelpr/hej-learn-swedish", "v0.0.0"),
  ).toThrow(/versions must match/);
});
it("refuses unsigned or ambiguous updates", () => {
  const { root, file } = fixture("");
  expect(() =>
    createManifest(root, "devhelpr/hej-learn-swedish", `v${version}`),
  ).toThrow(/signature/);
  rmSync(`${file}.sig`);
  expect(() =>
    createManifest(root, "devhelpr/hej-learn-swedish", `v${version}`),
  ).toThrow();
  writeFileSync(join(root, "extra-setup.exe"), "other");
  expect(() =>
    createManifest(root, "devhelpr/hej-learn-swedish", `v${version}`),
  ).toThrow(/exactly one/);
});
