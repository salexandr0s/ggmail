import { describe, expect, test } from "bun:test";
import type { AttachmentCategory } from "@ggmail/shared/attachments";
import { classifyMessageAttachments } from "./classify";

function classifyAttachment(name: string, subject: string, readMessageText?: () => string) {
  return classifyMessageAttachments([name], subject, readMessageText)[0];
}

describe("attachment categories", () => {
  const examples: [AttachmentCategory, string[]][] = [
    [
      "invoice",
      ["Invoice123", "Schlussrechnung", "Factura2026", "ΤΙΜΟΛΟΓΙΟ", "Fattura", "Facture"],
    ],
    [
      "receipt",
      [
        "PaymentConfirmation",
        "Kassenbon",
        "ticket de compra",
        "Απόδειξη",
        "scontrino",
        "ticket de caisse",
      ],
    ],
    ["contract", ["lease", "Mietvertrag", "contrato", "ΣΥΜΦΩΝΗΤΙΚΟ", "contratto", "contrat"]],
    [
      "ticket",
      [
        "boarding-pass",
        "Fahrkarte",
        "tarjeta_de_embarque",
        "Κάρτα επιβίβασης",
        "carta d'imbarco",
        "carte d’embarquement",
      ],
    ],
    [
      "booking",
      [
        "itinerary",
        "Buchungsbestätigung",
        "reservación",
        "επιβεβαίωση κράτησης",
        "prenotazione",
        "réservation",
      ],
    ],
    [
      "statement",
      [
        "bank statement",
        "Kontoauszüge",
        "estado de cuenta",
        "κίνηση λογαριασμού",
        "estratto conto",
        "relevé de compte",
      ],
    ],
    [
      "order",
      [
        "PurchaseOrder",
        "Bestellbestätigung",
        "orden de compra",
        "Παραγγελία",
        "ordine",
        "bon de commande",
      ],
    ],
    ["quote", ["quotation", "Kostenvoranschlag", "presupuesto", "ΠΡΟΣΦΟΡΑ", "preventivo", "devis"]],
  ];
  for (const [category, titles] of examples) {
    for (const title of titles) {
      test(title, () => {
        expect(classifyAttachment(title + "_2026.pdf", "")).toBe(category);
        expect(classifyAttachment("scan.jpeg", title.normalize("NFD"))).toBe(category);
      });
    }
  }
  test("uses an explicit enclosure sentence for an opaque document in each language", () => {
    for (const text of [
      "Your invoice is attached.",
      "Anbei Ihre Rechnung.",
      "Adjunto la factura.",
      "Σας επισυνάπτω το τιμολόγιο.",
      "In allegato la fattura.",
      "Veuillez trouver ci-joint votre facture.",
    ]) {
      expect(classifyAttachment("scan.pdf", "FYI", () => text)).toBe("invoice");
    }
    expect(
      classifyAttachment(
        "scan.pdf",
        "FYI",
        () => "Attached is a summary. Your invoice arrives later.",
      ),
    ).toBe("uncategorized");
    expect(classifyAttachment("doc.pdf", "FYI", () => "Invoice attached. Contract enclosed.")).toBe(
      "uncategorized",
    );
  });
  test("gives specific filenames priority and leaves ambiguous evidence unassigned", () => {
    expect(classifyAttachment("Facture42.pdf", "Κράτηση")).toBe("invoice");
    expect(classifyAttachment("scan.pdf", "Your receipt and contract")).toBe("uncategorized");
    expect(classifyAttachment("receipt-contract.pdf", "Contract")).toBe("uncategorized");
    expect(classifyMessageAttachments(["scan.pdf", "second.pdf"], "Rechnung")[0]).toBe(
      "uncategorized",
    );
    expect(classifyAttachment("ticket.pdf", "Support ticket closed")).toBe("uncategorized");
    expect(classifyAttachment("ticketing.pdf", "")).toBe("uncategorized");
    expect(classifyAttachment("document.pkpass", "")).toBe("uncategorized");
    expect(classifyAttachment("INV2026.xml", "")).toBe("invoice");
    for (const name of [
      "invite.ics",
      "photo.zip",
      "logo.png",
      "terms_and_conditions.pdf",
      "sunset.jpg",
    ]) {
      expect(classifyAttachment(name, "Your invoice")).toBe("uncategorized");
    }
  });
});

describe("classifying the files in one message", () => {
  const names = ["Scan.01.pdf", "Copy (2).pdf", "export.pdf"];

  test.each([
    "Invoice: Scan.01.pdf and payment receipt: Copy (2).pdf",
    "Rechnung: Scan.01.pdf und Zahlungsquittung: Copy (2).pdf",
    "Factura: Scan.01.pdf y recibo: Copy (2).pdf",
    "Τιμολόγιο: Scan.01.pdf και απόδειξη: Copy (2).pdf",
    "Fattura: Scan.01.pdf e ricevuta: Copy (2).pdf",
    "Facture : Scan.01.pdf et reçu : Copy (2).pdf",
  ])("binds explicitly labelled siblings in %s", (line) => {
    let reads = 0;
    expect(
      classifyMessageAttachments(names, "Your contract", () => {
        reads++;
        return line;
      }),
    ).toEqual(["invoice", "receipt", "uncategorized"]);
    expect(reads).toBe(1);
  });

  test("does not guess the order of a list or bind a substring of a different filename", () => {
    for (const line of [
      "Invoice and receipt attached as Scan.01.pdf and Copy (2).pdf.",
      "Facture : ex-Scan.01.pdf. Reçu : Copy (2).pdf.p7m.",
      "Invoice attached. Payment receipt enclosed.",
    ]) {
      expect(classifyMessageAttachments(names, "Your invoice", () => line)).toEqual(
        names.map(() => "uncategorized"),
      );
    }
    expect(
      classifyMessageAttachments(["scan.pdf", "SCAN.PDF"], "Invoice", () => "Contract: scan.pdf."),
    ).toEqual(["uncategorized", "uncategorized"]);
    expect(
      classifyMessageAttachments(names, "", () => "Receipt: export.pdf. Invoice: export.pdf."),
    ).toEqual(names.map(() => "uncategorized"));
  });

  test("weighs the actual enclosure above a thread subject and keeps explicit filenames authoritative", () => {
    expect(
      classifyAttachment("Scan.jpeg", "Invoice", () => "Ci-joint le reçu pour votre facture."),
    ).toBe("receipt");
    expect(
      classifyAttachment("Invoice.pdf", "Receipt", () => {
        throw new Error("An explicit filename needs no body");
      }),
    ).toBe("invoice");
    expect(classifyMessageAttachments(["logo.png", "Scan.pdf"], "Kontoauszug")).toEqual([
      "uncategorized",
      "statement",
    ]);
    expect(classifyAttachment("contract_for_signature.pdf", "Invoice")).toBe("contract");
    expect(classifyAttachment("client.jpg", "Invoice")).toBe("uncategorized");
    expect(classifyAttachment("client.jpg", "Invoice", () => "Receipt: client.jpg.")).toBe(
      "receipt",
    );
    expect(classifyAttachment("ticket42.pdf", "Ticket de caisse")).toBe("receipt");
    expect(classifyAttachment("boarding pass.pkpass", "Support ticket")).toBe("ticket");
    expect(classifyAttachment("membership.pkpass", "Loyalty card")).toBe("uncategorized");
  });

  test.each([
    ["XRechnung_471.xml", "invoice"],
    ["FatturaPA_123.xml.p7m", "invoice"],
    ["Contrato.pdf.p7m", "contract"],
    ["INV-Nr-004.pdf", "invoice"],
    ["ΑΠΥ2026.pdf", "receipt"],
    ["ΤΠΥ-492.pdf", "invoice"],
    ["PO_778.xlsx", "order"],
    ["RCPT002.jpg", "receipt"],
    ["QTE-004.pdf", "quote"],
    ["invoice.pdf.zip", "uncategorized"],
    ["scan-PO-91.pdf", "uncategorized"],
  ] as const)("recognizes document names and numbered exports: %s", (name, category) => {
    expect(classifyAttachment(name, "")).toBe(category);
  });

  test.each([
    "Your invoice is not attached.",
    "Die Rechnung ist nicht beigefügt.",
    "No se adjunta la factura.",
    "Δεν επισυνάπτεται το τιμολόγιο.",
    "La fattura non è allegata.",
    "La facture n’est pas jointe.",
    "Could you attach the invoice?",
    "Bitte senden Sie die Rechnung im Anhang.",
    "Merci de nous envoyer la facture en pièce jointe.",
  ])("ignores missing or requested enclosures: %s", (text) => {
    expect(classifyAttachment("scan.pdf", text, () => text)).toBe("uncategorized");
  });

  test("ignores earlier correspondence and plain text signatures", () => {
    for (const quoted of ["-- ", "-----Original Message-----", "Le mardi 8 avril, Léa a écrit :"]) {
      expect(
        classifyAttachment("doc.pdf", "", () => "Thanks!\n" + quoted + "\nInvoice attached."),
      ).toBe("uncategorized");
    }
    expect(
      classifyAttachment("doc.pdf", "", () => "> Invoice attached.\nAnbei die Quittung."),
    ).toBe("receipt");
  });
});

test("distinguishes shop slips from travel tickets and names without extensions from opaque exports", () => {
  for (const title of ["Ticket CB 0144", "Ticket de carte bancaire 14", "Ticket de venta 14"]) {
    expect(classifyAttachment(title + ".pdf", "")).toBe("receipt");
    expect(classifyAttachment("Ticket144.pdf", title)).toBe("receipt");
  }
  for (const title of ["J’ai reçu votre message", "Έχετε το τιμολόγιο;"]) {
    expect(classifyAttachment("scan.pdf", title)).toBe("uncategorized");
  }
  expect(classifyAttachment("Payment receipt of invoice 044.pdf", "")).toBe("receipt");
  expect(classifyAttachment("Rechnung-044", "")).toBe("invoice");
  expect(classifyAttachment("unknown", "Invoice")).toBe("uncategorized");
  expect(classifyAttachment("invoice.exe", "Invoice")).toBe("uncategorized");
});
