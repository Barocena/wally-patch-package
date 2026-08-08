import chalk from "chalk";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { log, error, capitalizeFirstLetter } from "./utils.js";
import {
  fetchPackageInfo,
  getPackagePath,
  patchFileMatchesQuery,
} from "./package.js";
import { program } from "commander";

function createBareGitDir() {
  const fakeGitDir = fs.mkdtempSync(path.join(os.tmpdir(), "wpp-git-"));
  execFileSync("git", ["init", "--bare", "--quiet"], {
    cwd: fakeGitDir,
    stdio: "ignore",
  });
  return fakeGitDir;
}

function runGitApply({ workTree, gitDir, patchFilePath, extraArgs = [] }) {
  const args = [
    "-c",
    "core.autocrlf=false",
    "-c",
    "safe.directory=*",
    `--git-dir=${gitDir}`,
    `--work-tree=${workTree}`,
    "apply",
    "--ignore-whitespace",
    ...extraArgs,
    patchFilePath,
  ];

  if (program.opts().debug) {
    args.splice(args.indexOf("apply") + 1, 0, "--verbose");
  }

  try {
    const result = execFileSync("git", args, {
      cwd: workTree,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (result) {
      log(result);
    }
    return { ok: true };
  } catch (err) {
    const stderr = String(err.stderr || err.message || err);
    return { ok: false, stderr };
  }
}

function getPatchStatus(applyArgs) {
  const canApply = runGitApply({
    ...applyArgs,
    extraArgs: [...applyArgs.extraArgs, "--check"],
  });

  if (canApply.ok) {
    return { status: "apply" };
  }

  const alreadyApplied = runGitApply({
    ...applyArgs,
    extraArgs: [...applyArgs.extraArgs, "--reverse", "--check"],
  });

  if (alreadyApplied.ok) {
    return { status: "skip" };
  }

  return { status: "error", stderr: canApply.stderr };
}

export default function applyPatch() {
  const PatchDir = path.join(process.cwd(), "WallyPatches");

  if (!fs.existsSync(PatchDir)) {
    error("❌ No patches found");
    process.exit(1);
  }

  var patchFiles = fs.readdirSync(PatchDir);

  if (patchFiles.length == 0) {
    error("❌ No patches found");
    process.exit(1);
  }

  var applyCount = 0;

  var Option = program.opts();

  if (Option.patch) {
    const matched = patchFiles.filter((patchFile) =>
      patchFileMatchesQuery(patchFile, Option.patch)
    );
    if (matched.length === 0) {
      error("❌ Patch not found");
      process.exit(1);
    }
    if (matched.length > 1) {
      error(
        "❌ Multiple patches matched",
        Option.patch + ":",
        matched.join(", ")
      );
      process.exit(1);
    }
    patchFiles = matched;
  }

  // git apply resolves --directory against the repo work tree, not cwd, and
  // can silently skip patches when run inside a checkout (typical in CI).
  // Use a throwaway repo whose work tree is the project directory.
  const workTree = process.cwd();
  const fakeGitDir = createBareGitDir();

  try {
    for (const patchFile of patchFiles) {
      const patchFilePath = path.join(PatchDir, patchFile);

      const pkginfo = fetchPackageInfo(
        patchFile.split("_")[0] + "/" + patchFile.split("_")[1].split(".p")[0],
        true
      );
      if (pkginfo == "skip") {
        console.log(`⏭  ${patchFile.split(".p")[0]} not found, skipping`);
        continue;
      }
      const pkgPath = getPackagePath(pkginfo);
      const directoryPath = path
        .relative(workTree, path.join(pkgPath, "../"))
        .replace(/\\/g, "/");

      log("🚗 ", directoryPath);

      const applyArgs = {
        workTree,
        gitDir: fakeGitDir,
        patchFilePath,
        extraArgs: [`--directory=${directoryPath}`],
      };

      const patchStatus = getPatchStatus(applyArgs);

      if (patchStatus.status === "skip") {
        console.log(
          `⏩ ${capitalizeFirstLetter(pkginfo.Name)}@${pkginfo.Version} already applied, skipping`
        );
        continue;
      }

      if (patchStatus.status === "error") {
        if (patchStatus.stderr) {
          console.error(patchStatus.stderr);
        }
        error(
          `❌ Failed to apply patch for ${capitalizeFirstLetter(pkginfo.Name)}@${pkginfo.Version}`
        );
        process.exit(1);
      }

      const applied = runGitApply(applyArgs);
      if (!applied.ok) {
        console.error(applied.stderr);
        error(
          `❌ Failed to apply patch for ${capitalizeFirstLetter(pkginfo.Name)}@${pkginfo.Version}`
        );
        process.exit(1);
      }

      applyCount += 1;
      console.log(
        chalk.green(
          `🧩 ${capitalizeFirstLetter(pkginfo.Name)}@${pkginfo.Version} applied successfully`
        )
      );
    }

    console.log(chalk.green(`🧩 ${applyCount} Patch applied`));
  } finally {
    fs.rmSync(fakeGitDir, { recursive: true, force: true });
  }
}
