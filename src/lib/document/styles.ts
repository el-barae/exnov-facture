export const invoiceStyles = `
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html, body { margin:0; padding:0; }
body { background:#e7e9e8; color:#111; font-family:InvoiceSans,Arial,sans-serif; }
#source { display:none; }
.invoice-page { position:relative; width:210mm; height:297mm; background:white; margin:0 auto 7mm; overflow:hidden; page-break-after:always; }
.invoice-page:last-child { page-break-after:auto; margin-bottom:0; }
.letterhead { height:60mm; position:relative; z-index:1; }
.letterhead .logo { position:absolute; left:15mm; top:22mm; width:39mm; height:32mm; object-fit:contain; }
.letterhead .brand { position:absolute; left:57mm; top:14mm; right:7mm; font:700 8pt/1.5 InvoiceTable,Arial,sans-serif; color:#2f444a; }
.brand strong { display:block; color:#eeb700; font-size:9pt; margin-bottom:1mm; }
.brand p { margin:0; }
.gold-bar { position:absolute; left:57mm; right:0; top:38.5mm; height:11.5mm; background:#f8be18; }
.dark-bar { position:absolute; left:0; top:40.5mm; width:15mm; height:11.5mm; background:#2f444a; }
.watermark { position:absolute; z-index:0; left:23mm; top:104mm; width:164mm; height:116mm; object-fit:contain; opacity:.07; }
.page-content { position:relative; z-index:1; margin:0 10.8mm; font-size:12pt; }
.invoice-meta { display:flex; min-height:50mm; padding:4mm 2mm 8mm; gap:10mm; line-height:1.35; }
.invoice-number { width:50%; flex-shrink:0; }
.invoice-number strong { font-weight:700; }
.recipient { flex:1; padding-top:13mm; overflow-wrap:anywhere; font-size:11pt; white-space:pre-line; }
.recipient p { margin:0 0 1mm; }
.invoice-table { width:100%; border-collapse:collapse; table-layout:fixed; font:12pt/1.2 InvoiceTable,Arial,sans-serif; }
.invoice-table th,.invoice-table td { border:.5pt solid #000; padding:.55mm 1.7mm; vertical-align:top; overflow-wrap:anywhere; white-space:pre-line; }
.invoice-table .project th { font-weight:700; text-align:center; padding:4mm 0 1mm 16mm; min-height:17mm; }
.invoice-table .columns th { text-align:left; font-weight:700; height:16.3mm; }
.invoice-table .designation { font-weight:700; padding-right:11.5mm; }
.invoice-table .center { text-align:center; }
.invoice-table .amount { text-align:right; padding-left:.3mm; padding-right:.3mm; white-space:nowrap; overflow-wrap:normal; }
.invoice-table .service-row td { min-height:11mm; }
.invoice-table .totals td { height:7.7mm; padding-top:.65mm; }
.invoice-table .total-label { font-weight:700; }
.invoice-table .grand-total td { font-weight:700; }
.closing { padding:5mm 2mm 0; font-size:12pt; line-height:1.3; }
.closing p { margin:0 0 1.5mm; }
.closing .thanks { margin-top:4mm; margin-bottom:0; }
.closing .signature { float:right; margin:0 14mm 0 5mm; }
.invoice-footer { position:absolute; bottom:0; left:0; right:0; height:22.5mm; background:#2f444a; border-bottom:5mm solid #f8be18; color:#fff; display:flex; align-items:center; padding:2mm 7mm; gap:4mm; font:8pt/1.45 InvoiceTable,Arial,sans-serif; z-index:2; }
.footer-contacts { display:flex; flex-wrap:wrap; align-items:center; gap:2mm 4mm; width:47%; }
.footer-contacts span { white-space:nowrap; }
.footer-contacts b { color:#f8be18; margin-right:1mm; }
.footer-company { flex:1; border-left:.5mm solid #f8be18; padding-left:3mm; }
.footer-company .ids { white-space:pre-wrap; overflow-wrap:anywhere; }
.footer-company b { font-weight:400; color:#f8be18; }
.page-counter { position:absolute; right:3mm; bottom:1mm; color:#2f444a; font:7pt InvoiceTable,Arial,sans-serif; }
.document-error { margin:20px; padding:20px; background:#fff1ec; color:#822; }
@media print { body { background:white; } .invoice-page { margin:0; } }
`;
