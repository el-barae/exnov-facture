"use client";

import { createAuthClient } from "better-auth/react";

let client: ReturnType<typeof createAuthClient> | undefined;

export function getAuthClient() {
  // A relative base path keeps authentication on the application's own origin.
  return client ??= createAuthClient({ basePath: "/api/auth" });
}
