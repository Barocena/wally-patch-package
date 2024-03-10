import fs from "fs";
import toml from "toml";
import AdmZip from "adm-zip";
import fetch from "node-fetch";
import { error, log } from "./utils.js";
import os from "os";
import { program } from "commander";
import path from "path";
import {satisfies} from "semver";

function semverCheck(pkgInfo, pkgPath) {
  const IndexDir = path.join(pkgPath, "../.."); // _Index

  var possible = fs
    .readdirSync(IndexDir)
    .filter((n) => n.match(`${pkgInfo.Scope}_${pkgInfo.Name}`))
    .sort()
    .filter(function (p) {
      var v = p.split("@")[1];
      var pkgV = pkgInfo.Version;
      if (Number.parseInt(pkgV.charAt(0))) {
        pkgV = "^" + pkgV; // wally versions are ^X.X.X by default
      }
      return satisfies(v, pkgV);
    })
    .sort()
    .reverse()[0];

  return possible == undefined ? false : possible.split("@")[1];
}

export function fetchPackageInfo(packageName) {
  const wallyPath = process.cwd() + "/wally.toml";

  if (!fs.existsSync(wallyPath)) {
    error("❌ Wally.toml not found");
    process.exit(1);
  }

  var wallyData = toml.parse(fs.readFileSync(wallyPath));
  var Realm = "";
  var packageData = "";

  const dependencies = Object.values(wallyData["dependencies"] || {}).find(
    (pname) => pname.match(packageName)
  );
  const serverdependencies = Object.values(
    wallyData["server-dependencies"] || {}
  ).find((pname) => pname.match(packageName));

  const devdependencies = Object.values(
    wallyData["dev-dependencies"] || {}
  ).find((pname) => pname.match(packageName));

  if (dependencies) {
    packageData = dependencies;
    Realm = "Shared";
    log(`found ${packageName} in dependencies`);
  } else if (serverdependencies) {
    packageData = serverdependencies;
    Realm = "Server";
    log(`found ${packageName} in server-dependencies`);
  } else if (devdependencies) {
    packageData = devdependencies;
    Realm = "Dev";
    log(`found ${packageName} in dev-dependencies`);
  } else {
    error("❌ Package not found");
    process.exit(1);
  }

  const keys = ["Scope", "Name", "Version", "Realm"];
  var result = Object.fromEntries(
    keys.map((key, index) => [
      key,
      index === 3 ? Realm : packageData.split(/\/|@/)[index],
    ])
  );

  var pkgPath = getPackagePath(result);
  if (!fs.existsSync(pkgPath)) {
    const ver = semverCheck(result, pkgPath);
    if (ver) {
      result.Version = ver;
    } else {
      error("❌ Package version not found");
      process.exit(1);
    }
  }

  return result;
}

export function getPackagePath(pkgInfo) {
  const dirs = {
    Shared: "Packages",
    Server: "ServerPackages",
    Dev: "DevPackages",
  };
  var pkgFolder = dirs[pkgInfo.Realm]
  var pkgPath = `${process.cwd()}/${pkgFolder}/_Index/${pkgInfo.Scope}_${
    pkgInfo.Name
  }@${pkgInfo.Version}/${pkgInfo.Name}`;
  return pkgPath;
}

async function fetchRegistryUrl() {
  var Options = program.opts();
  if (Options.registry) {
    return Options.registry;
  }

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

  var Options = program.opts();

  if (Options.registry) {
    const dotWallyPath = path.normalize(os.homedir() + "/.wally/auth.toml");
    if (!fs.existsSync(dotWallyPath)) {
      error("❌ Wally config not found");
      process.exit(1);
    }
    var wallyData = toml.parse(fs.readFileSync(dotWallyPath));

    var token = wallyData["tokens"][Options.registry];

    if (!token) {
      error("❌ Token not found, please login first");
      process.exit(1);
    }
    options.headers["Authorization"] = `Bearer ${token}`;
  }

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

    fileStream.on("finish", async function () {
      resolve();
    });
  }).then(async () => {
    await unzip(zipPath, `${tempDir}/${pkgInfo.Name}`);
  });

  async function unzip(zipPath, dir) {
    var zip = new AdmZip(zipPath);
    zip.extractAllTo(dir, true);
    fs.unlink(zipPath, (err) => {
      if (err) {
        error(err);
      }
    });
  }
}
