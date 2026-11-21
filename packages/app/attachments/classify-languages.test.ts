import { expect, test } from "bun:test";
import type { AttachmentCategory } from "@ggmail/shared/attachments";
import { classifyMessageAttachments as detectCategories } from "./classify";

function classifyMessageAttachments(...args: Parameters<typeof detectCategories>) {
  return detectCategories(...args).map((categories) => categories.join(" + "));
}

// The columns are English, German, Spanish, Greek, Italian and French.
// Keep lookalikes together so improving recall in one category cannot hide a false positive in another.
const languages = ["en", "de", "es", "el", "it", "fr"] as const;
const titles: [string, string, string, string, string, string, string][] = [
  [
    "invoice",
    "VAT invoice for order 429",
    "Rechnung zur Bestellung 429",
    "Factura del pedido 429",
    "Τιμολόγιο για την παραγγελία 429",
    "Fattura relativa all’ordine 429",
    "Facture de la commande 429",
  ],
  [
    "receipt",
    "Payment receipt for invoice 429",
    "Zahlungsbeleg zur Rechnung 429",
    "Justificante de pago de la factura 429",
    "Απόδειξη πληρωμής τιμολογίου 429",
    "Ricevuta di pagamento della fattura 429",
    "Reçu de paiement pour la facture 429",
  ],
  [
    "invoice",
    "Paid invoice 248",
    "Bezahlte Rechnung 248",
    "Factura pagada 248",
    "Εξοφλημένο τιμολόγιο 248",
    "Fattura quietanzata 248",
    "Facture acquittée 248",
  ],
  [
    "receipt",
    "Till receipt",
    "Kassenbeleg",
    "Tique de compra",
    "Απόδειξη λιανικής πώλησης",
    "Documento commerciale di vendita",
    "Ticket de caisse",
  ],
  [
    "contract",
    "Tenancy agreement",
    "Dienstvertrag",
    "Contrato de arrendamiento",
    "Ιδιωτικό συμφωνητικό μίσθωσης",
    "Contratto di locazione",
    "Bail d’habitation",
  ],
  [
    "contract",
    "Non-disclosure agreement",
    "Geheimhaltungsvereinbarung",
    "Acuerdo de confidencialidad",
    "Σύμφωνο εμπιστευτικότητας",
    "Patto di riservatezza",
    "Accord de confidentialité",
  ],
  [
    "ticket",
    "Boarding pass for reservation Q5",
    "Bordkarte zur Buchung Q5",
    "Tarjeta de embarque para la reserva Q5",
    "Κάρτα επιβίβασης για την κράτηση Q5",
    "Carta d’imbarco per la prenotazione Q5",
    "Carte d’embarquement pour la réservation Q5",
  ],
  [
    "ticket",
    "Concert admission ticket",
    "Konzertkarte",
    "Entrada para el concierto",
    "Ηλεκτρονικό εισιτήριο",
    "Titolo di viaggio",
    "Titre de transport",
  ],
  [
    "booking",
    "Accommodation booking confirmation",
    "Hotelreservierung",
    "Confirmación de alojamiento",
    "Επιβεβαίωση κράτησης",
    "Conferma della prenotazione",
    "Confirmation de réservation",
  ],
  [
    "ticket + booking",
    "Web Booking eTicket ZX72QK",
    "Buchung – Online-Ticket 431",
    "Reserva – billete electrónico 431",
    "Κράτηση – ηλεκτρονικό εισιτήριο 431",
    "Prenotazione – biglietto elettronico 431",
    "Réservation – e-billet 431",
  ],
  [
    "booking",
    "Accommodation voucher",
    "Buchungsübersicht",
    "Bono de alojamiento",
    "Στοιχεία κράτησης",
    "Voucher alberghiero",
    "Bon de séjour",
  ],
  [
    "ticket",
    "Electronic ticket (booking reference Q5)",
    "Flugticket (Buchungsreferenz Q5)",
    "Billete electrónico (código de reserva Q5)",
    "Εισιτήριο (κωδικός κράτησης Q5)",
    "Biglietto (codice di prenotazione Q5)",
    "Billet (référence de réservation Q5)",
  ],
  [
    "ticket + booking",
    "Reservation and boarding pass",
    "Buchung und Bordkarte",
    "Reserva y tarjeta de embarque",
    "Κράτηση και κάρτα επιβίβασης",
    "Prenotazione e carta d’imbarco",
    "Réservation et carte d’embarquement",
  ],
  [
    "statement",
    "Checking account statement",
    "Kreditkartenabrechnung",
    "Estado de cuenta bancario",
    "Κινήσεις λογαριασμού",
    "Estratto conto corrente",
    "Relevé de compte courant",
  ],
  [
    "order",
    "Purchase order for quotation 312",
    "Bestellung zum Angebot 312",
    "Orden de compra según presupuesto 312",
    "Παραγγελία βάσει προσφοράς 312",
    "Ordine relativo al preventivo 312",
    "Bon de commande selon devis 312",
  ],
  [
    "quote",
    "Repair estimate",
    "Reparaturangebot",
    "Presupuesto de reparación",
    "Οικονομική προσφορά",
    "Preventivo di riparazione",
    "Devis de réparation",
  ],
  [
    "uncategorized",
    "Invoice template",
    "Rechnungsvorlage",
    "Plantilla de factura",
    "Υπόδειγμα τιμολογίου",
    "Modello di fattura",
    "Modèle de facture",
  ],
  [
    "uncategorized",
    "Request for quotation",
    "Angebotsanfrage",
    "Solicitud de presupuesto",
    "Αίτημα προσφοράς",
    "Richiesta di preventivo",
    "Demande de devis",
  ],
  [
    "uncategorized",
    "Acknowledgement of receipt",
    "Empfangsbestätigung",
    "Acuse de recibo",
    "Αποδεικτικό παραλαβής",
    "Ricevuta di consegna",
    "Accusé de réception",
  ],
  [
    "uncategorized",
    "Support ticket 284",
    "Support-Ticket 284",
    "Ticket de soporte 284",
    "Αίτημα υποστήριξης 284",
    "Ticket di assistenza 284",
    "Ticket d’incident 284",
  ],
];
for (const [category, ...examples] of titles) {
  examples.forEach((title, index) => {
    test(`${languages[index]} · ${title}`, () => {
      expect(classifyMessageAttachments([title + ".pdf"], "")[0]).toBe(category);
      expect(classifyMessageAttachments(["scan.pdf"], title.normalize("NFD"))[0]).toBe(category);
    });
  });
}

const details: [AttachmentCategory, string, string, string, string, string, string][] = [
  [
    "invoice",
    "Balance due, payable by May 12",
    "Offener Betrag, zahlbar bis 12. Mai",
    "Importe a pagar, fecha de vencimiento 12 de mayo",
    "Πληρωτέο ποσό, προθεσμία εξόφλησης 12 Μαΐου",
    "Importo dovuto, pagare entro il 12 maggio",
    "Net à payer, date d’échéance 12 mai",
  ],
  [
    "receipt",
    "Amount paid, transaction reference 812",
    "Bezahlter Betrag, Transaktionsnummer 812",
    "Importe pagado, número de transacción 812",
    "Καταβληθέν ποσό, κωδικός συναλλαγής 812",
    "Importo pagato, codice transazione 812",
    "Montant payé, référence de transaction 812",
  ],
  [
    "ticket",
    "Gate A1, boarding group 3",
    "Flugsteig A1, Einsteigegruppe 3",
    "Puerta de embarque A1, grupo de embarque 3",
    "Πύλη Α1, ομάδα επιβίβασης 3",
    "Gate A1, gruppo d’imbarco 3",
    "Porte d’embarquement A1, groupe d’embarquement 3",
  ],
  [
    "booking",
    "Check-in date May 4, check-out date May 12",
    "Anreisedatum 4. Mai, Abreisedatum 12. Mai",
    "Fecha de entrada 4 de mayo, fecha de salida 12 de mayo",
    "Ημερομηνία άφιξης 4 Μαΐου, ημερομηνία αναχώρησης 12 Μαΐου",
    "Data di arrivo 4 maggio, data di partenza 12 maggio",
    "Date d’arrivée 4 mai, date de départ 12 mai",
  ],
  [
    "contract",
    "Contracting parties and effective date",
    "Vertragsparteien und Inkrafttreten",
    "Partes contratantes y fecha de entrada en vigor",
    "Συμβαλλόμενα μέρη και έναρξη ισχύος",
    "Parti contraenti e data di decorrenza",
    "Parties contractantes et date de prise d’effet",
  ],
  [
    "order",
    "Order number 123, quantity ordered 2",
    "Bestellnummer 123, Bestellmenge 2",
    "Número de pedido 123, cantidad pedida 2",
    "Αριθμός παραγγελίας 123, παραγγελθείσα ποσότητα 2",
    "Numero d’ordine 123, quantità ordinata 2",
    "Numéro de commande 123, quantité commandée 2",
  ],
  [
    "quote",
    "Quoted price €95, valid until May 12",
    "Angebotspreis 95 €, gültig bis 12. Mai",
    "Precio ofertado 95 €, válido hasta el 12 de mayo",
    "Προσφερόμενη τιμή 95 €, ισχύει έως 12 Μαΐου",
    "Prezzo proposto 95 €, valido fino al 12 maggio",
    "Prix proposé 95 €, valable jusqu’au 12 mai",
  ],
  [
    "statement",
    "Opening balance and closing balance",
    "Anfangssaldo und Endsaldo",
    "Saldo inicial y saldo final",
    "Αρχικό υπόλοιπο και τελικό υπόλοιπο",
    "Saldo iniziale e saldo finale",
    "Solde initial et solde final",
  ],
  [
    "uncategorized",
    "Opening balance",
    "Bezahlter Betrag",
    "Puerta de embarque A1",
    "Κωδικός συναλλαγής 812",
    "Saldo finale",
    "Date d’échéance 12 mai",
  ],
];
for (const [category, ...examples] of details) {
  examples.forEach((text, index) => {
    test(`${languages[index]} · ${text}`, () => {
      expect(classifyMessageAttachments(["scan.pdf"], text)).toEqual([category]);
      expect(
        classifyMessageAttachments(["scan.pdf", "file-2.pdf"], "", () => "Scan.pdf: " + text),
      ).toEqual([category, "uncategorized"]);
    });
  });
}

test("contradictory financial details are inconclusive, and a paid invoice retains its document type", () => {
  expect(
    classifyMessageAttachments(
      ["scan.pdf"],
      "Balance due, payable by August 1. Amount paid, transaction number 352",
    ),
  ).toEqual(["uncategorized"]);
  expect(
    classifyMessageAttachments(["Fattura.pdf"], "Importo pagato, codice transazione 812"),
  ).toEqual(["invoice"]);
});

test.each([
  "Please confirm receipt of your invoice",
  "Bitte bestätigen Sie den Erhalt der Rechnung",
  "Confirme la recepción de la factura",
  "Παρακαλώ επιβεβαιώστε την παραλαβή του τιμολογίου",
  "Confermare la ricezione della fattura",
  "Merci de confirmer la réception de la facture",
])("distinguishes acknowledging an invoice from supplying one or paying it: %s", (subject) => {
  expect(classifyMessageAttachments(["scan.pdf"], subject)).toEqual(["uncategorized"]);
  expect(classifyMessageAttachments(["Receipt.pdf"], subject)).toEqual(["receipt"]);
});

const combined = [
  ["Invoice and receipt", "Invoice and contract"],
  ["Rechnung und Quittung", "Rechnung und Vertrag"],
  ["Factura y recibo", "Factura y contrato"],
  ["Τιμολόγιο και απόδειξη", "Τιμολόγιο και σύμβαση"],
  ["Fattura e ricevuta", "Fattura e contratto"],
  ["Facture et reçu", "Facture et contrat"],
] as const;
test.each(combined)(
  "recognizes explicitly combined files separately from email references: %s",
  (financial, legal) => {
    expect(detectCategories([financial + ".pdf", legal + ".pdf"], "")).toEqual([
      ["invoice", "receipt"],
      ["invoice", "contract"],
    ]);
    expect(detectCategories(["scan.pdf"], legal)).toEqual([["uncategorized"]]);
    expect(detectCategories(["scan.pdf"], financial)).toEqual([["invoice", "receipt"]]);
  },
);

test("keeps joint labels for a named attachment and avoids assigning them to its sibling", () => {
  expect(
    detectCategories(
      ["a.pdf", "b.pdf"],
      "",
      () => "Web Booking eTicket: a.pdf. Invoice for the flight ticket: b.pdf.",
    ),
  ).toEqual([["ticket", "booking"], ["invoice"]]);
});
