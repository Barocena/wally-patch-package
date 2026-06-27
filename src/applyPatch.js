import chalk from "chalk";
import fs from "fs";
import os from "os";
import path from "path";
import simpleGit from "simple-git";
import { log, error, capitalizeFirstLetter } from "./utils.js";
import { fetchPackageInfo, getPackagePath } from "./package.js";
import { program } from "commander";

function getApplyFlags() {
  const flags = {
    "--no-index": null,
    "--ignore-space-change": null,
  };

  if (program.opts().debug) {
    flags["--verbose"] = null;
  }

  return flags;
}

async function getPatchStatus(git, patchFilePath, applyOptions) {
  const canApply = await git
    .applyPatch(patchFilePath, { ...applyOptions, "--check": null })
    .then(() => true)
    .catch(() => false);

  if (canApply) {
    return "apply";
  }

  const alreadyApplied = await git
    .applyPatch(patchFilePath, {
      ...applyOptions,
      "--reverse": null,
      "--check": null,
    })
    .then(() => true)
    .catch(() => false);

  if (alreadyApplied) {
    return "skip";
  }

  return "error";
}

export default async function applyPatch() {
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
    var found = false;
    for (const patchFile of patchFiles) {
      if (patchFile.match(Option.patch)) {
        patchFiles = [patchFile];
        found = true;
        continue;
      }
    }
    if (!found) {
      error("❌ Patch not found");
      process.exit(1);
    }
  }

  // git apply silently skips gitignored paths when run inside a repository.
  // Packages/ is gitignored here, so use a detached GIT_DIR to apply to disk.
  const fakeGitDir = fs.mkdtempSync(path.join(os.tmpdir(), "wpp-git-"));
  const previousGitDir = process.env.GIT_DIR;
  process.env.GIT_DIR = fakeGitDir;

  const git = simpleGit().cwd({ path: process.cwd(), root: true });

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
        .relative(process.cwd(), path.join(pkgPath, "../"))
        .replace(/\\/g, "/");

      log("🚗 ", directoryPath);

      const applyOptions = {
        ...getApplyFlags(),
        "--directory": directoryPath,
      };

      const patchStatus = await getPatchStatus(
        git,
        patchFilePath,
        applyOptions
      );

      if (patchStatus === "skip") {
        console.log(
          `⏩ ${capitalizeFirstLetter(pkginfo.Name)}@${pkginfo.Version} already applied, skipping`
        );
        continue;
      }

      if (patchStatus === "error") {
        error(
          `❌ Failed to apply patch for ${capitalizeFirstLetter(pkginfo.Name)}@${pkginfo.Version}`
        );
        process.exit(1);
      }

      try {
        await git.applyPatch(patchFilePath, applyOptions);
      } catch (applyError) {
        console.error(applyError);
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
    if (previousGitDir === undefined) {
      delete process.env.GIT_DIR;
    } else {
      process.env.GIT_DIR = previousGitDir;
    }
    fs.rmSync(fakeGitDir, { recursive: true, force: true });
  }
}
