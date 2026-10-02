// Builds the app as one self-contained HTML fragment for the claude.ai
// Artifact tool, written to dist-artifact/magical-athlete.html.
//
// The Artifact tool wraps the file in its own <html>/<head>/<body>, so the
// output is just: <title>, <style>, the root div and one classic <script>.
//
//   npm run build:artifact
//
// Then publish dist-artifact/magical-athlete.html to the existing artifact
// URL (ask Claude to "update the artifact").

import { build } from "vite";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

await build({
  root,
  configFile: resolve(root, "vite.artifact.config.js"),
  logLevel: "warn",
});

const built = readFileSync(resolve(root, "dist-artifact/index.html"), "utf8");

const styles = [...built.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
const scripts = [...built.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

if (styles.length === 0 || scripts.length !== 1) {
  throw new Error(
    `Unexpected build output: ${styles.length} <style> and ${scripts.length} <script> blocks (expected >=1 and exactly 1).`
  );
}

// The bundle is a single chunk. It is emitted as an ES module, but it is
// published as a classic script (the form the artifact has always used), so
// it must not contain module-only syntax.
if (/\bimport\.meta\b|(^|[;}])\s*export\s*[{*d]|(^|[;}])\s*import\s*[{"'*]/.test(scripts[0])) {
  throw new Error("Bundle uses module-only syntax (import/export/import.meta); it can't be published as a classic script.");
}

// A literal "</script" inside the bundle would end the tag early.
const js = scripts[0].replace(/<\/script/gi, "<\\/script");

const html = `<title>Magical Athlete</title>
<style>
${styles.join("\n")}
</style>
<div id="root"></div>
<script>${js}</script>
`;

const out = resolve(root, "dist-artifact/magical-athlete.html");
writeFileSync(out, html);
console.log(`Wrote ${out} (${(html.length / 1024).toFixed(0)} KB)`);
