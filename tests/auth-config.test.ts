import test from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { verifyPassword } from "better-auth/crypto";
import { createManagedAuthUser, getAuthConfiguration, setManagedPassword } from "../src/lib/server/auth";
import { GET, POST } from "../src/app/api/auth/[...all]/route";

const configuredEnvironment = {
  NODE_ENV: "test" as const,
  BETTER_AUTH_URL: "https://facturo.example.test",
  BETTER_AUTH_SECRET: "test-only-secret-with-at-least-32-characters",
  DATABASE_URL: "postgresql://test:unused@localhost:5432/test",
};

function transactionRecorder(rowCount = 1) {
  const calls: { sql: string; values: unknown[] }[] = [];
  const client = {
    async query(sql: string, values: unknown[] = []) {
      calls.push({ sql, values });
      return { rowCount, rows: [] };
    },
  } as unknown as PoolClient;
  return { client, calls };
}

test("La connexion exige une configuration explicite et refuse une origine ambiguë", () => {
  assert.throws(() => getAuthConfiguration({ NODE_ENV: "test" }), /BETTER_AUTH_SECRET/);
  assert.throws(() => getAuthConfiguration({ ...configuredEnvironment, DATABASE_URL: "" }), /DATABASE_URL/);
  for (const url of ["javascript:alert(1)", "https://user:password@example.test", "https://example.test/path", "https://example.test?redirect=external", "https://example.test/#fragment"]) {
    assert.throws(() => getAuthConfiguration({ ...configuredEnvironment, BETTER_AUTH_URL: url }), /BETTER_AUTH_URL/);
  }
  assert.throws(() => getAuthConfiguration({ ...configuredEnvironment, NODE_ENV: "production", BETTER_AUTH_URL: "http://facturo.example.test" }), /HTTPS/);
  assert.equal(getAuthConfiguration(configuredEnvironment).secureCookies, true);
  assert.equal(getAuthConfiguration({ ...configuredEnvironment, BETTER_AUTH_URL: "http://localhost:3000/" }).baseURL, "http://localhost:3000");
});

test("La création administrée normalise l’identité et hache le mot de passe avec Better Auth", async () => {
  const { client, calls } = transactionRecorder();
  const password = "Compte-équipe-2026";
  const user = await createManagedAuthUser({ name: "  Technicien  ", email: "  TECH@example.test  ", password }, client);
  assert.equal(user.name, "Technicien");
  assert.equal(user.email, "tech@example.test");
  assert.match(user.id, /^[0-9a-f-]{36}$/);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].values[0], user.id);
  assert.equal(calls[1].values[1], user.id);
  const hash = calls[1].values[2] as string;
  assert.notEqual(hash, password);
  assert.equal(await verifyPassword({ hash, password }), true);
  assert.equal(await verifyPassword({ hash, password: "Incorrect-2026" }), false);
  assert.equal(calls.some(call => call.values.includes(password)), false);
  assert.equal(calls.some(call => /BEGIN|COMMIT|ROLLBACK/.test(call.sql)), false, "La transaction appartient à l’appelant pour inclure le rôle.");
});

test("Les identités et mots de passe invalides ne déclenchent aucune écriture", async () => {
  const { client, calls } = transactionRecorder();
  await assert.rejects(createManagedAuthUser({ name: "Équipe", email: "invalide", password: "Mot-de-passe-2026" }, client));
  await assert.rejects(createManagedAuthUser({ name: "Équipe", email: "team@example.test", password: "court" }, client));
  await assert.rejects(setManagedPassword("identifiant-invalide", "Mot-de-passe-2026", client));
  assert.equal(calls.length, 0);
});

test("La réinitialisation du mot de passe révoque les sessions dans la même transaction", async () => {
  const { client, calls } = transactionRecorder();
  const userId = "cf114637-b735-4660-9734-02f1fbaecdb9";
  const password = "Nouveau-mot-de-passe-2026";
  await setManagedPassword(userId, password, client);
  assert.equal(calls.length, 2);
  assert.equal(await verifyPassword({ hash: calls[0].values[1] as string, password }), true);
  assert.match(calls[1].sql, /DELETE FROM "session"/);
  assert.deepEqual(calls[1].values, [userId]);
  const missing = transactionRecorder(0);
  await assert.rejects(setManagedPassword(userId, password, missing.client), /introuvable/);
  assert.equal(missing.calls.length, 1);
});

test("L’API refuse les écritures sans origine fiable avant toute connexion PostgreSQL", async () => {
  const previous = { ...process.env };
  try {
    Object.assign(process.env, configuredEnvironment);
    for (const origin of [undefined, "https://other.example.test", "null"]) {
      const response = await POST(new Request("https://facturo.example.test/api/auth/sign-in/email", {
        method: "POST", headers: origin ? { origin } : {},
      }));
      assert.equal(response.status, 403);
    }
    delete process.env.BETTER_AUTH_SECRET;
    const response = await GET(new Request("https://facturo.example.test/api/auth/get-session"));
    assert.equal(response.status, 503);
    const body = await response.text();
    assert.match(body, /pas encore configurée/);
    assert.equal(body.includes(configuredEnvironment.DATABASE_URL), false);
    assert.equal(body.includes(configuredEnvironment.BETTER_AUTH_SECRET), false);
  } finally {
    for (const name of Object.keys(process.env)) if (!(name in previous)) delete process.env[name];
    Object.assign(process.env, previous);
  }
});
