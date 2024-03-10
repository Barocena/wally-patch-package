import chalk from "chalk";
import fs from "fs";
import path from "path";
import simpleGit from "simple-git";
import { log, error, capitalizeFirstLetter } from "./utils.js";
import { fetchPackageInfo, getPackagePath } from "./package.js";
import { program } from "commander";

export default async function applyPatch() {
  const PatchDir = path.join(process.cwd(), "/WallyPatches");

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

  for (const patchFile of patchFiles) {
    const patchFilePath = path.join(PatchDir, patchFile);

    const git = simpleGit().cwd({ path: process.cwd(), root: true });

    const pkginfo = fetchPackageInfo(
      patchFile.split("_")[0] + "/" + patchFile.split("_")[1].split(".p")[0],
      true
    ); // we give scope/name@version as input to make sure there is no edge case of different scoped  same package name or different version of same package etc..
    if (pkginfo == "skip") {
      console.log(
        `⏭  ${patchFile.split(".p")[0]} not found, skipping`
      );
      continue
    }
    const pkgPath = getPackagePath(pkginfo);

    const isGitInitialized = await git.checkIsRepo();
    if (!isGitInitialized) {
      await git.init();
    }
    const gitroot = await git.revparse(["--show-toplevel"]);

    const directoryPath = path
      .normalize(path.join(path.relative(gitroot, pkgPath), "../"))
      .replace(/\\/g, "/");

    log("🚗 ", directoryPath);

    git.cwd({ path: path.join(pkgPath, "../"), root: true });

    // check if patch is already applied
    const alreadyApplied = await git
      .applyPatch(patchFilePath, {
        "--check": null,
        "--verbose": null,
        "--directory": directoryPath,
      })
      .then(() => {
        return false;
      })
      .catch(() => {
        // patch is already applied
        return true;
      });

    if (alreadyApplied) {
      console.log(
        `⏩ ${capitalizeFirstLetter(pkginfo.Name)}@${
          pkginfo.Version
        } already applied, skipping`
      );
      continue;
    }

    await git
      .applyPatch(patchFilePath, {
        "--no-index": null,
        "--verbose": null,
        "--allow-empty": null,
        "--directory": directoryPath, // directory is relative to the .git folder (no absolute path)
      })
      .catch((error) => {
        console.error(error);
      });
    applyCount += 1;
    console.log(
      chalk.green(
        `🧩 ${capitalizeFirstLetter(pkginfo.Name)}@${
          pkginfo.Version
        } applied successfully`
      )
    );
  }

  console.log(chalk.green(`🧩 ${applyCount} Patch applied`));
}
