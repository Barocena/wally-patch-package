import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";

const appPath = fileURLToPath(new URL("../src/app.js", import.meta.url));

function fail(message) {
  console.error(message);
  process.exit(1);
}

function writePatch(filePath) {
  fs.writeFileSync(
    filePath,
    [
      "diff --git a/janitor/src/init.lua b/janitor/src/init.lua",
      "index 1111111..2222222 100644",
      "--- a/janitor/src/init.lua",
      "+++ b/janitor/src/init.lua",
      "@@ -1,3 +1,4 @@",
      " --!optimize 2",
      " --!strict",
      " -- Compiled with L+ C Edition",
      "+-- patched in ci",
      "",
    ].join("\n")
  );
}

function createFixture(nested) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wpp-ci-test-"));
  const projectDir = nested ? path.join(repoRoot, "game") : repoRoot;

  fs.mkdirSync(
    path.join(projectDir, "Packages/_Index/howmanysmall_janitor@1.15.7/janitor/src"),
    { recursive: true }
  );
  fs.writeFileSync(
    path.join(
      projectDir,
      "Packages/_Index/howmanysmall_janitor@1.15.7/janitor/src/init.lua"
    ),
    "--!optimize 2\n--!strict\n-- Compiled with L+ C Edition\n"
  );
  fs.mkdirSync(path.join(projectDir, "WallyPatches"));
  writePatch(
    path.join(projectDir, "WallyPatches/howmanysmall_janitor@1.15.7.patch")
  );
  fs.writeFileSync(
    path.join(projectDir, "wally.toml"),
    [
      "[package]",
      'name = "test/ci"',
      'version = "0.1.0"',
      'registry = "https://github.com/UpliftGames/wally-index"',
      'realm = "shared"',
      "",
      "[dependencies]",
      'janitor = "howmanysmall/janitor@1.15.7"',
      "",
    ].join("\n")
  );
  fs.writeFileSync(
    path.join(repoRoot, ".gitignore"),
    nested ? "game/Packages\n" : "Packages\n"
  );

  execFileSync("git", ["init"], { cwd: repoRoot, stdio: "ignore" });
  execFileSync(
    "git",
    ["-c", "user.email=ci@test", "-c", "user.name=ci", "commit", "--allow-empty", "-m", "init"],
    { cwd: repoRoot, stdio: "ignore" }
  );

  return {
    repoRoot,
    projectDir,
    target: path.join(
      projectDir,
      "Packages/_Index/howmanysmall_janitor@1.15.7/janitor/src/init.lua"
    ),
  };
}

function runApply(label, projectDir) {
  const result = spawnSync(process.execPath, [appPath], {
    cwd: projectDir,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    fail(
      `${label}: apply exited ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
  }

  return result;
}

function assertPatched(label, target) {
  const content = fs.readFileSync(target, "utf8");
  if (!content.includes("-- patched in ci")) {
    fail(`${label}: patch was not applied\nfile contents:\n${content}`);
  }
}

function testCase(label, nested) {
  const fixture = createFixture(nested);
  try {
    const result = runApply(label, fixture.projectDir);
    assertPatched(label, fixture.target);
    console.log(`ok  ${label}`);
    if (result.stdout.trim()) {
      console.log(result.stdout.trim().replace(/^/gm, "    "));
    }

    const second = runApply(`${label} (idempotent)`, fixture.projectDir);
    if (!second.stdout.includes("already applied")) {
      fail(`${label}: expected second apply to skip\nstdout:\n${second.stdout}`);
    }
    console.log(`ok  ${label} (idempotent)`);
  } finally {
    fs.rmSync(fixture.repoRoot, { recursive: true, force: true });
  }
}

testCase("flat repo (wally.toml at git root)", false);
testCase("nested project (wally.toml below git root)", true);

console.log("All apply CI regressions passed");
