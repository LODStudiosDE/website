// Turns a hand-written Tebex product description (HTML) into the parts the
// product page renders: description paragraphs, features, important notes and
// the showcase / walkthrough video links. Pure functions, no React.

export type Block =
  | { kind: "p"; html: string }
  | { kind: "h"; text: string }
  | { kind: "ul"; items: string[] };

export type ParsedDescription = {
  blocks: Block[];
  features: string[];
  notes: string[];
  showcase?: string;
  walkthrough?: string;
};

const decode = (s: string) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

const plain = (s: string) => decode(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

/** Keep only safe inline tags, drop everything else. */
const inline = (s: string) =>
  s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<(?!\/?(a|strong|b|em|i)\b)[^>]*>/gi, "")
    .replace(/[ \t]+/g, " ")
    .trim();

type Marker =
  | { type: "feature"; value: string }
  | { type: "note"; value: string }
  | { type: "showcase"; value: string }
  | { type: "walkthrough"; value: string }
  | null;

/** Explicit authoring markers at the start of a line: % feature, & note, < showcase, > walkthrough. */
function readMarker(line: string): Marker {
  const withTags = line.trim();
  // Prefer a real href when Tebex auto-linked the URL.
  const href = withTags.match(/href="([^"]+)"/i)?.[1];
  const t = decode(withTags.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  if (!t) return null;

  const grabUrl = (rest: string) => {
    const u = href ?? rest.match(/https?:\/\/\S+/i)?.[0];
    return u ? u.replace(/[)\].,;]+$/, "") : undefined;
  };

  const show = t.match(/^<+\s*(.+)$/);
  if (show) {
    const url = grabUrl(show[1]);
    if (url) return { type: "showcase", value: url };
  }

  const walk = t.match(/^>+\s*(.+)$/);
  if (walk) {
    const url = grabUrl(walk[1]);
    if (url) return { type: "walkthrough", value: url };
  }

  const note = t.match(/^&\s*(.+)$/);
  if (note && note[1].trim()) return { type: "note", value: note[1].trim() };

  const feat = t.match(/^%\s*(.+)$/);
  if (feat && feat[1].trim()) return { type: "feature", value: feat[1].trim() };

  return null;
}

// ── automatic extraction from free text ─────────────────────────────────────
// Descriptions are written by hand in Tebex, mostly WITHOUT the %/&/</> markers:
//   <p>**Features:**</p><p>* High FPS</p>…      <p>Features</p><ul><li>…</li></ul>
//   <p>**Important Notes:**<br>- no refunds<br>- not compatible with NPCs</p>
//   <p>Showcase: <a href="https://youtu.be/…">Video</a></p>
// The helpers below recognise those shapes so the sections fill themselves.

const BULLET = /^\s*(?:[*\-–—•·▪►✓✔>»→]+|\d{1,2}[.)])\s*/;

/** Installation steps are never features, even when they follow the list. */
const INSTALL_STEP =
  /server\.cfg|resources?\s+folder|^\W*(?:extract|unzip|drag|copy|paste|ensure|start|add)\b.*\b(?:lodstudios_\w+|resource|folder)/i;
const VIDEO_URL =
  /https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?[^\s"'<]*v=|shorts\/|live\/|embed\/)|youtu\.be\/|vimeo\.com\/|streamable\.com\/|medal\.tv\/)[^\s"'<)]*/i;

/**
 * Nested lists → one flat list, so no item is lost or glued to its group label:
 *   <li>Departments:<ul><li>A</li><li>B</li></ul></li>  →  <li>Departments:</li><li>A</li><li>B</li>
 */
function flattenNestedLists(html: string): string {
  let out = html;
  for (let i = 0; i < 4; i++) {
    const next = out
      // close the label item where its nested list starts, dropping that <ul>/<ol>
      .replace(/<li([^>]*)>((?:(?!<\/?(?:li|ul|ol)\b)[\s\S])*)<(?:ul|ol)\b[^>]*>/gi, "<li$1>$2</li>")
      // …and drop the nested list's end together with the label item's old </li>
      .replace(/<\/(?:ul|ol)>\s*<\/li>/gi, "");
    if (next === out) break;
    out = next;
  }
  return out;
}

/** "Departments:" — a bare group label inside a list, not an item of its own. */
const GROUP_LABEL = /^[^:]{2,60}:\s*$/;

/** A line that SAYS what its video is: "Showcase: Video", "Walkthrough: …". */
const VIDEO_LABEL = /showcase|trailer|preview|walk\s*-?\s*through|walkaround|\btour\b|rundgang|visite/i;

type Section = "desc" | "features" | "notes" | "skip";

/** "**Important Notes:** - no refunds" → { section: "notes", rest: "- no refunds" } */
function readHeading(text: string): { section: Section; rest: string } | null {
  const m = /^[\s*#_>]*([A-Za-zÀ-ÿ' ]{3,40}?)[\s*_]*(?::|-(?=\s)|$)[\s*_]*(.*)$/.exec(text);
  if (!m) return null;
  const label = m[1].trim().toLowerCase();
  const rest = (m[2] ?? "").trim();
  if (/^(key |main |top )?features?( list)?$|^highlights?$|^what'?s included$|^includes?$/.test(label))
    return { section: "features", rest };
  if (
    /^(important( notes?| information| info)?|notes?|please note|attention|warning|disclaimer|dependenc(y|ies)|requirements?|required|compatibility|customi[sz]ability|framework|technical( details| info(rmation)?)?)$/.test(
      label,
    )
  )
    return { section: "notes", rest };
  if (/^perfect for$/.test(label)) return { section: "skip", rest };
  return null;
}

/**
 * Technical / purchase information — NOT a content feature. Anything matching
 * goes to "Important Notes", whether it stands alone, sits inside the feature
 * list ("Optimized for FiveM") or is one sentence of a longer paragraph.
 */
const STRICT_HINTS = [
  // purchase & licence
  "\\brefunds?\\b", "chargeback", "\\bescrow\\b", "\\bencrypt(?:ed|ion)\\b",
  // compatibility & requirements
  "\\bnpcs?\\b", "compatib", "incompatible", "not\\s+supported", "no\\s+support",
  "\\brequire[sd]?\\b", "\\bdependenc(?:y|ies)\\b", "pre-?\\s?configured",
  // frameworks / platform
  "\\besx\\b", "\\bqb-?core\\b", "\\bqbox\\b", "\\bqbx\\b", "\\bstandalone\\b", "\\bframework\\b",
  "\\bonesync\\b", "game\\s?build", "\\bbuild\\s?\\d{4}\\b",
];
// Words that are too common in marketing prose ("for premium FiveM roleplay"),
// so they only count inside list items, where each entry is one short fact.
const ITEM_ONLY_HINTS = [
  "optimi[sz]ed", "optimi[sz]ation", "\\bfivem\\b", "\\bonly\\b", "\\bsupports?\\b", "\\btested\\b",
  "\\blicen[cs]e\\b",
];

/** For free sentences / stand-alone lines. */
const NOTE_HINT = new RegExp(STRICT_HINTS.join("|"), "i");
/** For list items: strict hints plus the item-only ones ("Optimized for FiveM"). */
const ITEM_NOTE_HINT = new RegExp([...STRICT_HINTS, ...ITEM_ONLY_HINTS].join("|"), "i");

const cleanItem = (raw: string) => {
  const s = raw
    .replace(BULLET, "")
    .replace(/^\*+|\*+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
};

/** One text line may hold several inline bullets: "Dynamic lighting *LOD´s". */
const splitInlineBullets = (text: string) =>
  text
    .split(/\s+(?=[*•▪►✓✔]\s*\S)|\s+(?=[-–—]\s+\S)/)
    .map((s) => s.trim())
    .filter(Boolean);

export function parseDescription(html: string, skipTitle?: string): ParsedDescription {
  const blocks: Block[] = [];
  const features: string[] = [];
  const notes: string[] = [];
  let showcase: string | undefined;
  let walkthrough: string | undefined;

  // How many DIFFERENT videos the whole text links to (same video as href and
  // as visible text, or with a different &t= offset, counts once).
  const videoCount = new Set(
    [...decode(html).matchAll(new RegExp(VIDEO_URL.source, "gi"))].map((x) =>
      x[0].replace(/[)\].,;]+$/, "").replace(/[?&]t=[^&]*/i, "").replace(/[?&]$/, ""),
    ),
  ).size;

  const pushUnique = (list: string[], value: string) => {
    const v = value.trim();
    if (v.length < 2) return;
    const key = v.toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (!list.some((x) => x.toLowerCase().replace(/[^a-z0-9]+/g, "") === key)) list.push(v);
  };

  const takeMarker = (line: string) => {
    const m = readMarker(line);
    if (!m) return false;
    if (m.type === "feature") pushUnique(features, m.value);
    else if (m.type === "note") pushUnique(notes, m.value);
    else if (m.type === "showcase") showcase = m.value;
    else walkthrough = m.value;
    return true;
  };

  /** A video link anywhere in the text → showcase / walkthrough card. */
  const takeVideo = (lineHtml: string): boolean => {
    const href = [...lineHtml.matchAll(/href="([^"]+)"/gi)]
      .map((x) => decode(x[1]))
      .find((u) => VIDEO_URL.test(u));
    const url = (href ?? decode(lineHtml).match(VIDEO_URL)?.[0])?.replace(/[)\].,;]+$/, "");
    if (!url) return false;
    const label = plain(lineHtml).toLowerCase();
    const isWalk = /walk\s*-?\s*through|walkaround|\btour\b|rundgang|visite/.test(label);
    if (isWalk) walkthrough ??= url;
    else if (!showcase) showcase = url;
    else if (url !== showcase) walkthrough ??= url; // a second, different video
    return true;
  };

  let section: Section = "desc";

  /**
   * Routes one line of text. Returns true when the line was consumed
   * (it became a feature / note / video / heading) and must not be shown again
   * inside the description.
   */
  const takeLine = (lineHtml: string, isListItem: boolean): boolean => {
    if (takeMarker(lineHtml)) return true;
    let text = plain(lineHtml);
    if (!text) return true;

    // Leading ">" is usually a pasted quote marker ("> > - Item", "> > Long
    // sentence…"), not a bullet. Drop it when a real bullet follows or when the
    // rest is prose; a short "> New Place" keeps counting as a bullet.
    const unquoted = text.replace(/^(?:>\s*)+/, "");
    if (unquoted !== text && (BULLET.test(unquoted) || unquoted.length > 120)) text = unquoted;

    // A line that is just "Showcase: Video" / a bare link is a video card.
    // Unlabelled links only count while the text holds at most two videos (a
    // showcase + walkthrough pair). More than that is a LIST of videos — e.g. a
    // subscription naming every included map — which must stay in the text and
    // must never be mistaken for this product's showcase or walkthrough.
    const isVideoLine = VIDEO_URL.test(decode(lineHtml));
    const labelled = VIDEO_LABEL.test(text);
    if (isVideoLine && (labelled || videoCount <= 2)) {
      takeVideo(lineHtml);
      if (text.replace(VIDEO_URL, "").length <= 60) return true;
    }

    // "– ensure lodstudios_xyz in your server.cfg" often sits right below the
    // feature list: it ends the list and stays in the description.
    if (INSTALL_STEP.test(text)) {
      section = "desc";
      return false;
    }

    const heading = isListItem ? null : readHeading(text);
    if (heading) {
      section = heading.section;
      if (heading.rest && section !== "skip") {
        for (const part of splitInlineBullets(heading.rest)) {
          pushUnique(section === "features" ? features : notes, cleanItem(part));
        }
      }
      return true;
    }

    // A sentence that INTRODUCES a list — "…our customized script offers:" —
    // opens the feature section, but stays in the description itself.
    if (
      !isListItem &&
      /\b(?:offers?|includes?|provides?|features?|comes with|contains?)\s*:[\s*_]*$/i.test(text)
    ) {
      section = "features";
      return false;
    }

    if (section === "skip") {
      if (isListItem || BULLET.test(text) || text.length <= 60) return true;
      section = "desc";
    }

    if (section === "features" || section === "notes") {
      const looksLikeItem = isListItem || BULLET.test(text) || text.length <= 90;
      if (looksLikeItem) {
        for (const part of isListItem ? [text] : splitInlineBullets(text)) {
          const item = cleanItem(part);
          // "Optimized for FiveM", "Pre-configured for RTX_TV", "ESX only" are
          // technical information, not content features → Important Notes.
          // A remark in brackets doesn't change what the item IS:
          // "24/7 Store (Compatible with all 24/7 mlos)" is still a feature.
          const core = item.replace(/\([^)]*\)|\[[^\]]*\]/g, " ");
          // "Scalable integration: …integrates into your FiveM server" — with a
          // "Label: sentence" item only the label decides for the loose hints;
          // the sentence is prose where "FiveM" / "supports" mean nothing.
          const label = /^([^:]{3,40}):\s+\S/.exec(core)?.[1];
          const isInfo =
            section === "notes" ||
            NOTE_HINT.test(core) ||
            ITEM_NOTE_HINT.test(label ?? core);
          pushUnique(isInfo ? notes : features, item);
        }
        return true;
      }
      section = "desc"; // a normal paragraph ends the section
    }

    // Stand-alone sentences like "This resource is encrypted via Asset Escrow".
    if (!isListItem && text.length <= 170 && NOTE_HINT.test(text) && !BULLET.test(text)) {
      pushUnique(notes, cleanItem(text));
      return true;
    }

    // A longer paragraph that CONTAINS such a sentence: copy just that sentence
    // into the notes, the paragraph itself stays in the description untouched.
    if (!isListItem && text.length > 170 && NOTE_HINT.test(text)) {
      for (const sentence of text.split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý0-9])/)) {
        const s = sentence.trim();
        if (s.length >= 12 && s.length <= 200 && NOTE_HINT.test(s)) pushUnique(notes, cleanItem(s));
      }
    }
    return false;
  };

  // Paragraphs AND <h1>–<h6>: some descriptions write "<h3>Features:</h3>" or put
  // the showcase link inside a heading tag.
  const re =
    /<(?:ul|ol)[^>]*>([\s\S]*?)<\/(?:ul|ol)>|<(?:p|h[1-6])[^>]*>([\s\S]*?)<\/(?:p|h[1-6])>/gi;
  let m: RegExpExecArray | null;
  let matched = false;

  const source = flattenNestedLists(html);

  while ((m = re.exec(source)) !== null) {
    matched = true;
    if (m[1] !== undefined) {
      // List items go to the section announced by the heading before the list.
      const items = [...m[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
        .filter((li) => plain(li[1]) && !GROUP_LABEL.test(plain(li[1])))
        .filter((li) => !takeLine(li[1], true))
        .map((li) => plain(li[1]));
      if (items.length) blocks.push({ kind: "ul", items });
      // A list closes the section: the next paragraph is description again.
      section = "desc";
    } else {
      const raw = m[2] ?? "";
      // A paragraph may hold several lines separated by <br>.
      const lines = inline(raw).split("\n");
      const kept = lines.filter((l) => !takeLine(l, false));
      const html2 = kept
        .map((l) =>
          l
            // pasted quote markers and raw markdown bold never belong on the page
            .replace(/^\s*(?:&gt;\s*)+/, "")
            .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>"),
        )
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      const text = plain(html2);
      if (!text) continue;
      if (skipTitle && text.toLowerCase() === skipTitle.toLowerCase()) continue;
      blocks.push({ kind: "p", html: html2 });
    }
  }

  if (!matched) {
    const lines = html.replace(/<br\s*\/?>/gi, "\n").split("\n");
    const kept = lines.filter((l) => !takeLine(l, false)).map(decode);
    const text = plain(kept.join("\n"));
    if (text) blocks.push({ kind: "p", html: text });
    return { blocks, features, notes, showcase, walkthrough };
  }

  // Short paragraphs directly before a list become section headings.
  const withHeadings = blocks.map((b, i) => {
    const nextIsList = blocks[i + 1]?.kind === "ul";
    if (b.kind === "p" && nextIsList) {
      const t = plain(b.html);
      if (t.length <= 42 && !/[.!?]$/.test(t)) return { kind: "h", text: t } as Block;
    }
    return b;
  });

  return { blocks: withHeadings, features, notes, showcase, walkthrough };
}
