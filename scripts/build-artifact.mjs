// The one way to build the published artifact: dist/magical-athlete.html.
//
//   npm run build
//
// Steps: lint the source (refuses to build on any lint error) → generate the
// Tailwind CSS from the source → bundle the app with esbuild → write a single
// self-contained HTML page. Never hand-edit the built page or the published
// artifact; change magical-athlete-tracker.jsx and rebuild.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import { ESLint } from "eslint";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(root, "magical-athlete-tracker.jsx");
const OUT_DIR = join(root, "dist");
const OUT_FILE = join(OUT_DIR, "magical-athlete.html");

const step = (msg) => console.log(`\n▸ ${msg}`);
const fail = (msg) => {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
};

// 1. Lint. esbuild happily bundles code with undefined names (it treats them as
//    globals), so ESLint's no-undef is the only thing that catches a missing
//    import before it breaks the page at runtime.
step("Linting magical-athlete-tracker.jsx");
{
  const eslint = new ESLint({ cwd: root });
  const results = await eslint.lintFiles([SOURCE]);
  const errors = results.reduce((n, r) => n + r.errorCount, 0);
  const warnings = results.reduce((n, r) => n + r.warningCount, 0);
  if (errors || warnings) {
    const formatter = await eslint.loadFormatter("stylish");
    console.log(formatter.format(results));
  }
  if (errors) fail(`Lint found ${errors} error(s). Fix them before building.`);
  console.log(`  ok (${warnings} warning(s))`);
}

// 2. Tailwind CSS, generated from the classes actually used in the source.
step("Generating Tailwind CSS");
const tmp = mkdtempSync(join(tmpdir(), "ma-build-"));
let css;
try {
  const cssOut = join(tmp, "tailwind.css");
  // Run Tailwind's CLI script with this same Node, rather than the
  // node_modules/.bin shim: on Windows that shim is a .cmd file, which
  // execFileSync can't launch.
  const tailwindCli = join(root, "node_modules", "tailwindcss", "lib", "cli.js");
  execFileSync(
    process.execPath,
    [tailwindCli, "-c", join(root, "tailwind.config.cjs"), "-i", join(root, "src/styles.css"), "-o", cssOut, "--minify"],
    { cwd: root, stdio: ["ignore", "ignore", "pipe"] }
  );
  css = readFileSync(cssOut, "utf8");
} catch (e) {
  fail(`Tailwind failed:\n${e.stderr?.toString() || e.message}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log(`  ok (${(css.length / 1024).toFixed(1)} KB)`);

// 3. Bundle the app.
step("Bundling with esbuild");
let js;
try {
  const result = await esbuild.build({
    entryPoints: [join(root, "scripts/artifact/entry.jsx")],
    bundle: true,
    minify: true,
    format: "iife",
    jsx: "transform",
    loader: { ".jsx": "jsx" },
    define: { "process.env.NODE_ENV": '"production"' },
    target: ["es2020", "safari15"],
    write: false,
    logLevel: "silent",
  });
  js = result.outputFiles[0].text;
} catch (e) {
  fail(`esbuild failed:\n${e.message}`);
}
console.log(`  ok (${(js.length / 1024).toFixed(1)} KB)`);

// 4. Which commit this page was built from, so the live artifact can be traced
//    back to the source ("-dirty" means uncommitted changes were included).
let build = "unknown";
try {
  const sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root }).toString().trim();
  const dirty = execFileSync("git", ["status", "--porcelain", "--", "magical-athlete-tracker.jsx"], { cwd: root })
    .toString()
    .trim();
  build = dirty ? `${sha}-dirty` : sha;
} catch {
  // not a git checkout — leave as "unknown"
}

// 5. Assemble the page. A literal "</script" inside the bundle would end the
//    script tag early, so it's escaped.
step("Writing dist/magical-athlete.html");
const safeJs = js.replace(/<\/script/gi, "<\\/script");
const pageCss =
  ":root{--page-bg:#E5402A;color-scheme:light}html,body{min-height:100%}body{background:var(--page-bg);margin:0}" + css;
const html =
  `<!doctype html><html><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">` +
  `<meta name="ma-build" content="${build}">` +
  `<title>Magical Athlete</title><style>${pageCss}</style></head>` +
  `<body><div id="root"></div><script>${safeJs}</script></body></html>\n`;

// Sanity checks on the output before anyone publishes it.
// (React's own code contains the text "<script>", so only the closing tag is
// counted: there must be exactly one, and it must be ours.)
const closes = html.match(/<\/script/gi)?.length ?? 0;
if (closes !== 1) fail(`Expected exactly one </script> tag, found ${closes}.`);
if (html.length > 16 * 1024 * 1024) fail("Page is over the 16 MB artifact limit.");

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, html);
const hash = createHash("sha256").update(html).digest("hex").slice(0, 12);
console.log(`  ok — ${(html.length / 1024).toFixed(1)} KB, build ${build}, sha256 ${hash}`);
console.log("\nNext: npm test (smoke test) before publishing.");
