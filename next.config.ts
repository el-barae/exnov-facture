import type { NextConfig } from "next";

const config: NextConfig = {
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  outputFileTracingIncludes: {
    "/api/factures/pdf": ["./node_modules/@sparticuz/chromium/bin/**", "./public/fonts/**", "./public/*exnov*"],
    "/api/factures/word": ["./templates/facture-exnov.docx", "./public/*exnov*"],
  },
  poweredByHeader: false,
  async headers() {
    // L’aperçu s’exécute dans une iframe isolée, d’origine opaque.
    return [{ source: "/fonts/:path*", headers: [{ key: "Access-Control-Allow-Origin", value: "*" }] }];
  },
};
export default config;
