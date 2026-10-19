// In-browser check of a licence photo against what the renter typed.
// Runs entirely on the renter's device (tesseract.js OCR): the photo is not sent to any
// third party for this step. It is a consistency check, not proof the licence is genuine.

const CONFUSABLE = { o: "0", i: "1", l: "1", s: "5", b: "8", z: "2", g: "9" };

function strip(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
// For licence numbers: letters OCR commonly swaps with digits are folded together on both sides.
function foldNumber(s) {
  return strip(s).replace(/[^a-z0-9]/g, "").replace(/[oilsbzg]/g, (c) => CONFUSABLE[c]);
}

function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

export function numberMatches(text, typed) {
  const want = foldNumber(typed);
  if (want.length < 4) return false;
  const hay = foldNumber(text);
  if (hay.includes(want)) return true;
  if (want.length < 7) return false;
  for (let i = 0; i + want.length - 1 <= hay.length; i++) {
    for (const len of [want.length - 1, want.length, want.length + 1]) {
      if (lev(hay.slice(i, i + len), want, 1) <= 1) return true;
    }
  }
  return false;
}

export function nameMatches(text, typed) {
  const tokens = strip(typed).split(/[^a-z]+/).filter((w) => w.length >= 2);
  if (!tokens.length) return false;
  const words = strip(text).split(/[^a-z]+/).filter((w) => w.length >= 2);
  const hit = (tok) => words.some((w) => lev(w, tok, tok.length >= 5 ? 1 : 0) <= (tok.length >= 5 ? 1 : 0));
  const matched = tokens.filter(hit).length;
  const allowedMiss = tokens.length >= 3 ? 1 : 0;
  return matched >= tokens.length - allowedMiss && matched >= Math.min(2, tokens.length);
}

const MONTHS = { jan: 1, feb: 2, fev: 2, mar: 3, apr: 4, avr: 4, may: 5, mai: 5, jun: 6, juin: 6, jul: 7, juil: 7, aug: 8, aou: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

function iso(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function datesInText(text) {
  const out = new Set();
  const t = String(text || "").replace(/[Oo]/g, (c, i, s) => (/[\d\/\-.]/.test(s[i - 1] || "") || /[\d\/\-.]/.test(s[i + 1] || "") ? "0" : c));
  let m;
  const num = /(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{4})/g;
  while ((m = num.exec(t))) {
    const [a, b, y] = [+m[1], +m[2], +m[3]];
    const x = iso(y, b, a); if (x) out.add(x); // day/month/year
    const z = iso(y, a, b); if (z) out.add(z); // month/day/year
  }
  const ymd = /(\d{4})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{1,2})/g;
  while ((m = ymd.exec(t))) { const x = iso(+m[1], +m[2], +m[3]); if (x) out.add(x); }
  const txt = /(\d{1,2})\s*([A-Za-zÀ-ÿ]{3,9})\.?\s*,?\s*(\d{4})/g;
  while ((m = txt.exec(t))) {
    const mon = MONTHS[strip(m[2]).slice(0, strip(m[2]).startsWith("juil") || strip(m[2]).startsWith("sept") ? 4 : 3)];
    if (mon) { const x = iso(+m[3], mon, +m[1]); if (x) out.add(x); }
  }
  return out;
}

// Dates printed on lines that talk about expiry/validity (the printed expiry, not birth or issue dates).
export function expiryDatesOnPhoto(text) {
  const lines = String(text || "").split(/\r?\n/);
  const out = new Set();
  lines.forEach((line, i) => {
    if (/exp|valid|until|jusqu|\b4b\b/i.test(line)) {
      datesInText(line + " " + (lines[i + 1] || "")).forEach((d) => out.add(d));
    }
  });
  return [...out].sort();
}

export function matchLicence(text, typed, today = new Date().toLocaleDateString("en-CA")) {
  const compact = String(text || "").replace(/\s/g, "");
  if (compact.length < 20) return { ok: false, codes: ["unreadable"] };
  const name = nameMatches(text, typed.fullName);
  const number = numberMatches(text, typed.licenseNumber);
  const expiry = datesInText(text).has(typed.expiry);
  if (name && number && expiry) return { ok: true, codes: [] };
  if (!name && !number && !expiry) return { ok: false, codes: ["not_a_licence"] };
  const codes = [];
  if (!name) codes.push("name_mismatch");
  if (!number) codes.push("number_mismatch");
  let expiredOn = null;
  if (!expiry) {
    const printed = expiryDatesOnPhoto(text);
    if (printed.length && printed[printed.length - 1] < today) {
      codes.push("photo_expired");
      expiredOn = printed[printed.length - 1];
    } else codes.push("expiry_mismatch");
  }
  return { ok: false, codes, expiredOn };
}

// Grayscale + upscale + contrast stretch: helps OCR on ordinary phone photos.
function preprocess(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(2, 2200 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const d = ctx.getImageData(0, 0, c.width, c.height);
      let lo = 255, hi = 0;
      for (let i = 0; i < d.data.length; i += 4) {
        const g = 0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2];
        d.data[i] = d.data[i + 1] = d.data[i + 2] = g;
        if (g < lo) lo = g; if (g > hi) hi = g;
      }
      const span = Math.max(1, hi - lo);
      for (let i = 0; i < d.data.length; i += 4) {
        const v = ((d.data[i] - lo) * 255) / span;
        d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
      }
      ctx.putImageData(d, 0, 0);
      resolve(c);
    };
    img.onerror = () => reject(new Error("image load failed"));
    img.src = dataUrl;
  });
}

export async function readLicencePhoto(dataUrl) {
  const [{ createWorker }, canvas] = await Promise.all([import("tesseract.js"), preprocess(dataUrl)]);
  const worker = await createWorker("eng");
  try {
    const { data } = await Promise.race([
      worker.recognize(canvas),
      new Promise((_, rej) => setTimeout(() => rej(new Error("ocr timeout")), 90000)),
    ]);
    return data.text || "";
  } finally {
    await worker.terminate();
  }
}
