import chalk from "chalk";
import fs from "fs";
import path from "path";
import simpleGit from "simple-git";
import { log, error, capitalizeFirstLetter } from "./utils.js";
import { fetchPackageInfo, getPackagePath } from "./package.js";



// Apply patch
export default async function applyPatch() {
  const PatchDir = `${process.cwd()}\\WallyPatches`;

  if (!fs.existsSync(PatchDir)) {
    error("❌ No patches found");
    process.exit(1);
  }

  const patchFiles = fs.readdirSync(PatchDir);

  if (patchFiles.length == 0) {
    error("❌ No patches found");
    process.exit(1);
  }

  var applyCount = 0;

  for (const patchFile of patchFiles) {
    const patchFilePath = `${PatchDir}\\${patchFile}`;
    log("🧩 ", patchFile);

    const git = simpleGit().cwd({ path: process.cwd(), root: true });

    const pkginfo = fetchPackageInfo(patchFile.split("_")[1].split("@")[0]);
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
        `⏩ ${capitalizeFirstLetter(pkginfo.Name)} already applied, skipping`
      );
      continue;
    }

    await git
      .applyPatch(patchFilePath, {
        "--no-index": null,
        "-q": null,
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
        `🧩 ${capitalizeFirstLetter(pkginfo.Name)} applied successfully`
      )
    );
  }

  console.log(chalk.green(`🧩 ${applyCount} Patch applied`));
}
