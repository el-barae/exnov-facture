import type { Page } from "puppeteer-core";
import { WORKFLOW_STEPS } from "../../src/lib/projects";

export async function showProjectStep(page: Page, stepId: string) {
  const index = WORKFLOW_STEPS.findIndex(step => step.id === stepId);
  if (index < 0) throw new Error(`Étape inconnue : ${stepId}`);
  const start = Math.floor(index / 3) * 3 + 1;
  await page.click(`[aria-label="Afficher les étapes ${start} à ${start + 2}"]`);
  await page.waitForSelector(`[data-step="${stepId}"]`);
}
