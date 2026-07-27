import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const cloudRoot = path.resolve(here, "..");
const repoRoot = path.resolve(cloudRoot, "..");
const publicRoot = path.join(cloudRoot, "public");

await rm(publicRoot, { recursive: true, force: true });
await mkdir(path.join(publicRoot, "admin"), { recursive: true });
for (const filename of ["media.html", "media.css", "media.js", "manifest.webmanifest"]) {
  await cp(path.join(repoRoot, "admin", filename), path.join(publicRoot, "admin", filename));
}
await cp(path.join(repoRoot, "icons"), path.join(publicRoot, "icons"), { recursive: true });

const dailySource = await readFile(path.join(repoRoot, "data", "daily-posts.js"), "utf8");
const context = { window: {} };
vm.runInNewContext(dailySource, context, { filename: "data/daily-posts.js" });
const posts = (context.window.DAILY_POSTS || []).map(({ date, title, summary, tags, url }) => ({ date, title, summary, tags, url }));
await writeFile(path.join(cloudRoot, "src", "public-posts.json"), `${JSON.stringify(posts, null, 2)}\n`);
