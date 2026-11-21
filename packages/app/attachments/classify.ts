/* oxlint-disable lingui/no-unlocalized-strings -- Local document classification rules, independent of the interface language. */
import {
  attachmentCategories,
  attachmentExtension,
  fileKind,
  foldAttachmentText,
  normalizeAttachmentCategories,
  type AttachmentCategory,
} from "@ggmail/shared/attachments";
import { detailPairs, documentTerms } from "./classification-terms";

function words(text: string) {
  const spaced = text
    .normalize("NFKC")
    .replace(/[&+/]/g, " and ")
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

type Rule = { phrase: string; length: number; category?: AttachmentCategory };
const byFirstWord = new Map<string, Rule[]>();
function addRules(terms: string, category?: AttachmentCategory) {
  const normalized = new Set(phrases(terms));
  for (const phrase of normalized) {
    const tokens = phrase.split(" ");
    const first = tokens[0] ?? "";
    const rules = byFirstWord.get(first) ?? [];
    rules.push({ phrase, length: tokens.length, category });
    byFirstWord.set(first, rules);
  }
}
for (const category of attachmentCategories) {
  addRules(documentTerms[category].join("|"), category);
}
// These phrases contain a document word in another sense. Keep their words
// available for reference links and detail pairs without treating them as titles.
addRules(
  "fecha de entrada|de acuerdo con|in agreement with|booking reference|booking ref|booking number|reservation reference|reservation code|Buchungscode|Buchungsreferenz|código de reserva|referencia de reserva|κωδικός κράτησης|αριθμός κράτησης|codice di prenotazione|riferimento prenotazione|référence de réservation|numéro de réservation|order number|Bestellnummer|número de pedido|αριθμός παραγγελίας|numero d’ordine|numéro de commande",
);
for (const rules of byFirstWord.values()) {
  rules.sort((a, b) => b.length - a.length);
}

const referenceLinks = new Set(
  phrases(
    "for|for the|for your|for a|for an|of|of the|of your|in agreement with|against the|against|regarding|related to|für|für die|für den|zur|zum|zu|zu der|zu Ihrer|für Ihre|gemäß|laut|para|para el|para la|de|del|de la|de su|de tu|de acuerdo con el|de acuerdo con la|según|για|για την|για το|του|της|βάσει|per|per il|per la|della|dell|della sua|relativa all|relativo al|pour|pour la|pour le|pour votre|de votre|du|selon|relatif à la",
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

const conjunctions = new Set(phrases("and|und|y|και|e|et"));
const uncategorized: AttachmentCategory[] = ["uncategorized"];

function matchRule(tokens: string[], index: number) {
  return byFirstWord
    .get(tokens[index] ?? "")
    ?.find(
      (entry) =>
        entry.length === 1 || tokens.slice(index, index + entry.length).join(" ") === entry.phrase,
    );
}

function evidence(text: string, namesOneFile = false): AttachmentCategory[] | undefined {
  if ([examples, companions, requests, absent].some((terms) => contains(text, terms))) {
    return uncategorized;
  }
  const tokens = text.split(" ");
  const found = new Set<AttachmentCategory>();
  let lastEnd = 0;
  let endsWithLink = false;
  let inReference = false;
  for (let i = 0; i < tokens.length; i++) {
    const rule = matchRule(tokens, i);
    if (!rule) {
      continue;
    }
    if (!rule.category) {
      i += rule.length - 1;
      continue;
    }
    if (
      rule.category === "uncategorized" ||
      (/^(?:e ?)?tickets?$/.test(rule.phrase) && contains(text, supportTerms))
    ) {
      return uncategorized;
    }
    const link = tokens.slice(lastEnd, i).join(" ");
    const join = conjunctions.has(link);
    const reference =
      referenceLinks.has(link.replace(/^(?:(?:no|nr|n|number) )?\d+(?: \d+)* /u, "")) ||
      (!link && (endsWithLink || genitives.has(rule.phrase)));
    if (inReference && !reference && !join && link) {
      return uncategorized;
    }
    if (found.size && reference) {
      inReference = true;
    }
    // A coordinated reference ("invoice for a ticket and reservation") stays a reference.
    if (!inReference) {
      if (found.size && !found.has(rule.category)) {
        const travel =
          (rule.category === "booking" && found.has("ticket")) ||
          (rule.category === "ticket" && found.has("booking"));
        const financial =
          (rule.category === "invoice" && found.has("receipt")) ||
          (rule.category === "receipt" && found.has("invoice"));
        const itineraryReceipt =
          rule.category === "receipt" &&
          found.has("ticket") &&
          found.has("booking") &&
          rule.phrase === "receipt" &&
          !link;
        // Exported travel titles sometimes put a short booking locator between the two names.
        const locator =
          namesOneFile && /\d/.test(link) && /^[a-z0-9]{5,8}$/i.test(link.replaceAll(" ", ""));
        const combined =
          (travel && (!link || join || locator)) ||
          (join && (namesOneFile || financial)) ||
          (financial && namesOneFile && !link) ||
          itineraryReceipt;
        if (!combined) {
          return uncategorized;
        }
      }
      found.add(rule.category);
    }
    endsWithLink = rule.phrase.endsWith(" for");
    lastEnd = i + rule.length;
    i = lastEnd - 1;
  }
  if (found.size) {
    return normalizeAttachmentCategories([...found]);
  }
  const matches = detailRules.filter(
    ({ first, second }) => contains(text, first) && contains(text, second),
  );
  return matches.length > 1 ? uncategorized : matches[0] ? [matches[0].category] : undefined;
}

type BodyEvidence = {
  named: Map<string, AttachmentCategory[]>;
  shared?: AttachmentCategory[];
};

function reconcile(previous: AttachmentCategory[] | undefined, next: AttachmentCategory[]) {
  return !previous || previous.join() === next.join() ? next : uncategorized;
}

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
  const named = new Map<string, AttachmentCategory[]>();
  let shared: AttachmentCategory[] | undefined;
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
    const category = relevant ? evidence(text, targets.size === 1) : undefined;
    return { targets, category };
  }

  function record(key: string, categories: AttachmentCategory[]) {
    named.set(key, reconcile(named.get(key), categories));
  }

  // A German day-of-month ends with a period even in the middle of a sentence.
  marked = marked.replace(
    /(\d{1,2})\.(?=\s+(?:Januar|Jänner|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\b)/giu,
    "$1",
  );
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
        shared = reconcile(shared, category);
      }
    }
  }
  return { named, shared };
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

// Bare ticket filenames can also describe till receipts and help desk requests.
const bareTicket = /^(?:e ?)?tickets?(?: \d+)*$/;

function filenameCategory({
  ext,
  kind,
  stem,
  decorative,
}: ReturnType<typeof describe>): AttachmentCategory[] | undefined {
  if (decorative || (ext && kind === "other" && !["xml", "html", "htm", "pkpass"].includes(ext))) {
    return uncategorized;
  }
  if (bareTicket.test(stem)) {
    return undefined;
  }
  const title = evidence(stem, true);
  if (title) {
    return title;
  }
  // Numbered vendor exports use these prefixes as document identifiers, never as prose signals.
  const prefix = /^(\p{L}+)(?: nr| no)? \d+(?: |$)/u.exec(stem)?.[1];
  const numbered =
    prefix && Object.hasOwn(numberedPrefixes, prefix) ? numberedPrefixes[prefix] : undefined;
  if (numbered) {
    return [numbered];
  }
  const short = /^(statement|quote|estimate|order)(?:$| (?:no |nr |number )?\d+(?: |$))/.exec(
    stem,
  )?.[1];
  const category = short ? shortTitles[short] : undefined;
  return category ? [category] : undefined;
}

// The saved index omits message bodies. Preserve its original decision whenever
// the filename alone cannot settle the category.
export function classifyIndexedFilename(name: string) {
  return filenameCategory(describe(name));
}

export function classifyMessageAttachments(
  names: readonly string[],
  subject: string,
  readMessageText?: () => string,
): AttachmentCategory[][] {
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
  return files.map((file) => {
    const { name, stem, kind, ext } = file;
    const definitive = filenameCategory(file);
    if (definitive) {
      return definitive;
    }
    const genericTicket = bareTicket.test(stem);
    const title: AttachmentCategory[] | undefined = genericTicket ? ["ticket"] : undefined;
    if (!ext) {
      return title ?? uncategorized;
    }
    body ??= readBodyEvidence(names, readMessageText?.() ?? "", singleDocument);
    const key = filenameKey(name);
    const specific = body.named.get(key);
    if (specific && nameCounts.get(key) === 1) {
      return specific;
    }
    if (genericTicket) {
      if (contains(context, supportTerms)) {
        return uncategorized;
      }
      if (singleDocument && contains(context, retailTicket)) {
        return ["receipt"];
      }
    }
    const genericImage =
      /^(?:scan|img|dsc|image|document|photo|foto|bild|imagen|immagine|εικονα|σαρωση|\d+)(?: \d+)*$/.test(
        stem,
      );
    if (!singleDocument || (kind === "image" && !genericImage)) {
      return title ?? uncategorized;
    }
    if (genericTicket && fromSubject?.includes("ticket")) {
      return body.shared ?? fromSubject;
    }
    return body.shared ?? title ?? fromSubject ?? uncategorized;
  });
}
