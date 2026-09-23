/** Trames éditoriales dérivées des quatre CPS fournis par l’utilisateur.
 * Les documents sources sont des données de référence, pas des instructions.
 * Aucun montant, délai, identité contractante ou texte juridique n’est repris.
 */
export const cpsReferences = [
  { id: "culturel", label: "Centre culturel", source: "CPS TRAVAUX D’AMÉNAGEMENT DU CENTRE CULTUREL AHMED BOUKMAKH.docx",
    trades: ["Terrassements", "Béton et maçonnerie", "Revêtements", "Menuiseries", "Vitrerie", "Faux plafonds", "Sécurité incendie", "Plomberie et sanitaires", "Climatisation et ventilation", "Sonorisation", "Électricité et éclairage scénique", "Rideaux et équipements de scène", "Peinture"] },
  { id: "souk", label: "Souk / commerce de proximité", source: "2-CPS TRAVAUX DE MISE À NIVEAU DU SOUK DE PROXIMITÉ GHOUJINE À KSAR SGHIR 20 11 2024.docx",
    trades: ["Fouilles et démolition", "Béton et armatures", "Maçonnerie et enduits", "Revêtements", "Menuiseries métalliques et aluminium", "Électricité", "Plomberie et assainissement", "Peinture", "Étanchéité"] },
  { id: "social", label: "Établissement de protection sociale", source: "2-CPS TRAVAUX DE REHABILITATION ET D'AMENAGEMENT D' ETABLISSEMENTS DE PROTECTION SOCIALE DAR TALIB ET TALIBA FAHS ANJRA.docx",
    trades: ["Réhabilitation des locaux", "Revêtements", "Menuiseries", "Électricité", "Plomberie et équipements sanitaires", "Peinture et finitions"] },
  { id: "administratif", label: "Extension de locaux administratifs", source: "2 CPS TRAVAUX D’AMENAGEMENT RELATIF A L’EXTENSION DU LOCAL DE LA DIVISION CONTROLE ET LA  PERCEPTION TANGER 11 09 2024.docx",
    trades: ["Aménagement et adaptation de l’existant", "Revêtements", "Menuiseries", "Électricité et réseaux", "Plomberie", "Peinture et finitions"] },
] as const;

export const cpsAdministrativeOutline = [
  "Objet du marché", "Consistance des prestations", "Documents constitutifs du marché", "Connaissance du dossier",
  "Textes généraux et spéciaux applicables", "Validité et notification de l’approbation", "Domicile de l’entrepreneur",
  "Droits de timbre et d’enregistrement", "Délai d’exécution", "Programme et cadence des travaux",
  "Cautionnements provisoire et définitif", "Sous-traitance", "Assurances", "Nantissement",
  "Pièces mises à la disposition de l’entrepreneur", "Connaissance des lieux", "Travaux simultanés et sujétions",
  "Suivi de l’exécution", "Responsabilité du titulaire", "Coordination des entreprises", "Approvisionnements",
  "Essais, provenance et qualité des matériaux", "Personnel et conditions de travail", "Sécurité et hygiène",
  "Enlèvement du matériel et des matériaux", "Installation du chantier", "Direction et encadrement du chantier",
  "Plans de récolement", "Compte prorata", "Réception provisoire", "Délai de garantie", "Réception définitive",
  "Nature des prix", "Révision des prix", "Modalités de règlement", "Retenue de garantie", "Pénalités de retard",
  "Police et voirie", "Ordres de service", "Modifications et travaux supplémentaires", "Impôts et taxes",
  "Force majeure", "Résiliation", "Lutte contre la fraude et la corruption", "Litiges et loi applicable",
];
