import { MAX_CPS_LOGO_BYTES, type CpsLogo } from "./cps";

export async function prepareCpsLogo(file: File): Promise<CpsLogo> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("Choisissez un logo PNG, JPG ou WebP.");
  if (file.size > 12_000_000) throw new Error("Le logo dépasse 12 Mo. Choisissez une image plus petite.");
  const source = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = source;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("Le logo est illisible.");
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Impossible de préparer le logo dans ce navigateur.");
    for (let edge = 1000; edge >= 200; edge = Math.floor(edge * .7)) {
      const ratio = Math.min(1, edge / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/png");
      if ((dataUrl.length - 22) * .75 <= MAX_CPS_LOGO_BYTES) return { name: file.name.slice(0, 160), dataUrl, width: canvas.width, height: canvas.height };
    }
    throw new Error("Le logo est trop volumineux après réduction.");
  } catch (error) {
    if (error instanceof DOMException) throw new Error("Le fichier image est illisible. Essayez un autre logo.");
    throw error;
  } finally { URL.revokeObjectURL(source); }
}
