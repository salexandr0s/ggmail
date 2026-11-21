/* oxlint-disable lingui/no-unlocalized-strings -- Local document classification rules, independent of the interface language. */
import {
  attachmentCategories,
  attachmentExtension,
  fileKind,
  foldAttachmentText,
  type AttachmentCategory,
} from "@ggmail/shared/attachments";
import { detailPairs, documentTerms } from "./classification-terms";

function words(text: string) {
  const spaced = text
    .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, "$1 $2")
    .replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2");
  return (
    foldAttachmentText(spaced)
      .match(/\p{L}+|\p{N}+/gu)
      ?.join(" ") ?? ""
  );
}

function phrases(text: string) {
  return text.split("|").map(words);
}

function contains(value: string, terms: string[]) {
  const padded = " " + value + " ";
  return terms.some((term) => padded.includes(" " + term + " "));
}

type Rule = { phrase: string; length: number; category: AttachmentCategory };
const byFirstWord = new Map<string, Rule[]>();
for (const category of attachmentCategories) {
  const normalized = new Set(phrases(documentTerms[category].join("|")));
  for (const phrase of normalized) {
    const tokens = phrase.split(" ");
    const first = tokens[0] ?? "";
    const rules = byFirstWord.get(first) ?? [];
    rules.push({ phrase, length: tokens.length, category });
    byFirstWord.set(first, rules);
  }
}
for (const rules of byFirstWord.values()) {
  rules.sort((a, b) => b.length - a.length);
}

const referenceLinks = new Set(
  phrases(
    "for|for the|for your|of|of the|of your|against the|against|regarding|related to|für|für die|für den|zur|zum|zu|zu der|zu Ihrer|für Ihre|gemäß|laut|para|para el|para la|de|del|de la|de su|de tu|según|για|για την|για το|του|της|βάσει|per|per il|per la|della|dell|della sua|relativa all|relativo al|pour|pour la|pour le|pour votre|de votre|du|selon|relatif à la",
  ),
);
const genitives = new Set(
  phrases("τιμολογίου|τιμολογίων|παραγγελίας|κράτησης|σύμβασης|προσφοράς|εισιτηρίου"),
);

const supportTerms = phrases(
  "support|helpdesk|help desk|soporte|assistance|assistenza|υποστήριξη|υποστήριξης|Störung|incident",
);
const retailTicket = phrases(
  "ticket de caisse|ticket de carte bancaire|ticket CB|ticket de compra|ticket de venta|tique de compra",
);
const examples = phrases(
  "template|sample form|specimen|Muster|Vorlage|plantilla|modelo de|υπόδειγμα|πρότυπο|fac simile|modello di|modèle de|exemple de",
);
const companions = phrases(
  "terms and conditions|conditions générales|AGB|condiciones generales|condizioni generali|όροι χρήσης|privacy policy|brochure|Broschüre|folleto|φυλλάδιο|opuscolo|agenda|meeting minutes|Tagesordnung|ordre du jour|price list|Preisliste|lista de precios|τιμοκατάλογος|listino prezzi|grille tarifaire|user guide|Bedienungsanleitung|manual de usuario|οδηγίες χρήσης|manuale utente|mode d’emploi",
);
const imageAssets = phrases(
  "logo|banner|signature|firma digital|signatur|υπογραφή|icon|avatar|facebook|instagram",
);
const enclosures = phrases(
  "attached|enclosed|attaching|attachment|anbei|beigefügt|im anhang|beiliegend|adjunto|adjunta|adjuntamos|adjuntado|συνημμένο|συνημμένα|επισυνάπτεται|επισυνάπτω|επισυνάπτουμε|in allegato|alleghiamo|allego|allegata|allegato|ci-joint|ci-jointe|en pièce jointe|vous trouverez en annexe",
);
const requests = phrases(
  "please send|could you send|can you send|please attach|could you attach|bitte senden|bitte schicken|können Sie mir|bitte zusenden|podría enviar|puede enviarme|por favor envíe|por favor adjunte|μπορείτε να στείλετε|παρακαλώ στείλτε|potrebbe inviare|potete inviare|si prega di inviare|merci de nous envoyer|pouvez-vous envoyer|veuillez nous transmettre",
);
const absent = phrases(
  "not attached|not enclosed|isn’t attached|no invoice attached|no receipt attached|is not included|will be attached|nicht beigefügt|nicht im Anhang|nicht angehängt|no se adjunta|no se adjuntó|no adjunto|δεν επισυνάπτεται|non è allegata|non è allegato|non allegato|non allegata|n’est pas jointe|n’est pas joint|pas en pièce jointe",
);

const detailRules = detailPairs.map(({ category, first, second }) => ({
  category,
  first: phrases(first),
  second: phrases(second),
}));

function evidence(text: string): AttachmentCategory | undefined {
  if (
    contains(text, examples) ||
    contains(text, companions) ||
    contains(text, requests) ||
    contains(text, absent)
  ) {
    return "uncategorized";
  }
  const tokens = text.split(" ");
  let primary: AttachmentCategory | undefined;
  let lastEnd = 0;
  let endsWithLink = false;
  for (let i = 0; i < tokens.length; i++) {
    const rules = byFirstWord.get(tokens[i] ?? "");
    const rule = rules?.find(
      (entry) => entry.length === 1 || tokens.slice(i, i + entry.length).join(" ") === entry.phrase,
    );
    if (!rule) {
      continue;
    }
    // A till receipt contains the word “ticket”. Consume the whole document name once.
    const category =
      /^tickets?$/.test(rule.phrase) && contains(text, supportTerms)
        ? "uncategorized"
        : rule.category;
    if (primary && primary !== category) {
      const link = tokens.slice(lastEnd, i).join(" ");
      if (
        !referenceLinks.has(link) &&
        !(link === "" && (endsWithLink || genitives.has(rule.phrase)))
      ) {
        return "uncategorized";
      }
    }
    primary ??= category;
    endsWithLink = rule.phrase.endsWith(" for");
    lastEnd = i + rule.length;
    i = lastEnd - 1;
  }
  if (primary) {
    return primary;
  }
  const matches = detailRules.filter(
    ({ first, second }) => contains(text, first) && contains(text, second),
  );
  return matches.length > 1 ? "uncategorized" : matches[0]?.category;
}

type BodyEvidence = {
  named: Map<string, Set<AttachmentCategory>>;
  shared: Set<AttachmentCategory>;
};

function filenameKey(name: string) {
  return name.normalize("NFC").toLowerCase().replaceAll("ς", "σ");
}

// Plain-text replies can retain quoted mail even after Gmail’s quote elements are removed.
function currentMessageText(raw: string) {
  const lines: string[] = [];
  for (const line of raw.slice(0, 4000).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (
      trimmed === "--" ||
      /^-{2,}\s*(?:original message|forwarded message|ursprüngliche nachricht|weitergeleitete nachricht|mensaje original|mensaje reenviado|αρχικό μήνυμα|προωθημένο μήνυμα|messaggio originale|messaggio inoltrato|message d.origine|message transféré)\s*-{2,}$/iu.test(
        trimmed,
      ) ||
      /^(?:on .+ wrote|am .+ schrieb.*|el .+ escribió|στις .+ έγραψε|il .+ ha scritto|le .+ a écrit)\s*[:：]$/iu.test(
        trimmed,
      )
    ) {
      break;
    }
    if (!trimmed.startsWith(">")) {
      lines.push(line);
    }
  }
  return lines.join("\n");
}

function readBodyEvidence(
  names: readonly string[],
  raw: string,
  singleDocument: boolean,
): BodyEvidence {
  const named = new Map<string, Set<AttachmentCategory>>();
  const shared = new Set<AttachmentCategory>();
  const body = currentMessageText(raw)
    .normalize("NFC")
    .replace(/[\uE000\uE001]/g, " ");
  const lowerBody = filenameKey(body);
  const keys = [...new Set(names.map(filenameKey))]
    .filter((key) => key && lowerBody.includes(key))
    .sort((a, b) => b.length - a.length);
  // Preserve filename punctuation across sentence splitting. Match full names, longest first,
  // so "a.pdf" cannot claim a label belonging to "signed-a.pdf" or "a.pdf.p7m".
  let marked = body;
  if (keys.length) {
    const alternatives = keys.map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const pattern = new RegExp(
      `(?<![\\p{L}\\p{N}_.-])(?:${alternatives})(?![\\p{L}\\p{N}_-]|\\.[\\p{L}\\p{N}])`,
      "giu",
    );
    const indices = new Map(keys.map((key, index) => [key, index]));
    marked = body.replace(pattern, (name) => {
      const index = indices.get(filenameKey(name));
      return index === undefined ? name : "\uE000" + index + "\uE001";
    });
  }

  function hint(clause: string) {
    const targets = new Set<string>();
    const rest = clause.replace(/\uE000(\d+)\uE001/g, (_, index: string) => {
      const key = keys[Number(index)];
      if (key) {
        targets.add(key);
      }
      return " ";
    });
    const text = words(rest);
    const relevant = targets.size > 0 || (singleDocument && contains(text, enclosures));
    const category = relevant ? evidence(text) : undefined;
    return { targets, category };
  }

  function record(key: string, category: AttachmentCategory) {
    const previous = named.get(key) ?? new Set();
    previous.add(category);
    named.set(key, previous);
  }

  for (const clause of marked.split(/[;·!?\n]+|\.(?=\s|$)/u)) {
    const { targets, category } = hint(clause);
    if (targets.size > 1) {
      // Only pair a coordinated list when every part names and describes its own file.
      const parts = clause.split(/,\s*|\s+(?:and|und|y|και|e|et)\s+/iu).map(hint);
      if (parts.every((part) => part.targets.size === 1 && part.category)) {
        for (const part of parts) {
          const key = part.targets.values().next().value;
          if (key && part.category) {
            record(key, part.category);
          }
        }
      }
    } else if (category) {
      const key = targets.values().next().value;
      if (key) {
        record(key, category);
      } else {
        shared.add(category);
      }
    }
  }
  return { named, shared };
}

function decision(values: Set<AttachmentCategory> | undefined): AttachmentCategory | undefined {
  if (!values?.size) {
    return undefined;
  }
  return values.size === 1 ? values.values().next().value : "uncategorized";
}

function describe(name: string) {
  // A signed Italian electronic invoice commonly ends in .xml.p7m.
  const innerName = name.trim().replace(/\.(xml|pdf)\.p7m$/i, ".$1");
  const ext = attachmentExtension(innerName);
  const kind = fileKind(innerName);
  const title = ext ? innerName.slice(0, innerName.lastIndexOf(".")) : innerName;
  const stem = words(title.slice(0, 512));
  return { name, ext, kind, stem, decorative: kind === "image" && contains(stem, imageAssets) };
}

const numberedPrefixes: Record<string, AttachmentCategory> = {
  inv: "invoice",
  rg: "invoice",
  re: "invoice",
  fac: "invoice",
  fatt: "invoice",
  τιμ: "invoice",
  τπυ: "invoice",
  τδα: "invoice",
  rcpt: "receipt",
  απυ: "receipt",
  αλπ: "receipt",
  po: "order",
  qte: "quote",
};

const shortTitles: Record<string, AttachmentCategory> = {
  statement: "statement",
  order: "order",
  quote: "quote",
  estimate: "quote",
};

export function classifyMessageAttachments(
  names: readonly string[],
  subject: string,
  readMessageText?: () => string,
): AttachmentCategory[] {
  const files = names.map(describe);
  const singleDocument = files.filter((file) => !file.decorative).length === 1;
  const nameCounts = new Map<string, number>();
  for (const name of names) {
    const key = filenameKey(name);
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }
  const context = words(subject.slice(0, 1024));
  const isQuestion =
    /[?？]\s*$/u.test(subject) || (/\p{Script=Greek}/u.test(subject) && /[;;]\s*$/u.test(subject));
  const fromSubject = isQuestion ? undefined : evidence(context);
  let body: BodyEvidence | undefined;
  return files.map(({ name, ext, kind, stem, decorative }) => {
    if (
      decorative ||
      (ext && kind === "other" && !["xml", "html", "htm", "pkpass"].includes(ext))
    ) {
      return "uncategorized";
    }
    const genericTicket = /^(?:e )?tickets?(?: \d+)*$/.test(stem);
    const title = evidence(stem);
    if (title && !genericTicket) {
      return title;
    }
    // Numbered vendor exports use these prefixes as document identifiers, never as prose signals.
    const prefix = /^(\p{L}+)(?: nr| no)? \d+(?: |$)/u.exec(stem)?.[1];
    if (prefix && Object.hasOwn(numberedPrefixes, prefix)) {
      return numberedPrefixes[prefix] ?? "uncategorized";
    }
    const short = /^(statement|quote|estimate|order)(?: \d+)*$/.exec(stem)?.[1];
    if (short && shortTitles[short]) {
      return shortTitles[short];
    }
    if (!ext) {
      return title ?? "uncategorized";
    }
    body ??= readBodyEvidence(names, readMessageText?.() ?? "", singleDocument);
    const key = filenameKey(name);
    const specific = decision(body.named.get(key));
    if (specific && nameCounts.get(key) === 1) {
      return specific;
    }
    if (genericTicket) {
      if (contains(context, supportTerms)) {
        return "uncategorized";
      }
      if (singleDocument && contains(context, retailTicket)) {
        return "receipt";
      }
    }
    const genericImage =
      /^(?:scan|img|dsc|image|document|photo|foto|bild|imagen|immagine|εικονα|σαρωση|\d+)(?: \d+)*$/.test(
        stem,
      );
    if (!singleDocument || (kind === "image" && !genericImage)) {
      return title ?? "uncategorized";
    }
    return decision(body.shared) ?? title ?? fromSubject ?? "uncategorized";
  });
}
