import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DocumentAssets } from "../document/html";
export async function loadAssets(): Promise<DocumentAssets> {
  const data = async (file: string, mime: string) => `data:${mime};base64,${(await readFile(path.join(process.cwd(), "public", file))).toString("base64")}`;
  const [logo, watermark, fontRegular, fontBold, fontSans] = await Promise.all([
    data("logo-exnov.png", "image/png"), data("watermark-exnov.png", "image/png"),
    data("fonts/Carlito-Regular.ttf", "font/ttf"), data("fonts/Carlito-Bold.ttf", "font/ttf"), data("fonts/NotoSans.ttf", "font/ttf"),
  ]);
  return { logo, watermark, fontRegular, fontBold, fontSans };
}
