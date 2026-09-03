import "server-only";

import puppeteer, { type Browser } from "puppeteer";

import { env } from "~/env";

// A shared browser instance across requests (launching Chromium is expensive).
const globalForBrowser = globalThis as unknown as { browser: Browser | undefined };

async function getBrowser(): Promise<Browser> {
  globalForBrowser.browser ??= await puppeteer.launch({
    headless: true,
    executablePath: env.PUPPETEER_EXECUTABLE_PATH,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  return globalForBrowser.browser;
}

export async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}
