import {
  downloadPackage,
  fetchPackageInfo,
  getPackagePath,
} from "./package.js";
import { error, log } from "./utils.js";
import os from "os";
import fs from "fs";
import path from "path";
import simpleGit from "simple-git";
import chalk from "chalk";

async function createDiff(source, target, patchDir, pkgInfo) {
  // source is downloaded from wally and target is the local edited package
  await new Promise(async (resolve, reject) => {
    const git = simpleGit();

    // commit source version
    await git
      .cwd({ path: path.join(source, "../"), root: true })
      .init()
      .addConfig("--local", "user.name", "wally-patch-package")
      .addConfig("--local", "user.email", "wally@pack.age")
      .addConfig("--local", "core.autocrlf", "false")
      .add(["-f", source])
      .commit(["--allow-empty", "-m", "init"]);

    // replace the source version with modified target
    fs.rmSync(source, { recursive: true, force: true }, (err) => {
      if (err) {
        reject(err);
      }
    });

    fs.cpSync(target, source, { recursive: true, force: true }, (err) => {
      if (err) {
        error(err);
        reject(err);
      }
    });

    await git.add(["-f", source]);

    const gitDiff = await git.diff([
      "--staged",
      "--ignore-space-at-eol",
      "--no-ext-diff",
      "--src-prefix=a/",
      "--dst-prefix=b/",
    ]);

    fs.writeFileSync(
      `${patchDir}/${pkgInfo.Scope}_${pkgInfo.Name}@${pkgInfo.Version}.patch`,
      gitDiff
    );

    resolve();
  });
}

export default async function createPatch(packageName) {
  console.log(chalk.yellow(`🩹 Creating patch for ${packageName}`));

  var pkgInfo = fetchPackageInfo(packageName);
  log("📦 ", JSON.stringify(pkgInfo));
  var pkgPath = getPackagePath(pkgInfo);

  if (!fs.existsSync(pkgPath)) {
    error("Package not found");
    process.exit(1);
  }

  // Download the package from Wally
  const tempDirPath = path.join(os.tmpdir(), "wally-patch-package-");
  const tempDir = fs.mkdtempSync(tempDirPath);

  await downloadPackage(pkgInfo, tempDir);

  const tmpPackageDir = `${tempDir}/${pkgInfo.Name}`;

  const PatchDir = `${process.cwd()}\\WallyPatches`;

  if (!fs.existsSync(PatchDir)) {
    fs.mkdirSync(PatchDir);
  }

  // git diffing

  await createDiff(tmpPackageDir, pkgPath, PatchDir, pkgInfo);

  // delete temp dir after diffing
  fs.rm(tempDir, { recursive: true, force: true }, (err) => {
    if (err) {
      error(err);
    }
  });

  console.log(chalk.green(`💹 Patch created for ${packageName}`));
}
