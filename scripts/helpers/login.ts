import assert from "node:assert/strict";
import type { Page } from "puppeteer-core";

export async function login(page: Page, origin: string) {
  await page.goto(origin, { waitUntil: "networkidle0" });
  await page.waitForSelector("#login-email");
  await page.type("#login-email", "demo@exnov.ma");
  await page.type("#login-password", "demonstration");
  await page.click('.login-form button[type="submit"]');
  await page.waitForSelector(".projects-workspace", { visible: true });
  assert.equal(new URL(page.url()).pathname, "/projets");
}
