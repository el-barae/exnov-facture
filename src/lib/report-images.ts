import { MAX_IMAGE_BYTES, type ReportImage } from "./report";

/** Réduit les photos avant envoi pour garder les requêtes sous la limite serveur. */
export async function prepareReportImage(file: File): Promise<ReportImage> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Choisissez des images JPG, PNG ou WebP.");
  if (file.size > 12_000_000) throw new Error(`L’image « ${file.name} » dépasse 12 Mo.`);
  const source = URL.createObjectURL(file);
  const image = new Image();
  try {
    image.src = source;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("Image illisible.");
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Votre navigateur ne permet pas de préparer les images.");
    let edge = 1600;
    for (let attempt = 0; attempt < 5; attempt++) {
      const ratio = Math.min(1, edge / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
      context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", .82 - attempt * .07);
      if ((dataUrl.length - 23) * .75 <= MAX_IMAGE_BYTES) return { id: crypto.randomUUID(), name: file.name.slice(0, 160), dataUrl };
      edge = Math.round(edge * .8);
    }
    throw new Error(`L’image « ${file.name} » est trop volumineuse. Essayez une version plus petite.`);
  } catch (error) {
    if (error instanceof DOMException) throw new Error(`L’image « ${file.name} » est illisible.`);
    throw error;
  } finally { URL.revokeObjectURL(source); }
}
