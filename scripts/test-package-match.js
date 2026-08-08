import fs from "fs";
import os from "os";
import path from "path";
import {
  fetchPackageInfo,
  patchFileMatchesQuery,
} from "../src/package.js";

function fail(message) {
  console.error(message);
  process.exit(1);
}

function assertEqual(label, actual, expected) {
  if (actual !== expected) {
    fail(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
  console.log(`ok  ${label}`);
}

function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wpp-match-"));
  fs.writeFileSync(
    path.join(root, "wally.toml"),
    [
      "[package]",
      'name = "test/match"',
      'version = "0.1.0"',
      'registry = "https://github.com/UpliftGames/wally-index"',
      'realm = "shared"',
      "",
      "[dependencies]",
      'vide-charm = "littensy/vide-charm@0.4.0"',
      'vide = "centau/vide@0.4.1"',
      'anyRandomName = "howmanysmall/janitor@1.15.7"',
      "",
    ].join("\n")
  );

  for (const folder of [
    "Packages/_Index/littensy_vide-charm@0.4.0/vide-charm",
    "Packages/_Index/centau_vide@0.4.1/vide",
    "Packages/_Index/howmanysmall_janitor@1.15.7/janitor",
  ]) {
    fs.mkdirSync(path.join(root, folder), { recursive: true });
  }

  return root;
}

const fixture = createFixture();
const previousCwd = process.cwd();
process.chdir(fixture);

try {
  const vide = fetchPackageInfo("vide");
  assertEqual("vide name", vide.Name, "vide");
  assertEqual("vide scope", vide.Scope, "centau");
  assertEqual("vide version", vide.Version, "0.4.1");

  const charm = fetchPackageInfo("vide-charm");
  assertEqual("vide-charm name", charm.Name, "vide-charm");
  assertEqual("vide-charm scope", charm.Scope, "littensy");

  const scoped = fetchPackageInfo("centau/vide");
  assertEqual("centau/vide name", scoped.Name, "vide");

  const alias = fetchPackageInfo("anyRandomName");
  assertEqual("alias anyRandomName", alias.Name, "janitor");

  const byName = fetchPackageInfo("janitor");
  assertEqual("package name janitor", byName.Name, "janitor");

  assertEqual(
    "--patch vide matches vide patch",
    patchFileMatchesQuery("centau_vide@0.4.1.patch", "vide"),
    true
  );
  assertEqual(
    "--patch vide does not match vide-charm patch",
    patchFileMatchesQuery("littensy_vide-charm@0.4.0.patch", "vide"),
    false
  );
  assertEqual(
    "--patch vide-charm matches vide-charm patch",
    patchFileMatchesQuery("littensy_vide-charm@0.4.0.patch", "vide-charm"),
    true
  );

  console.log("All package match regressions passed");
} finally {
  process.chdir(previousCwd);
  fs.rmSync(fixture, { recursive: true, force: true });
}
