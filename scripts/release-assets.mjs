import { execFileSync } from "node:child_process";
import { createHash, createPrivateKey, sign } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const [command, tag, output] = process.argv.slice(2);
const version = tag?.slice(1);
if (!tag?.startsWith("v") || !stableVersion.test(version) || !output) {
  throw new Error("Expected a stable tag vMAJOR.MINOR.PATCH and an output directory");
}
const folder = resolve(output);
const name = `xungen-${version}.tar.gz`;
const metadataName = `xungen-${version}.update.json`;
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function flag(variable) {
  const value = process.env[variable] || "false";
  if (value !== "true" && value !== "false") throw new Error(`Invalid ${variable}`);
  return value === "true";
}

async function prepare() {
  const commit = git("rev-parse", `${tag}^{commit}`);
  if (commit !== git("rev-parse", "HEAD") || git("status", "--porcelain")) {
    throw new Error("Release must be prepared from a clean checkout of the tag");
  }
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  if (pkg.version !== version) throw new Error("Tag and package.json versions differ");

  const sections = (await readFile("CHANGELOG.md", "utf8")).split(/(?=^## )/m);
  const entry = sections.find((section) => section.startsWith(`## [${version}]`));
  const notes = entry?.slice(entry.indexOf("\n") + 1).trim();
  if (!notes) throw new Error("Version is missing release notes in CHANGELOG.md");

  const mandatory = flag("UPDATE_MANDATORY");
  const securityFix = flag("UPDATE_SECURITY_FIX");
  const minSupportedVersion = process.env.UPDATE_MIN_SUPPORTED_VERSION || "";
  if (minSupportedVersion && !stableVersion.test(minSupportedVersion)) {
    throw new Error("Invalid UPDATE_MIN_SUPPORTED_VERSION");
  }
  if (minSupportedVersion && minSupportedVersion.localeCompare(version, "en", { numeric: true }) > 0) {
    throw new Error("Minimum supported version exceeds the release");
  }

  const assets = join(folder, "assets");
  await mkdir(assets, { recursive: true });
  const archive = join(assets, name);
  git("archive", "--format=tar.gz", `--prefix=xungen-${version}/`, "-o", archive, commit);
  const bytes = await readFile(archive);
  const digest = sha256(bytes);
  await writeFile(join(assets, `${name}.sha256`), `${digest}  ${name}\n`);

  const key = process.env.UPDATE_SIGNING_PRIVATE_KEY?.trim();
  let signature;
  if (key) {
    const privateKey = createPrivateKey(key.replaceAll("\\n", "\n"));
    if (privateKey.asymmetricKeyType !== "rsa" || privateKey.asymmetricKeyDetails.modulusLength < 2048) {
      throw new Error("Update signing requires an RSA key of at least 2048 bits");
    }
    signature = `${name}.sig`;
    await writeFile(join(assets, signature), sign("sha256", bytes, privateKey).toString("base64"));
  }

  const metadata = {
    version, tag, channel: "stable", releaseDate: git("show", "-s", "--format=%cI", commit),
    mandatory, securityFix, minSupportedVersion, commit,
    assets: [{ name, size: bytes.length, sha256: digest, platform: "self-hosted", architecture: "source", signature }],
  };
  await writeFile(join(assets, metadataName), JSON.stringify(metadata, null, 2) + "\n");

  const markers = [
    `<!-- xungen-update-mandatory: ${mandatory} -->`,
    `<!-- xungen-security-fix: ${securityFix} -->`,
    ...(minSupportedVersion ? [`<!-- xungen-min-supported-version: ${minSupportedVersion} -->`] : []),
  ];
  await writeFile(join(folder, "notes.md"), `${notes}\n\n${markers.join("\n")}\n`);
}

async function verify() {
  const metadata = JSON.parse(await readFile(join(folder, metadataName), "utf8"));
  if (metadata.tag !== tag || metadata.version !== version || metadata.channel !== "stable" ||
      !/^[a-f0-9]{40}$/.test(metadata.commit) || !Number.isFinite(Date.parse(metadata.releaseDate))) {
    throw new Error("Invalid release metadata");
  }
  const asset = metadata.assets?.find((entry) => entry.name === name);
  const bytes = await readFile(join(folder, name));
  const digest = sha256(bytes);
  const checksum = (await readFile(join(folder, `${name}.sha256`), "utf8")).trim();
  if (asset?.size !== bytes.length || asset.sha256 !== digest || checksum !== `${digest}  ${name}`) {
    throw new Error("Release archive size or SHA-256 differs from its metadata");
  }
  console.log(`Verified ${name}: ${digest}`);
}

if (command === "prepare") await prepare();
else if (command === "verify") await verify();
else throw new Error("Expected prepare or verify");
