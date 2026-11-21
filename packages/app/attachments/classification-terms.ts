/* oxlint-disable lingui/no-unlocalized-strings -- Document vocabulary in English, German, Spanish, Greek, Italian and French, independent of the UI language. */
import type { AttachmentCategory } from "@ggmail/shared/attachments";

export const documentTerms: Record<AttachmentCategory, string[]> = {
  invoice: [
    "invoice|invoices|tax invoice|bill for services|credit note|billing statement|taxinvoice|erechnung|commercial invoice|proforma invoice|e-invoice|einvoice|credit memo|VAT bill|utility bill|freight invoice",
    "Rechnung|Rechnungen|Rechnungskopie|Teilrechnung|Schlussrechnung|Hotelrechnung|Honorarrechnung|Stromrechnung|Gutschrift|Ausgangsrechnung|Eingangsrechnung|Abschlagsrechnung|Sammelrechnung|Rechnungsduplikat|Honorarnote|XRechnung|ZUGFeRD|Rechnungsnummer|Rechnungskorrektur|Rechnungsübersicht|Proformarechnung|Gebührenrechnung",
    "factura|facturas|nota de crédito|factura electrónica|factura rectificativa|Facturae|nota de abono",
    "τιμολόγιο|τιμολόγια|τιμολογίου|πιστωτικό σημείωμα|τιμολογίων|χρεωστικό σημείωμα",
    "fattura|fatture|nota di credito|fatturapa|parcella professionale|nota di addebito|fattura elettronica",
    "facture|factures|avoir fiscal|facture électronique|note d’honoraires|factur-x|note de crédit",
  ],
  receipt: [
    "receipt|receipts|proof of payment|payment confirmation|till receipt|payment receipt|cash receipt|sales receipt|payment received|receipt of payment|invoice payment receipt|card payment slip|booking payment receipt",
    "Quittung|Quittungen|Kassenbon|Kassenzettel|Reisebeleg|Zahlungsbeleg|Zahlungsbestätigung|Kassenbeleg|Kartenzahlungsbeleg|Überweisungsbeleg|Einzahlungsbeleg|Zahlungsquittung|Kaufbeleg",
    "recibo|recibos|comprobante de pago|justificante de pago|ticket de compra|e-ticket de compra|eticket de compra|ticket de venta|tique de compra|boleta de venta|recibo de pago",
    "απόδειξη|αποδείξεις|απόδειξης|βεβαίωση πληρωμής|απόδειξη πληρωμής|αποδεικτικό πληρωμής|εξοφλητική απόδειξη|αποδείξεων",
    "ricevuta|ricevute|scontrino|scontrini|quietanza|ricevuta fiscale|ricevuta di pagamento|documento commerciale di vendita|prova di pagamento",
    "reçu|reçus|ticket de caisse|e-ticket de caisse|eticket de caisse|ticket de carte bancaire|ticket CB|justificatif de paiement|reçu de paiement|quittance|bon de caisse|preuve de paiement|attestation de paiement",
  ],
  contract: [
    "contract|contracts|agreement|agreements|lease|nda|tenancy agreement|non-disclosure agreement|contract amendment",
    "Vertrag|Verträge|Arbeitsvertrag|Werkvertrag|Rahmenvertrag|Mietvertrag|Kaufvertrag|Dienstleistungsvertrag|Vereinbarung|Dienstvertrag|Pachtvertrag|Vertragsurkunde|Geheimhaltungsvereinbarung|Lizenzvertrag|Versicherungsvertrag|Darlehensvertrag|Leasingvertrag|Vertragsnachtrag",
    "contrato|contratos|acuerdo|convenio|acuerdos|póliza de seguro|contrato marco",
    "σύμβαση|συμβάσεις|σύμβασης|συμφωνητικό|συμβόλαιο|συμβόλαια|σύμφωνο εμπιστευτικότητας|συμβάσεως|συμβάσεων|συμφωνητικά|συμβολαίου",
    "contratto|contratti|accordo|accordi|patto di riservatezza|scrittura privata",
    "contrat|contrats|convention|bail|accord de confidentialité|accord de non-divulgation|contrat-cadre|avenant au contrat",
  ],
  ticket: [
    "ticket|tickets|boarding pass|boardingpass|boardingpasses|admission pass|event pass|admission ticket|train ticket|flight ticket|eticket|etickets|e-tkt|etkt|e-ticket|e-tickets|electronic ticket|electronic tickets|boarding passes|boarding card|mobile boarding pass",
    "Fahrkarte|Fahrkarten|Fahrschein|Flugticket|Bahnticket|Eintrittskarte|Bordkarte|Konzertkarte|Konzertticket|Eintrittsticket|Fahrausweis|Fahrscheine|Onlineticket|Online-Ticket|Handyticket|Bordkarten",
    "billete|billetes|boleto|boletos|entrada|entradas|tarjeta de embarque|pase de abordar|pase de embarque|pasaje aéreo|billete electrónico|boleto electrónico|tarjetas de embarque",
    "εισιτήριο|εισιτήρια|εισιτηρίου|ηλεκτρονικό εισιτήριο|ηλεκτρονικά εισιτήρια|κάρτες επιβίβασης|κάρτα επιβίβασης|δελτίο επιβίβασης|εισιτηρίων",
    "biglietto|biglietti|carta d’imbarco|carta di imbarco|titolo di viaggio|biglietto elettronico|carte d’imbarco|carta di accesso",
    "billet|billets|carte d’embarquement|titre de transport|ticket d’entrée|carte d’accès à bord|billet électronique|e-billet|ebillet|cartes d’embarquement",
  ],
  booking: [
    "booking|reservation|reservations|itinerary|booking confirmation|hotel confirmation|flight confirmation|hotel booking|web booking|online booking|travel itinerary|reservation confirmation|accommodation voucher|hotel voucher|rental confirmation",
    "Buchung|Buchungsbestätigung|Reservierung|Reiseplan|Hotelreservierung|Flugbuchung|Reservierungsbestätigung|Reisebestätigung|Buchungsunterlagen|Buchungsübersicht|Buchungsbeleg|Reservierungsübersicht|Hotelvoucher",
    "reserva|reservación|itinerario|confirmación de alojamiento|reservaciones|confirmación de reserva|bono de alojamiento",
    "κράτηση|κρατήσεις|κράτησης|στοιχεία κράτησης|δρομολόγιο|επιβεβαίωση κράτησης|δρομολόγια",
    "prenotazione|prenotazioni|itinerario|conferma di soggiorno|conferma della prenotazione|voucher alberghiero",
    "réservation|réservations|itinéraire|confirmation de séjour|confirmation de réservation|bon de séjour",
  ],
  statement: [
    "bank statement|account statement|credit card statement|account summary|statement of account|checking account statement|monthly bank statement|savings account statement|statement of transactions",
    "Kontoauszug|Kontoauszüge|Kreditkartenabrechnung|Depotauszug|Kontoumsätze|Kontenübersicht|Jahreskontoauszug|Monatskontoauszug",
    "extracto bancario|extracto de cuenta|estado de cuenta|extractos bancarios|estados de cuenta|movimientos de cuenta",
    "αντίγραφο κίνησης|κίνηση λογαριασμού|κατάσταση λογαριασμού|κινήσεις λογαριασμού|ανάλυση λογαριασμού",
    "estratto conto|estratti conto|rendiconto bancario|estratto del conto",
    "relevé bancaire|relevé de compte|relevé de carte|extrait de compte|relevés de compte",
  ],
  order: [
    "purchase order|order confirmation|order summary|sales order|order acknowledgement|purchase orders|order acknowledgment|order details",
    "Bestellung|Bestellungen|Bestellbestätigung|Auftragsbestätigung|Auftragserteilung|Bestellschein|Bestellübersicht|Bestelldetails",
    "pedido|orden de compra|confirmación de pedido|pedidos|órdenes de compra",
    "παραγγελία|παραγγελίας|παραγγελίες|δελτίο παραγγελίας",
    "ordine|ordini|conferma d’ordine|buono d’ordine|ordine di acquisto",
    "commande|commandes|bon de commande|bons de commande|confirmation de commande",
  ],
  quote: [
    "quotation|price quote|cost estimate|sales quote|repair estimate|print estimate|written estimate|fee estimate|quotation for|commercial proposal|estimate for|quote for",
    "Angebot|Angebote|Kostenvoranschlag|Reparaturangebot|Angebotsschreiben|Preisangebot|Kostenangebot|Angebotsübersicht",
    "presupuesto|cotización|cotizaciones|presupuestos",
    "προσφορά|προσφορές|προσφοράς|οικονομική προσφορά|προσφορών",
    "preventivo|preventivi|offerta economica|offerta commerciale",
    "devis|offre de prix|proposition tarifaire",
  ],
  uncategorized: [
    "request for quotation|request for quote|quote request|invoice request|invoice reminder|request for invoice|acknowledgement of receipt|acknowledgment of receipt|delivery receipt|read receipt|receipt of application|receipt of invoice|receipt of your invoice|confirm receipt|confirmation of receipt|support ticket|helpdesk ticket|loyalty card|gift card|packing slip|delivery note|out of order|receipt of goods|meeting agenda|bill of lading|balance sheet|job offer|ticket status|issue ticket|invoice instructions|invoice dispute|parking ticket|traffic ticket|ticket cancellation|e-ticket cancellation|eticket cancellation|ticket refund request|quote of the day|order of service|booking cancellation",
    "Rechnungsvorlage|Angebotsanfrage|Rechnungsanforderung|Zahlungserinnerung|Lieferschein|Empfangsbestätigung|Rechnungseingang|Erhalt der Rechnung|Lesebestätigung|Kundenkarte|Gehaltsabrechnung|Lohnabrechnung|Supportticket|Störungsticket|Angebot der Woche|Stellenangebot|Musterrechnung|Vertragsmuster|Reklamation zur Rechnung|Ticketstornierung|Buchungsstornierung",
    "solicitud de presupuesto|solicitud de factura|acuse de recibo|recepción de la factura|confirmación de lectura|albarán|tarjeta de fidelidad|recordatorio de pago|mesa de entradas|entrada de datos|entrada de diario|oferta de empleo|nota de entrega|acuse de recepción|petición de oferta|cancelación de reserva",
    "αίτημα προσφοράς|αίτηση προσφοράς|αίτημα τιμολογίου|αποδεικτικό παραλαβής|παραλαβή του τιμολογίου|απόδειξη παραλαβής|δελτίο αποστολής|κάρτα μέλους|υπενθύμιση πληρωμής|προσφορά εργασίας|αίτηση για προσφορά|βεβαίωση παραλαβής|ακύρωση κράτησης|ακύρωση εισιτηρίου",
    "richiesta di preventivo|richiesta di fattura|ricevuta di consegna|ricezione della fattura|ricevuta di accettazione|ricevuta di lettura|documento di trasporto|carta fedeltà|sollecito di pagamento|ordine del giorno|avviso di ricevimento|offerta di lavoro|richiesta di offerta|annullamento della prenotazione|annullamento del biglietto",
    "demande de devis|demande de facture|accusé de réception|réception de la facture|accusé de lecture|bon de livraison|carte de fidélité|relance de paiement|bien reçu|j’ai reçu|nous avons reçu|avez-vous reçu|télécommande|offre d’emploi|avis de réception|reçu de lecture|ticket de suivi|demande de réservation|annulation de réservation|annulation de billet",
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
    category: "booking",
    first:
      "check-in date|Anreisedatum|fecha de entrada|ημερομηνία άφιξης|data di arrivo|date d’arrivée",
    second:
      "check-out date|Abreisedatum|fecha de salida|ημερομηνία αναχώρησης|data di partenza|date de départ",
  },
  {
    category: "contract",
    first:
      "contracting parties|Vertragsparteien|partes contratantes|συμβαλλόμενα μέρη|parti contraenti|parties contractantes",
    second:
      "effective date|Inkrafttreten|fecha de entrada en vigor|έναρξη ισχύος|data di decorrenza|date de prise d’effet",
  },
  {
    category: "order",
    first:
      "order number|Bestellnummer|número de pedido|αριθμός παραγγελίας|numero d’ordine|numéro de commande",
    second:
      "quantity ordered|Bestellmenge|cantidad pedida|παραγγελθείσα ποσότητα|quantità ordinata|quantité commandée",
  },
  {
    category: "quote",
    first:
      "quoted price|Angebotspreis|precio ofertado|προσφερόμενη τιμή|prezzo proposto|prix proposé",
    second: "valid until|gültig bis|válido hasta|ισχύει έως|valido fino al|valable jusqu’au",
  },
  {
    category: "statement",
    first:
      "opening balance|beginning balance|Anfangssaldo|Anfangsbestand|saldo inicial|αρχικό υπόλοιπο|saldo iniziale|solde initial|solde d’ouverture",
    second:
      "closing balance|ending balance|Endsaldo|Schlusssaldo|saldo final|τελικό υπόλοιπο|saldo finale|solde final|solde de clôture",
  },
];
