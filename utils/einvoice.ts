// utils/einvoice.ts — Stage 10: Factur-X / ZUGFeRD e-invoice embedding
//
// Generates EN 16931-structured CrossIndustryInvoice XML and embeds it into
// the invoice PDF as an Associated File (AFRelationship: Alternative) with
// PDF/A-3 + Factur-X XMP markers — the machine-readable half of the hybrid
// e-invoice EU mandates are rolling out around. Entirely client-side.

import { pdfBlob } from './blob'

export interface InvoiceLine {
  description: string
  quantity: number
  unitPrice: number
  vatPercent: number   // e.g. 20
}

export interface InvoiceData {
  number: string        // e.g. "INV-2026-001"
  issueDate: string     // YYYY-MM-DD
  sellerName: string
  sellerVatId?: string
  buyerName: string
  buyerVatId?: string
  currency: string      // e.g. "EUR"
  lines: InvoiceLine[]
}

const xesc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
const money = (n: number) => n.toFixed(2)

export function computeTotals(lines: InvoiceLine[]) {
  const net = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0)
  const tax = lines.reduce((s, l) => s + l.quantity * l.unitPrice * (l.vatPercent / 100), 0)
  return { net, tax, gross: net + tax }
}

/** EN 16931 CrossIndustryInvoice XML (Factur-X BASIC-WL compatible shape). */
export function buildFacturXXml(d: InvoiceData): string {
  const dateCompact = d.issueDate.replace(/-/g, '')
  const { net, tax, gross } = computeTotals(d.lines)
  const linesXml = d.lines.map((l, i) => `
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument><ram:LineID>${i + 1}</ram:LineID></ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct><ram:Name>${xesc(l.description)}</ram:Name></ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement>
        <ram:NetPriceProductTradePrice><ram:ChargeAmount>${money(l.unitPrice)}</ram:ChargeAmount></ram:NetPriceProductTradePrice>
      </ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery>
        <ram:BilledQuantity unitCode="C62">${l.quantity}</ram:BilledQuantity>
      </ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>S</ram:CategoryCode><ram:RateApplicablePercent>${money(l.vatPercent)}</ram:RateApplicablePercent></ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>${money(l.quantity * l.unitPrice)}</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>`).join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>urn:factur-x.eu:1p0:basicwl</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${xesc(d.number)}</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime><udt:DateTimeString format="102">${dateCompact}</udt:DateTimeString></ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>${linesXml}
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty><ram:Name>${xesc(d.sellerName)}</ram:Name>${d.sellerVatId ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${xesc(d.sellerVatId)}</ram:ID></ram:SpecifiedTaxRegistration>` : ''}</ram:SellerTradeParty>
      <ram:BuyerTradeParty><ram:Name>${xesc(d.buyerName)}</ram:Name>${d.buyerVatId ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${xesc(d.buyerVatId)}</ram:ID></ram:SpecifiedTaxRegistration>` : ''}</ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery/>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>${xesc(d.currency)}</ram:InvoiceCurrencyCode>
      <ram:ApplicableTradeTax><ram:CalculatedAmount>${money(tax)}</ram:CalculatedAmount><ram:TypeCode>VAT</ram:TypeCode><ram:BasisAmount>${money(net)}</ram:BasisAmount><ram:CategoryCode>S</ram:CategoryCode></ram:ApplicableTradeTax>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${money(net)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${money(net)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="${xesc(d.currency)}">${money(tax)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${money(gross)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${money(gross)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`
}

function facturXXmp(): string {
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
   <pdfaid:part>3</pdfaid:part>
   <pdfaid:conformance>B</pdfaid:conformance>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">
   <fx:DocumentType>INVOICE</fx:DocumentType>
   <fx:DocumentFileName>factur-x.xml</fx:DocumentFileName>
   <fx:Version>1.0</fx:Version>
   <fx:ConformanceLevel>BASIC WL</fx:ConformanceLevel>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`
}

/** Embed Factur-X XML into an invoice PDF and stamp PDF/A-3 + Factur-X XMP. */
export async function attachEInvoice(file: File, xml: string): Promise<Blob> {
  const { PDFDocument, PDFName, AFRelationship } = await import('pdf-lib')
  const doc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true } as any)

  await doc.attach(new TextEncoder().encode(xml), 'factur-x.xml', {
    mimeType: 'text/xml',
    description: 'Factur-X e-invoice (EN 16931 CrossIndustryInvoice)',
    creationDate: new Date(),
    modificationDate: new Date(),
    afRelationship: AFRelationship.Alternative,
  })

  // XMP metadata stream declaring PDF/A-3B + the Factur-X extension schema
  const ctx: any = (doc as any).context
  const xmpStream = ctx.stream(new TextEncoder().encode(facturXXmp()), {
    Type: 'Metadata',
    Subtype: 'XML',
  })
  doc.catalog.set(PDFName.of('Metadata'), ctx.register(xmpStream))

  return pdfBlob(await doc.save({ useObjectStreams: false }))
}
