import "server-only";
import { APP_NAME } from "../../config/app";

import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { hashPassword } from "better-auth/crypto";
import { APIError } from "better-auth/api";
import type { DatabaseClient as PoolClient } from "./database";
import { z } from "zod";
import { getDatabase } from "./database";
import { teamUserSchema } from "../team";

export class AuthConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthConfigurationError";
  }
}

/** Read on demand so builds never need production credentials or a database. */
export function getAuthConfiguration(environment = process.env) {
  const secret = environment.BETTER_AUTH_SECRET;
  if (!secret || secret.trim().length < 32) {
    throw new AuthConfigurationError("BETTER_AUTH_SECRET doit contenir au moins 32 caractères aléatoires.");
  }
  if (!environment.DATABASE_URL?.trim()) {
    throw new AuthConfigurationError("DATABASE_URL doit être configurée pour connecter Neon.");
  }
  let url: URL;
  try {
    url = new URL(environment.BETTER_AUTH_URL ?? "");
  } catch {
    throw new AuthConfigurationError("BETTER_AUTH_URL doit être l’URL publique de l’application.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username || url.password || url.pathname !== "/" || url.search || url.hash
  ) {
    throw new AuthConfigurationError("BETTER_AUTH_URL doit contenir uniquement l’origine de l’application.");
  }
  if (environment.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new AuthConfigurationError("BETTER_AUTH_URL doit utiliser HTTPS en production.");
  }
  return { secret, baseURL: url.origin, secureCookies: url.protocol === "https:" };
}

function createAuth() {
  const configuration = getAuthConfiguration();
  return betterAuth({
    appName: APP_NAME,
    baseURL: configuration.baseURL,
    secret: configuration.secret,
    database: getDatabase(),
    trustedOrigins: [configuration.baseURL],
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
    },
    databaseHooks: {
      user: {
        update: {
          async before(user) {
            if (user.name === undefined) return;
            const name = teamUserSchema.shape.name.safeParse(user.name);
            if (!name.success) throw new APIError("BAD_REQUEST", { message: "Le nom doit contenir entre 1 et 160 caractères." });
            return { data: { ...user, name: name.data } };
          },
        },
      },
      session: {
        create: {
          async before(session) {
            const membership = await getDatabase().query(
              "SELECT user_id FROM team_members WHERE user_id = $1 AND active = true",
              [session.userId],
            );
            if (membership.rowCount !== 1) throw new APIError("FORBIDDEN", { message: "Ce compte ne dispose pas d’un accès actif à l’équipe." });
          },
        },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      // Every protected request checks the current server-side session.
      cookieCache: { enabled: false },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 10 },
        "/change-password": { window: 60, max: 5 },
        "/request-password-reset": { window: 60, max: 3 },
      },
    },
    advanced: {
      useSecureCookies: configuration.secureCookies,
      disableCSRFCheck: false,
      disableOriginCheck: false,
      database: { generateId: () => randomUUID() },
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", path: "/" },
    },
  });
}

let auth: ReturnType<typeof createAuth> | undefined;

export function getAuth() {
  return auth ??= createAuth();
}

const managedPasswordSchema = z.string().min(12, "Le mot de passe doit contenir au moins 12 caractères.").max(128);
const managedUserSchema = z.object({
  name: teamUserSchema.shape.name,
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  password: managedPasswordSchema,
});

export type ManagedAuthUserInput = z.input<typeof managedUserSchema>;

/** The caller owns the transaction and must create the team membership with it. */
export async function createManagedAuthUser(input: ManagedAuthUserInput, client: PoolClient) {
  const { name, email, password } = managedUserSchema.parse(input);
  const passwordHash = await hashPassword(password);
  const id = randomUUID();
  await client.query(
    `INSERT INTO "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, false, now(), now())`,
    [id, name, email],
  );
  await client.query(
    `INSERT INTO "account" ("id", "userId", "accountId", "providerId", "password", "createdAt", "updatedAt")
     VALUES ($1, $2, $2, 'credential', $3, now(), now())`,
    [randomUUID(), id, passwordHash],
  );
  return { id, name, email };
}

/** The caller must authorize the administrator and own the transaction. */
export async function setManagedPassword(userId: string, password: string, client: PoolClient) {
  z.uuid().parse(userId);
  const passwordHash = await hashPassword(managedPasswordSchema.parse(password));
  const result = await client.query(
    `UPDATE "account" SET "password" = $2, "updatedAt" = now()
     WHERE "userId" = $1 AND "providerId" = 'credential'`,
    [userId, passwordHash],
  );
  if (result.rowCount !== 1) throw new Error("Compte de connexion introuvable.");
  await client.query(`DELETE FROM "session" WHERE "userId" = $1`, [userId]);
}
