// npm run test:rules — tests firestore.rules against the Firestore emulator.
//
// Needs Java. The emulator (a ~65 MB download from Google) is fetched once
// into node_modules/.cache and started here on a spare port, then
// tests/rules.test.mjs runs against it.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, createWriteStream, renameSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const VERSION = "1.19.7";
const cacheDir = join(root, "node_modules", ".cache", "firestore-emulator");
const jar = join(cacheDir, `cloud-firestore-emulator-v${VERSION}.jar`);
const PORT = 8085;

if (spawnSync("java", ["-version"], { stdio: "ignore" }).status !== 0) {
  console.error("✖ Java isn't installed, and the Firestore emulator needs it. Install a Java runtime (17+) and try again.");
  process.exit(1);
}

if (!existsSync(jar)) {
  mkdirSync(cacheDir, { recursive: true });
  const url = `https://storage.googleapis.com/firebase-preview-drop/emulator/cloud-firestore-emulator-v${VERSION}.jar`;
  console.log(`▸ Downloading the Firestore emulator (once) from ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`✖ Download failed: HTTP ${res.status}`);
    process.exit(1);
  }
  await pipeline(Readable.fromWeb(res.body), createWriteStream(`${jar}.part`));
  renameSync(`${jar}.part`, jar);
}

console.log("▸ Starting the Firestore emulator");
const emulator = spawn("java", ["-jar", jar, "--host=127.0.0.1", `--port=${PORT}`], { stdio: "ignore" });
const stop = () => emulator.kill();
process.on("exit", stop);

let up = false;
for (let i = 0; i < 60 && !up; i++) {
  try {
    up = (await fetch(`http://127.0.0.1:${PORT}/`)).ok;
  } catch {
    await new Promise((r) => setTimeout(r, 500));
  }
}
if (!up) {
  console.error("✖ The emulator didn't start.");
  process.exit(1);
}

const run = spawnSync(process.execPath, ["--test", "--test-timeout=30000", join(root, "tests", "rules.test.mjs")], {
  stdio: "inherit",
  env: { ...process.env, FIRESTORE_EMULATOR_HOST: `127.0.0.1:${PORT}` },
});
stop();
process.exit(run.status ?? 1);
