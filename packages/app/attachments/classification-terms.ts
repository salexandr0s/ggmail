/* oxlint-disable lingui/no-unlocalized-strings -- Document vocabulary in English, German, Spanish, Greek, Italian and French, independent of the UI language. */
import type { AttachmentCategory } from "@ggmail/shared/attachments";

export const documentTerms: Record<AttachmentCategory, string[]> = {
  invoice: [
    "invoice|invoices|tax invoice|bill for services|credit note|billing statement|taxinvoice|erechnung|commercial invoice|proforma invoice|e-invoice",
    "Rechnung|Rechnungen|Rechnungskopie|Teilrechnung|Schlussrechnung|Hotelrechnung|Honorarrechnung|Stromrechnung|Gutschrift|Ausgangsrechnung|Eingangsrechnung|Abschlagsrechnung|Sammelrechnung|Rechnungsduplikat|Honorarnote|XRechnung|ZUGFeRD|Rechnungsnummer|Rechnungskorrektur",
    "factura|facturas|nota de crédito|factura electrónica|factura rectificativa|Facturae|nota de abono",
    "τιμολόγιο|τιμολόγια|τιμολογίου|πιστωτικό σημείωμα|τιμολογίων|χρεωστικό σημείωμα",
    "fattura|fatture|nota di credito|fatturapa|nota di addebito|fattura elettronica",
    "facture|factures|avoir fiscal|facture électronique|note d’honoraires|factur-x|note de crédit",
  ],
  receipt: [
    "receipt|receipts|proof of payment|payment confirmation|till receipt|payment receipt|cash receipt|sales receipt|payment received|receipt of payment|invoice payment receipt",
    "Quittung|Quittungen|Kassenbon|Kassenzettel|Reisebeleg|Zahlungsbeleg|Zahlungsbestätigung|Kassenbeleg|Kartenzahlungsbeleg|Überweisungsbeleg|Einzahlungsbeleg|Zahlungsquittung",
    "recibo|recibos|comprobante de pago|justificante de pago|ticket de compra|ticket de venta|tique de compra|boleta de venta|recibo de pago",
    "απόδειξη|αποδείξεις|απόδειξης|βεβαίωση πληρωμής|απόδειξη πληρωμής|αποδεικτικό πληρωμής|εξοφλητική απόδειξη|αποδείξεων",
    "ricevuta|ricevute|scontrino|scontrini|quietanza|ricevuta fiscale|ricevuta di pagamento|documento commerciale di vendita|prova di pagamento",
    "reçu|reçus|ticket de caisse|ticket de carte bancaire|ticket CB|justificatif de paiement|reçu de paiement|quittance|preuve de paiement|attestation de paiement",
  ],
  contract: [
    "contract|contracts|agreement|agreements|lease|nda|tenancy agreement|non-disclosure agreement",
    "Vertrag|Verträge|Arbeitsvertrag|Werkvertrag|Rahmenvertrag|Mietvertrag|Kaufvertrag|Dienstleistungsvertrag|Vereinbarung|Dienstvertrag|Pachtvertrag|Vertragsurkunde|Geheimhaltungsvereinbarung|Lizenzvertrag|Versicherungsvertrag",
    "contrato|contratos|acuerdo|convenio|acuerdos|póliza de seguro",
    "σύμβαση|συμβάσεις|σύμβασης|συμφωνητικό|συμβόλαιο|συμβόλαια|σύμφωνο εμπιστευτικότητας|συμβάσεως|συμβάσεων|συμφωνητικά|συμβολαίου",
    "contratto|contratti|accordo|accordi|patto di riservatezza|scrittura privata",
    "contrat|contrats|convention|bail|accord de confidentialité|accord de non-divulgation|contrat-cadre",
  ],
  ticket: [
    "ticket|tickets|boarding pass|boardingpass|admission pass|eTicket|event pass|admission ticket|train ticket|flight ticket|e-ticket",
    "Fahrkarte|Fahrkarten|Fahrschein|Flugticket|Bahnticket|Eintrittskarte|Bordkarte|Konzertkarte|Konzertticket|Eintrittsticket|Fahrausweis|Fahrscheine",
    "billete|billetes|boleto|boletos|entrada|entradas|tarjeta de embarque|pase de abordar|pase de embarque|pasaje aéreo",
    "εισιτήριο|εισιτήρια|εισιτηρίου|κάρτα επιβίβασης|δελτίο επιβίβασης|εισιτηρίων",
    "biglietto|biglietti|carta d’imbarco|carta di imbarco|titolo di viaggio|carta di accesso",
    "billet|billets|carte d’embarquement|titre de transport|ticket d’entrée|carte d’accès à bord",
  ],
  booking: [
    "booking|reservation|reservations|itinerary|booking confirmation|hotel confirmation|flight confirmation|hotel booking|travel itinerary",
    "Buchung|Buchungsbestätigung|Reservierung|Reiseplan|Hotelreservierung|Flugbuchung|Reservierungsbestätigung|Reisebestätigung|Buchungsunterlagen",
    "reserva|reservación|itinerario|confirmación de alojamiento|reservaciones|confirmación de reserva",
    "κράτηση|κρατήσεις|κράτησης|δρομολόγιο|επιβεβαίωση κράτησης|δρομολόγια",
    "prenotazione|prenotazioni|itinerario|conferma di soggiorno|conferma della prenotazione",
    "réservation|réservations|itinéraire|confirmation de séjour|confirmation de réservation",
  ],
  statement: [
    "bank statement|account statement|credit card statement|account summary|statement of account|checking account statement|monthly bank statement",
    "Kontoauszug|Kontoauszüge|Kreditkartenabrechnung|Depotauszug|Kontoumsätze|Kontenübersicht",
    "extracto bancario|extracto de cuenta|estado de cuenta|extractos bancarios|estados de cuenta",
    "αντίγραφο κίνησης|κίνηση λογαριασμού|κατάσταση λογαριασμού|κινήσεις λογαριασμού|ανάλυση λογαριασμού",
    "estratto conto|estratti conto|rendiconto bancario|estratto del conto",
    "relevé bancaire|relevé de compte|relevé de carte|extrait de compte|relevés de compte",
  ],
  order: [
    "purchase order|order confirmation|order summary|sales order|order acknowledgement|purchase orders|order acknowledgment",
    "Bestellung|Bestellungen|Bestellbestätigung|Auftragsbestätigung|Auftragserteilung|Bestellschein",
    "pedido|orden de compra|confirmación de pedido|pedidos|órdenes de compra",
    "παραγγελία|παραγγελίας|παραγγελίες|δελτίο παραγγελίας",
    "ordine|ordini|conferma d’ordine|buono d’ordine|ordine di acquisto",
    "commande|commandes|bon de commande|bons de commande|confirmation de commande",
  ],
  quote: [
    "quotation|price quote|cost estimate|sales quote|repair estimate|print estimate|written estimate|fee estimate|estimate for|quote for",
    "Angebot|Angebote|Kostenvoranschlag|Reparaturangebot|Angebotsschreiben|Preisangebot|Kostenangebot",
    "presupuesto|cotización|cotizaciones|presupuestos",
    "προσφορά|προσφορές|προσφοράς|οικονομική προσφορά|προσφορών",
    "preventivo|preventivi|offerta economica|offerta commerciale",
    "devis|offre de prix|proposition tarifaire",
  ],
  uncategorized: [
    "request for quotation|request for quote|quote request|invoice request|invoice reminder|request for invoice|acknowledgement of receipt|acknowledgment of receipt|delivery receipt|read receipt|receipt of application|receipt of invoice|receipt of your invoice|confirm receipt|confirmation of receipt|support ticket|helpdesk ticket|loyalty card|gift card|packing slip|delivery note|out of order|receipt of goods|meeting agenda|bill of lading|balance sheet|job offer|ticket status|issue ticket|invoice instructions|invoice dispute",
    "Rechnungsvorlage|Angebotsanfrage|Rechnungsanforderung|Zahlungserinnerung|Lieferschein|Empfangsbestätigung|Rechnungseingang|Erhalt der Rechnung|Lesebestätigung|Kundenkarte|Gehaltsabrechnung|Lohnabrechnung|Supportticket|Störungsticket|Angebot der Woche|Stellenangebot|Musterrechnung|Vertragsmuster|Reklamation zur Rechnung",
    "solicitud de presupuesto|solicitud de factura|acuse de recibo|recepción de la factura|confirmación de lectura|albarán|tarjeta de fidelidad|recordatorio de pago|mesa de entradas|entrada de datos|entrada de diario|oferta de empleo|nota de entrega|acuse de recepción|petición de oferta",
    "αίτημα προσφοράς|αίτηση προσφοράς|αίτημα τιμολογίου|αποδεικτικό παραλαβής|παραλαβή του τιμολογίου|απόδειξη παραλαβής|δελτίο αποστολής|κάρτα μέλους|υπενθύμιση πληρωμής|προσφορά εργασίας|αίτηση για προσφορά|βεβαίωση παραλαβής",
    "richiesta di preventivo|richiesta di fattura|ricevuta di consegna|ricezione della fattura|ricevuta di accettazione|ricevuta di lettura|documento di trasporto|carta fedeltà|sollecito di pagamento|ordine del giorno|avviso di ricevimento|offerta di lavoro|richiesta di offerta",
    "demande de devis|demande de facture|accusé de réception|réception de la facture|accusé de lecture|bon de livraison|carte de fidélité|relance de paiement|bien reçu|j’ai reçu|nous avons reçu|avez-vous reçu|télécommande|offre d’emploi|avis de réception|reçu de lecture|ticket de suivi|demande de réservation",
  ],
};

// A single amount, date, seat, or identifier is common to many documents.
// Require a pair in the same description before inferring a category without a document title.
export const detailPairs: {
  category: AttachmentCategory;
  first: string;
  second: string;
}[] = [
  {
    category: "invoice",
    first:
      "amount due|balance payable|balance due|Zahlbetrag|offener Betrag|importe a pagar|saldo a pagar|πληρωτέο ποσό|οφειλόμενο ποσό|importo dovuto|totale da pagare|montant à payer|net à payer",
    second:
      "payment due date|payable by|remit by|zahlbar bis|Zahlungsziel|fecha de vencimiento|pagar antes de|ημερομηνία λήξης|προθεσμία εξόφλησης|data di scadenza|pagare entro|date d’échéance|à régler avant",
  },
  {
    category: "receipt",
    first:
      "amount paid|payment successful|Zahlung erhalten|bezahlter Betrag|importe pagado|pago realizado|καταβληθέν ποσό|επιτυχής πληρωμή|importo pagato|pagamento effettuato|montant payé|paiement effectué",
    second:
      "transaction ID|transaction reference|transaction number|Transaktionsnummer|Transaktions-ID|número de transacción|referencia de transacción|κωδικός συναλλαγής|αριθμός συναλλαγής|codice transazione|numero transazione|référence de transaction|numéro de transaction",
  },
  {
    category: "ticket",
    first: "gate|Flugsteig|puerta de embarque|πύλη|gate d’imbarco|porte d’embarquement",
    second:
      "boarding group|boarding zone|Boardinggruppe|Einsteigegruppe|grupo de embarque|ομάδα επιβίβασης|gruppo d’imbarco|groupe d’embarquement",
  },
  {
    category: "statement",
    first:
      "opening balance|beginning balance|Anfangssaldo|Anfangsbestand|saldo inicial|αρχικό υπόλοιπο|saldo iniziale|solde initial|solde d’ouverture",
    second:
      "closing balance|ending balance|Endsaldo|Schlusssaldo|saldo final|τελικό υπόλοιπο|saldo finale|solde final|solde de clôture",
  },
];
