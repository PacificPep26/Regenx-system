// Dev tool: node scripts/html-to-pdf.mjs in.html out.pdf  (Chrome writes the bytes itself, so no text-mode corruption)
import { chromium } from "playwright-core";
import { pathToFileURL } from "node:url";
import path from "node:path";
const [inp, out] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const page = await browser.newPage();
await page.goto(pathToFileURL(path.resolve(inp)).href, { waitUntil: "networkidle" });
await page.pdf({ path: out, printBackground: true, preferCSSPageSize: true });
await browser.close();
console.log("written", out);
