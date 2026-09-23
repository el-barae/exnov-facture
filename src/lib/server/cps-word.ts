import PizZip from "pizzip";
import { CPS_CHAPTERS, CPS_PLACEHOLDER, cpsAmount, cpsNumber, cpsTotals, cpsValue, type Cps, type CpsLogo } from "../cps";
import { validateCpsLogo } from "./cps-request";

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const P = "http://schemas.openxmlformats.org/package/2006/relationships";
// Le contenu IA/utilisateur n’est jamais interprété comme du XML Word.
function escape(value: string) {
  return value.replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function run(value: string, properties = "") {
  return `<w:r>${properties ? `<w:rPr>${properties}</w:rPr>` : ""}${value.split("\n").map(line => `<w:t xml:space="preserve">${escape(line)}</w:t>`).join("<w:br/>")}</w:r>`;
}
function paragraph(value: string, style = "Normal", properties = "") {
  return `<w:p><w:pPr><w:pStyle w:val="${style}"/>${properties}</w:pPr>${run(value)}</w:p>`;
}
function heading(value: string, id: string, level = 1, pageBreak = false) {
  const bookmark = Number(id.replace(/\D/g, ""));
  return `<w:p><w:pPr><w:pStyle w:val="Heading${level}"/>${pageBreak ? "<w:pageBreakBefore/>" : ""}</w:pPr><w:bookmarkStart w:id="${bookmark}" w:name="${id}"/>${run(value)}<w:bookmarkEnd w:id="${bookmark}"/></w:p>`;
}
function table(rows: string[][], widths: number[], header = true) {
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map(edge => `<w:${edge} w:val="single" w:sz="4" w:color="B8C3C6"/>`).join("")}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="100" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${widths.map(width => `<w:gridCol w:w="${width}"/>`).join("")}</w:tblGrid>${rows.map((row, index) => `<w:tr><w:trPr>${index === 0 && header ? "<w:tblHeader/>" : ""}<w:cantSplit/></w:trPr>${row.map((cell, column) => `<w:tc><w:tcPr><w:tcW w:w="${widths[column]}" w:type="dxa"/>${index === 0 && header ? '<w:shd w:fill="E9EEEA"/>' : ""}<w:vAlign w:val="center"/></w:tcPr>${paragraph(cell, index === 0 && header ? "TableHeader" : "TableText")}</w:tc>`).join("")}</w:tr>`).join("")}</w:tbl>${paragraph("")}`;
}
function logoDrawing(logo: CpsLogo) {
  const ratio = Math.min(180 / logo.width, 100 / logo.height);
  const width = Math.round(logo.width * ratio * 9525), height = Math.round(logo.height * ratio * 9525);
  return `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="400"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="${width}" cy="${height}"/><wp:docPr id="1" name="Logo du maître d’ouvrage" descr="${escape(logo.name)}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="logo.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rLogo"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${width}" cy="${height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}
const styles = `${XML}<w:styles xmlns:w="${W}">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="fr-MA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/><w:widowControl/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:jc w:val="both"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="800" w:after="500"/><w:jc w:val="center"/></w:pPr><w:rPr><w:b/><w:color w:val="283D43"/><w:sz w:val="40"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="160" w:after="300"/><w:jc w:val="center"/></w:pPr><w:rPr><w:sz w:val="28"/><w:b/></w:rPr></w:style>
${[1, 2, 3].map(level => `<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="${level === 1 ? 360 : 220}" w:after="160"/><w:jc w:val="left"/><w:outlineLvl w:val="${level - 1}"/></w:pPr><w:rPr><w:b/><w:color w:val="283D43"/><w:sz w:val="${level === 1 ? 30 : level === 2 ? 24 : 22}"/></w:rPr></w:style>`).join("")}
<w:style w:type="paragraph" w:styleId="TableText"><w:name w:val="Table text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="40" w:line="240" w:lineRule="auto"/><w:jc w:val="left"/></w:pPr><w:rPr><w:sz w:val="18"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="TableHeader"><w:name w:val="Table header"/><w:basedOn w:val="TableText"/><w:rPr><w:b/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Small"><w:name w:val="Small"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="left"/></w:pPr><w:rPr><w:sz w:val="18"/><w:color w:val="647477"/></w:rPr></w:style>
</w:styles>`;

export function generateCpsWord(document: Cps, logo: CpsLogo | null = null) {
  validateCpsLogo(logo);
  const zip = new PizZip();
  const toc: { title: string; id: string; level: number }[] = [];
  let nextId = 0;
  function section(title: string, level = 1, pageBreak = false) {
    const id = `cps${++nextId}`;
    toc.push({ title, id, level });
    return heading(title, id, level, pageBreak);
  }
  const parts: string[] = [];
  parts.push(section("Identification des parties", 1, true));
  parts.push(paragraph(`Maître d’ouvrage : ${cpsValue(document.owner)}`));
  parts.push(paragraph(`Représenté par : ${CPS_PLACEHOLDER}`));
  parts.push(paragraph(`Entrepreneur : ${CPS_PLACEHOLDER}\nReprésentant et qualité : ${CPS_PLACEHOLDER}\nAdresse : ${CPS_PLACEHOLDER}\nRC / ICE / identifiant fiscal : ${CPS_PLACEHOLDER}\nCoordonnées bancaires : ${CPS_PLACEHOLDER}`));
  parts.push(paragraph(`Mode de passation : ${cpsValue(document.procedure)}`));
  parts.push(section(`CHAPITRE I — ${CPS_CHAPTERS[0].toUpperCase()}`, 1, true));
  document.administrative.forEach((article, i) => {
    parts.push(section(`ARTICLE ${i + 1} : ${article.title}`, 2));
    parts.push(...article.paragraphs.map(text => paragraph(text)));
  });
  parts.push(section(`CHAPITRE II — ${CPS_CHAPTERS[1].toUpperCase()}`, 1, true));
  document.technical.forEach((lot, i) => {
    parts.push(section(`${i + 1}. ${lot.title}`, 2));
    lot.articles.forEach((article, j) => {
      parts.push(section(`ARTICLE ${i + 1}.${j + 1} : ${article.title}`, 3));
      parts.push(...article.paragraphs.map(text => paragraph(text)));
    });
  });
  parts.push(section(`CHAPITRE III — ${CPS_CHAPTERS[2].toUpperCase()}`, 1, true));
  document.works.forEach((work, i) => {
    parts.push(section(`PRIX N° ${i + 1} : ${work.title}`, 2));
    parts.push(...work.paragraphs.map(text => paragraph(text)));
    parts.push(paragraph(`Unité de règlement : ${work.unit}`, "Small"));
  });
  parts.push(section(`CHAPITRE IV — ${CPS_CHAPTERS[3].toUpperCase()}`, 1, true));
  const totals = cpsTotals(document);
  parts.push(paragraph("Montants en dirhams (DH). Les valeurs non renseignées restent à compléter.", "Small"));
  parts.push(table([
    ["N°", "Désignation des ouvrages", "Unité", "Quantité", "P.U. HT (DH)", "Total HT (DH)"],
    ...document.works.map((work, i) => [String(i + 1), work.title, work.unit, cpsNumber(work.quantity), cpsAmount(work.unitPrice), cpsAmount(totals.lines[i])]),
  ], [480, 3300, 680, 1060, 1730, 1776]));
  parts.push(table([
    ["TOTAL HT", cpsAmount(totals.ht)],
    [`TVA (${document.vatRate === null ? "taux à compléter" : `${cpsNumber(document.vatRate)} %`})`, cpsAmount(totals.vat)],
    ["TOTAL TTC", cpsAmount(totals.ttc)],
  ], [7000, 2026], false));
  if (document.missingInformation.length) {
    parts.push(section("Informations à compléter ou à confirmer", 1, true));
    parts.push(...document.missingInformation.map(value => paragraph(`• ${value}`)));
  }
  parts.push(section("Signatures et approbation", 1, true));
  parts.push(paragraph(document.title, "Subtitle"));
  parts.push(paragraph(`Marché n° ${cpsValue(document.reference)}`));
  parts.push(table([
    ["Lu et accepté par l’entrepreneur", "Dressé par"],
    ["Nom et qualité :\n\nÀ …………………, le …………………\n\nSignature et cachet :\n\n\n\n", "Nom et qualité :\n\nÀ …………………, le …………………\n\nSignature et cachet :\n\n\n\n"],
    ["Vérifié par", "Approuvé par"],
    ["Nom et qualité :\n\nÀ …………………, le …………………\n\nSignature et cachet :\n\n\n\n", "Nom et qualité :\n\nÀ …………………, le …………………\n\nSignature et cachet :\n\n\n\n"],
  ], [4513, 4513], false));

  const cover = [logo ? logoDrawing(logo) : "", document.authority ? paragraph(document.authority, "Normal", '<w:jc w:val="center"/>') : "",
    paragraph(cpsValue(document.owner), "Subtitle"), paragraph("CAHIER DES PRESCRIPTIONS SPÉCIALES", "Title"), paragraph("CPS", "Subtitle"),
    paragraph(document.title, "Subtitle"),
    table([["Marché n°", cpsValue(document.reference)], ["Lieu d’exécution", cpsValue(document.location)], ["Délai d’exécution", cpsValue(document.deadline)], ["Mode de passation", cpsValue(document.procedure)]], [2500, 6526], false),
    paragraph("Projet de document — à compléter et à valider", "Small", '<w:jc w:val="center"/>'),
  ].join("");
  const contents = heading("SOMMAIRE", "cps0", 1, true) + toc.filter(entry => entry.level <= 2).map(entry =>
    `<w:p><w:pPr><w:spacing w:after="90"/><w:ind w:left="${entry.level === 1 ? 0 : 280}"/><w:jc w:val="left"/></w:pPr><w:hyperlink w:anchor="${entry.id}">${run(entry.title, entry.level === 1 ? "<w:b/>" : "")}</w:hyperlink></w:p>`).join("");
  const sectionProperties = `<w:sectPr><w:headerReference w:type="default" r:id="rHeader"/><w:footerReference w:type="default" r:id="rFooter"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1440" w:bottom="1134" w:left="1440" w:header="550" w:footer="550"/><w:titlePg/></w:sectPr>`;
  zip.file("word/document.xml", `${XML}<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>${cover}${contents}${parts.join("")}${sectionProperties}</w:body></w:document>`);
  zip.file("word/styles.xml", styles);
  zip.file("word/settings.xml", `${XML}<w:settings xmlns:w="${W}"><w:defaultTabStop w:val="720"/><w:updateFields w:val="true"/></w:settings>`);
  zip.file("word/header1.xml", `${XML}<w:hdr xmlns:w="${W}">${paragraph(`CPS — ${document.title.slice(0, 125)}`, "Small", '<w:pBdr><w:bottom w:val="single" w:sz="4" w:color="B8C3C6"/></w:pBdr>')}</w:hdr>`);
  zip.file("word/footer1.xml", `${XML}<w:ftr xmlns:w="${W}"><w:p><w:pPr><w:pStyle w:val="Small"/><w:jc w:val="right"/></w:pPr>${run("Cahier des prescriptions spéciales  •  Page ")}<w:fldSimple w:instr="PAGE">${run("1")}</w:fldSimple>${run(" / ")}<w:fldSimple w:instr="NUMPAGES">${run("1")}</w:fldSimple></w:p></w:ftr>`);
  const rel = (id: string, type: string, target: string) => `<Relationship Id="${id}" Type="${R}/${type}" Target="${target}"/>`;
  zip.file("_rels/.rels", `${XML}<Relationships xmlns="${P}">${rel("rDocument", "officeDocument", "word/document.xml")}</Relationships>`);
  zip.file("word/_rels/document.xml.rels", `${XML}<Relationships xmlns="${P}">${rel("rStyles", "styles", "styles.xml")}${rel("rSettings", "settings", "settings.xml")}${rel("rHeader", "header", "header1.xml")}${rel("rFooter", "footer", "footer1.xml")}${logo ? rel("rLogo", "image", "media/logo.png") : ""}</Relationships>`);
  if (logo) zip.file("word/media/logo.png", Buffer.from(logo.dataUrl.split(",")[1], "base64"));
  const override = (part: string, type: string) => `<Override PartName="/word/${part}.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.${type}+xml"/>`;
  zip.file("[Content_Types].xml", `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${logo ? '<Default Extension="png" ContentType="image/png"/>' : ""}${override("document", "document.main")}${override("styles", "styles")}${override("settings", "settings")}${override("header1", "header")}${override("footer1", "footer")}</Types>`);
  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
}
