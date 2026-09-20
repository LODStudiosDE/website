import { readFileSync, writeFileSync } from "node:fs";
const P = "src/lib/subscriptions.ts";
const raw = readFileSync(P, "utf8"); const crlf = raw.includes("\r\n");
let s = raw.replace(/\r\n/g, "\n");
const one = (a, b) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error("erwartet 1 Treffer, " + n + ": " + a.slice(0, 70)); s = s.replace(a, () => b); };

// 1) separator optional
one('const m = /^(.*?)\s*[-–—:]\s*(\d{1,2})\s*(?:months?|monate?|mois)\s*$/i.exec(name.trim());',
    'const m = /^(.*?)\s*(?:[-–—:]\s*)?(\d{1,2})\s*(?:months?|monate?|mois)\s*$/i.exec(name.trim());');
one('/** "Estates -  3 months" → { base: "Estates", months: 3 }; null if no term suffix. */',
    '/**\n * "Estates - 3 months" / "LOD Plus 3 Months" → { base, months }; null if the name\n * carries no term suffix. The separator is optional: the shop names these packages\n * by hand and both spellings occur.\n */');

// 2) perMonth field on the type
one('  /** What this term would cost at the 1-month price (months × monthly). */\n  regularTotal: number | null;',
    '  /**\n   * True when Tebex bills this term MONTHLY at a (possibly reduced) monthly\n   * price, false when its price covers the whole term. Decided from the two\n   * real prices: a whole-term price is always above the 1-month price, so a\n   * multi-month package priced at or below it can only be a per-month price.\n   */\n  perMonth: boolean;\n  /** What this term would cost at the 1-month price — the whole term, or one month when `perMonth`. */\n  regularTotal: number | null;');

// 3) the computation
one('    const regularTotal = monthly != null ? Math.round(monthly * months * 100) / 100 : null;',
    '    // A 3-month package with the SAME price as the 1-month one is billed per\n    // month: reading it as a whole-term price would show a 67 % "saving" that\n    // does not exist. Only a price above the monthly one covers the whole term.\n    const perMonth = pkg != null && months > 1 && monthly != null && pkg.total_price <= monthly;\n    const regularTotal =\n      monthly == null ? null : perMonth ? monthly : Math.round(monthly * months * 100) / 100;');
one('    return { months, pkg, regularTotal, savePercent };', '    return { months, pkg, perMonth, regularTotal, savePercent };');

writeFileSync(P, crlf ? s.replace(/\n/g, "\r\n") : s);
console.log("ok");
