import { readFile } from "node:fs/promises";
import path from "node:path";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { company } from "@/config/company";
import { amountFontSize, invoiceView, type Invoice } from "../invoice";

export async function generateWord(invoice: Invoice) {
  const [template, logo, watermark] = await Promise.all([
    readFile(path.join(process.cwd(), "templates/facture-exnov.docx")),
    readFile(path.join(process.cwd(), "public/logo-exnov.png")),
    readFile(path.join(process.cwd(), "public/watermark-exnov.png")),
  ]);
  const zip = new PizZip(template);
  // Relations fixes du modèle livré : aucun module image payant nécessaire.
  zip.file("word/media/exnov-logo.png", logo);
  zip.file("word/media/exnov-watermark.png", watermark);
  const header = zip.file("word/header1.xml");
  if (header) zip.file("word/header1.xml", header.asText().replace(/<a:alphaModFix amt="\d+"\s*\/>/g, `<a:alphaModFix amt="${Math.round(company.watermarkOpacity * 100000)}"/>`));
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, errorLogging: false, nullGetter: () => "" });
  doc.render({ ...invoiceView(invoice), societe: company.name, activite: company.activity,
    sousTitre1: company.subtitles[0], sousTitre2: company.subtitles[1], sousTitre3: company.subtitles[2],
    piedDePage: company.footer, site: company.website, telephone: company.phone, email: company.email,
    rc: company.rc, ice: company.ice, tp: company.tp, rib: company.rib,
  });
  // Éviter de couper les grands montants dans les colonnes fixes du modèle.
  const document = doc.getZip().file("word/document.xml")!;
  doc.getZip().file("word/document.xml", document.asText().replace(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g, cell => {
    const text = [...cell.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map(match => match[1]).join("");
    if (!/^-?[\d ]+,\d{2}$/.test(text) || text.length <= 9) return cell;
    const size = amountFontSize(text) * 2;
    return cell.replace(/<w:sz w:val="\d+"\s*\/>/g, `<w:sz w:val="${size}"/>`);
  }));
  return doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
}
