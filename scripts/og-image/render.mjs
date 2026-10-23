// One-off renderer for the social preview image: screenshots og-image.html at 1200x630 into
// public/og-image.png. Playwright isn't a project dependency — run it with a local or global
// install (e.g. `npx -p playwright node scripts/og-image/render.mjs`).
import path from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(`file://${path.join(__dirname, "og-image.html")}`, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: path.join(__dirname, "..", "..", "public", "og-image.png") });
await browser.close();
console.log("Wrote public/og-image.png");
