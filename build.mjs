// يجهّز مجلد www (نسخة التطبيق للويب والتطبيقات الأصلية).
//   node scripts/build.mjs           ← نسخ الملفات فقط
//   node scripts/build.mjs --vendor  ← ينزّل الخطوط ومكتبات PDF/Excel داخل www/vendor ليعمل التطبيق بلا إنترنت (يحتاج إنترنت وقت البناء)
import { cpSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FONTS_CSS_URL = "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;700&family=Noto+Naskh+Arabic:wght@400;600;700&display=swap";
const CHROME_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
export const LIBS = {
  "pdf.min.js": "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
  "pdf.worker.min.js": "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js",
  "xlsx.full.min.js": "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
};

/** يستبدل روابط الخطوط في CSS بأسماء ملفات محلية ويعيد {css, files:[{url,name}]} */
export function rewriteFontsCss(css) {
  const files = new Map();
  const out = css.replace(/url\((['"]?)(https:\/\/fonts\.gstatic\.com\/[^)'"]+)\1\)/g, (_, _q, url) => {
    if (!files.has(url)) files.set(url, createHash("sha1").update(url).digest("hex").slice(0, 12) + (/\.woff2?(\?|$)/.test(url) ? (url.includes(".woff2") ? ".woff2" : ".woff") : ".ttf"));
    return `url(fonts/${files.get(url)})`;
  });
  return { css: out, files: [...files].map(([url, name]) => ({ url, name })) };
}

/** يعدّل index.html ليستخدم الملفات المحلية بدل الإنترنت */
export function patchIndexHtml(html) {
  let h = html;
  h = h.replace(/<link rel="preconnect"[^>]*fonts\.(googleapis|gstatic)\.com[^>]*>\s*/g, "");
  h = h.replace(/<link href="https:\/\/fonts\.googleapis\.com\/css2[^>]*>/, '<link rel="stylesheet" href="vendor/fonts.css">');
  for (const [name, url] of Object.entries(LIBS)) h = h.split(url).join("vendor/" + name);
  return h;
}

async function getBuf(fetchImpl, url, headers) {
  const r = await fetchImpl(url, headers ? { headers } : undefined);
  if (!r.ok) throw new Error(`فشل التنزيل ${r.status}: ${url}`);
  return Buffer.from(await r.arrayBuffer());
}

export async function vendorInto(www, fetchImpl = fetch) {
  const vd = join(www, "vendor"), fd = join(vd, "fonts");
  mkdirSync(fd, { recursive: true });
  const cssText = (await getBuf(fetchImpl, FONTS_CSS_URL, { "User-Agent": CHROME_UA })).toString("utf8");
  const { css, files } = rewriteFontsCss(cssText);
  if (!files.length) throw new Error("لم يتم العثور على ملفات خطوط في استجابة Google Fonts");
  for (const f of files) writeFileSync(join(fd, f.name), await getBuf(fetchImpl, f.url));
  writeFileSync(join(vd, "fonts.css"), css);
  for (const [name, url] of Object.entries(LIBS)) writeFileSync(join(vd, name), await getBuf(fetchImpl, url));
  const idx = join(www, "index.html");
  const before = readFileSync(idx, "utf8"), after = patchIndexHtml(before);
  if (after === before) throw new Error("لم يتغيّر index.html (تحقّق من روابط الخطوط والمكتبات)");
  writeFileSync(idx, after);
  const list = ["vendor/fonts.css", ...files.map(f => "vendor/fonts/" + f.name), ...Object.keys(LIBS).map(n => "vendor/" + n)];
  const swp = join(www, "sw.js");
  writeFileSync(swp, readFileSync(swp, "utf8").replace("/*VENDOR_FILES*/", JSON.stringify(list).slice(1, -1)));
  return list;
}

export function copyApp(www) {
  rmSync(www, { recursive: true, force: true });
  mkdirSync(www, { recursive: true });
  for (const f of ["index.html", "curriculum.json", "manifest.webmanifest", "sw.js", ".nojekyll"]) cpSync(join(ROOT, f), join(www, f));
  for (const d of ["icons", "img"]) if (existsSync(join(ROOT, d))) cpSync(join(ROOT, d), join(www, d), { recursive: true });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const www = join(ROOT, "www");
  copyApp(www);
  if (process.argv.includes("--vendor")) {
    const list = await vendorInto(www);
    console.log(`تم تنزيل ${list.length} ملفاً إلى www/vendor`);
  }
  console.log("جاهز: www/");
}
