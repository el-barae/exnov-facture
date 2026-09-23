import type { Cps, CpsLogo } from "../../src/lib/cps";

export function exampleCps(): Cps {
  return {
    title: "TRAVAUX DE RÉHABILITATION D’UN CENTRE DE PROXIMITÉ — EXEMPLE FICTIF",
    authority: "Maître d’ouvrage de démonstration", owner: "Commune de démonstration", location: "Tanger",
    reference: "EXEMPLE/2026", procedure: "[À compléter : mode de passation]", deadline: "3 mois",
    administrative: [
      { title: "Objet du marché", paragraphs: ["Le présent projet de CPS concerne la réhabilitation d’un centre de proximité fictif à Tanger. Il est destiné à la vérification du générateur."] },
      { title: "Consistance des prestations", paragraphs: ["Les prestations comprennent la préparation des supports, la peinture des murs intérieurs et le remplacement des menuiseries. L’entreprise assure la protection des ouvrages conservés et le nettoyage de ses zones d’intervention."] },
      { title: "Délai d’exécution", paragraphs: ["Le délai prévu pour les travaux est de trois mois. Le point de départ du délai et le calendrier contractuel sont à compléter par le maître d’ouvrage."] },
      { title: "Références et conditions financières", paragraphs: ["[À compléter : références réglementaires et contractuelles à valider].", "Les cautionnements, les pénalités, la retenue de garantie et les modalités de règlement sont à compléter."] },
    ],
    technical: [
      { title: "Peinture intérieure", articles: [
        { title: "Préparation et protection", paragraphs: ["Protéger les sols, menuiseries et équipements conservés avant intervention. Vérifier l’adhérence du support, retirer les parties non adhérentes et reboucher les défauts avant application. Les supports doivent être propres et secs."] },
        { title: "Mise en œuvre et contrôle", paragraphs: ["Présenter les fiches techniques et un échantillon de teinte pour validation. Respecter les conditions d’application du système retenu. Contrôler la régularité de la teinte et l’absence de coulures, puis nettoyer les zones d’intervention."] },
      ] },
      { title: "Menuiserie aluminium", articles: [{ title: "Pose et réception", paragraphs: ["Relever les dimensions sur site avant fabrication. Soumettre les détails de pose à validation et assurer le calfeutrement périphérique. Vérifier l’ouverture, la fermeture et le réglage des ouvrants avant réception."] }] },
    ],
    works: [
      { title: "Peinture intérieure sur murs", unit: "m²", paragraphs: ["Préparation, rebouchage et application d’un système de peinture intérieure. Le prix comprend les protections, consommables et nettoyage. Règlement au mètre carré effectivement exécuté et accepté."], quantity: "450", unitPrice: "35.50" },
      { title: "Porte en aluminium", unit: "U", paragraphs: ["Fourniture et pose de portes en aluminium, y compris quincaillerie, fixation, calfeutrement, réglages et nettoyage. Les dimensions et performances restent à confirmer. Règlement à l’unité posée et acceptée."], quantity: "6", unitPrice: null },
    ],
    vatRate: null,
    missingInformation: ["Mode de passation et références réglementaires applicables.", "Prix des portes, taux de TVA et conditions financières.", "Dimensions et performances des menuiseries à confirmer."],
  };
}
export const testLogo: CpsLogo = { name: "test.png", width: 1, height: 1, dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=" };
