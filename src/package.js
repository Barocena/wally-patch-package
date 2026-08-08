import fs from "fs";
import toml from "toml";
import AdmZip from "adm-zip";
import fetch from "node-fetch";
import { error, log } from "./utils.js";
import os from "os";
import { program } from "commander";
import path from "path";
import { satisfies } from "semver";

const dirs = {
  Shared: "Packages",
  Server: "ServerPackages",
  Dev: "DevPackages",
};

function parseWallySpec(spec) {
  if (!spec || typeof spec !== "string") {
    return null;
  }

  const slash = spec.indexOf("/");
  if (slash === -1) {
    return null;
  }

  const at = spec.lastIndexOf("@");
  const hasVersion = at > slash;
  const scopeName = hasVersion ? spec.slice(0, at) : spec;
  const scopeSlash = scopeName.indexOf("/");
  if (scopeSlash === -1) {
    return null;
  }

  return {
    scope: scopeName.slice(0, scopeSlash),
    name: scopeName.slice(scopeSlash + 1),
    version: hasVersion ? spec.slice(at + 1) : "",
    spec,
  };
}

export function matchesPackageQuery(query, pkg) {
  if (!query || !pkg?.name) {
    return false;
  }

  const q = String(query).trim();
  if (!q) {
    return false;
  }

  if (pkg.alias && pkg.alias === q) {
    return true;
  }
  if (pkg.name === q) {
    return true;
  }
  if (`${pkg.scope}/${pkg.name}` === q) {
    return true;
  }
  if (pkg.version && `${pkg.scope}/${pkg.name}@${pkg.version}` === q) {
    return true;
  }
  if (pkg.version && `${pkg.scope}_${pkg.name}@${pkg.version}` === q) {
    return true;
  }
  if (pkg.version && `${pkg.scope}_${pkg.name}@${pkg.version}.patch` === q) {
    return true;
  }
  return false;
}

export function parsePatchFileName(patchFile) {
  const base = patchFile.endsWith(".patch")
    ? patchFile.slice(0, -".patch".length)
    : patchFile;
  const at = base.lastIndexOf("@");
  if (at === -1) {
    return null;
  }

  const scopeName = base.slice(0, at);
  const us = scopeName.indexOf("_");
  if (us === -1) {
    return null;
  }

  return {
    alias: "",
    scope: scopeName.slice(0, us),
    name: scopeName.slice(us + 1),
    version: base.slice(at + 1),
  };
}

export function patchFileMatchesQuery(patchFile, query) {
  if (patchFile === query) {
    return true;
  }
  const parsed = parsePatchFileName(patchFile);
  return parsed ? matchesPackageQuery(query, parsed) : false;
}

function listWallyPackages(wallyData) {
  const realms = [
    ["dependencies", "Shared"],
    ["server-dependencies", "Server"],
    ["dev-dependencies", "Dev"],
  ];

  const packages = [];
  for (const [field, realm] of realms) {
    const deps = wallyData[field] || {};
    for (const [alias, spec] of Object.entries(deps)) {
      const parsed = parseWallySpec(spec);
      if (!parsed) {
        continue;
      }
      packages.push({
        alias,
        realm,
        scope: parsed.scope,
        name: parsed.name,
        version: parsed.version,
        spec: parsed.spec,
      });
    }
  }
  return packages;
}

function findWallyPackage(wallyData, query) {
  const packages = listWallyPackages(wallyData);
  const q = String(query).trim();

  const aliasHits = packages.filter((pkg) => pkg.alias === q);
  if (aliasHits.length === 1) {
    return aliasHits[0];
  }

  const specHits = packages.filter(
    (pkg) =>
      pkg.spec === q ||
      `${pkg.scope}/${pkg.name}` === q ||
      `${pkg.scope}/${pkg.name}@${pkg.version}` === q
  );
  if (specHits.length === 1) {
    return specHits[0];
  }
  if (specHits.length > 1) {
    error(
      "❌ Multiple packages matched",
      query,
      specHits.map((pkg) => pkg.spec).join(", ")
    );
    process.exit(1);
  }

  const nameHits = packages.filter((pkg) => pkg.name === q);
  if (nameHits.length === 1) {
    return nameHits[0];
  }
  if (nameHits.length > 1) {
    error(
      "❌ Multiple packages named",
      query + ":",
      nameHits.map((pkg) => pkg.spec).join(", ")
    );
    process.exit(1);
  }

  return null;
}

function semverCheck(pkgInfo, pkgPath) {
  const IndexDir = path.join(pkgPath, "../.."); // _Index

  var possible = fs
    .readdirSync(IndexDir)
    .filter((n) => n.startsWith(`${pkgInfo.Scope}_${pkgInfo.Name}@`))
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

export function fetchPackageInfo(packageName, dircheck) {
  const wallyPath = process.cwd() + "/wally.toml";

  if (!fs.existsSync(wallyPath)) {
    error("❌ Wally.toml not found");
    process.exit(1);
  }

  var Realm = "";
  var packageData = "";
  if (!dircheck) {
    var wallyData = toml.parse(fs.readFileSync(wallyPath));
    const found = findWallyPackage(wallyData, packageName);
    if (!found) {
      error("❌ Package not found", packageName);
      process.exit(1);
    }

    packageData = found.spec;
    Realm = found.realm;
    log(`🎯 found ${packageName} in ${found.alias} (${found.spec})`);
  } else {
    // direct directory checks for applying to avoid rechecking semver on known version
    log("📁 Directory check");
    Object.keys(dirs).forEach(function (key) {
      var path = `${process.cwd()}/${dirs[key]}/_Index`;
      var pName = packageName.replace("/", "_");
      if (fs.existsSync(path)) {
        var r = fs.readdirSync(path).filter((n) => n == pName);
        if (r.length > 0) {
          log(pName, key, r);
          Realm = key;
          packageData = packageName;
          return;
        }
      }
    });
    if (Realm == "") {
      return "skip";
    }
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
  var pkgFolder = dirs[pkgInfo.Realm];
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
