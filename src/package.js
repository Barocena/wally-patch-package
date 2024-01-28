import fs from "fs";
import toml from "toml";
import extract from "extract-zip";
import fetch from "node-fetch";
import { error } from "./utils.js";

export function fetchPackageInfo(packageName) {
  const wallyPath = process.cwd() + "/wally.toml";
  if (fs.existsSync(wallyPath)) {
    var wallyData = toml.parse(fs.readFileSync(wallyPath));
    var Realm = "";
    var packageData = "";
    if (wallyData["dependencies"][packageName]) {
      packageData = wallyData["dependencies"][packageName];
      Realm = "Shared";
    } else if (wallyData["server-dependencies"][packageName]) {
      packageData = wallyData["server-dependencies"][packageName];
      Realm = "Server";
    } else {
      error("Package not found");
      process.exit(1);
    }

    const keys = ["Scope", "Name", "Version", "Realm"];
    return Object.fromEntries(
      keys.map((key, index) => [
        key,
        index === 3 ? Realm : packageData.split(/\/|@/)[index],
      ])
    );
  } else {
    error("Wally.toml not found");
    process.exit(1);
  }
}

export function getPackagePath(pkgInfo) {
  var pkgFolder = pkgInfo.Realm == "Shared" ? "Packages" : "ServerPackages";
  var pkgPath = `${process.cwd()}\\${pkgFolder}\\_Index\\${pkgInfo.Scope}_${
    pkgInfo.Name
  }@${pkgInfo.Version}\\${pkgInfo.Name}`;
  return pkgPath;
}

async function fetchRegistryUrl() {
  var url = "";
  var registryField = toml.parse(
    fs.readFileSync(process.cwd() + "/wally.toml")
  )["package"]["registry"];
  url = `https://raw.githubusercontent.com/${
    registryField.split("m/")[1]
  }/main/config.json`;

  return await fetch(url, { method: "GET" })
    .then((res) => res.json())
    .then((data) => {
      return data["api"];
    });
}

export async function downloadPackage(pkgInfo, tempDir) {
  fs.mkdirSync(`${tempDir}/${pkgInfo.Name}`); // Create temp dir for package

  const options = {
    method: "GET",
    headers: {
      "Content-Type": "text/plain",
      "User-Agent": "wally-patch-package",
      "Wally-Version": "0.3.2",
    },
  };

  var endpoint = await fetchRegistryUrl();
  endpoint += `/v1/package-contents/${pkgInfo.Scope}/${pkgInfo.Name}/${pkgInfo.Version}`;

  const res = await fetch(endpoint, options);
  const zipPath = `${tempDir}/${pkgInfo.Name}/${pkgInfo.Name}.zip`;
  await new Promise(async (resolve, reject) => {
    const fileStream = fs.createWriteStream(zipPath);
    res.body.pipe(fileStream);
    res.body.on("error", (err) => {
      reject(err);
    });

    fileStream.on("close", async function () {
      await unzip(zipPath, `${tempDir}/${pkgInfo.Name}`);
      resolve();
    });
  });
  async function unzip(zipPath, dir) {
    await extract(zipPath, { dir: dir });
    fs.unlink(zipPath, (err) => {
      if (err) {
        error(err);
      }
    });
  }
}
