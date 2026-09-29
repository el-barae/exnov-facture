import test from "node:test";
import { APIError } from "better-auth/api";
import assert from "node:assert/strict";
import { apiError, assertSameOrigin, protectApi, sessionUser, teamMode } from "../src/lib/server/team-access";
import { RequestError } from "../src/lib/server/request";

async function withEnvironment(values: Record<string, string | undefined>, run: () => void | Promise<void>) {
  const previous = Object.fromEntries(Object.keys(values).map(name => [name, process.env[name]]));
  try {
    for (const [name, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await run();
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

const configured = {
  DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
  BETTER_AUTH_SECRET: "test-secret-with-at-least-32-characters",
  BETTER_AUTH_URL: "https://facturo.example.test",
  EXNOV_DEMO_MODE: "false",
};

function request(origin?: string, method = "POST") {
  return new Request("http://127.0.0.1:3000/api/plans/generate", {
    method, headers: origin === undefined ? {} : { origin },
  });
}

test("Sans configuration complète, les API sensibles sont fermées et aucune session démo n’est acceptée", async () => {
  for (const missing of ["DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL"]) {
    await withEnvironment({ ...configured, [missing]: undefined }, async () => {
      assert.equal(teamMode(), "setup");
      assert.equal(await sessionUser(request()), null);
      for (const capability of ["ai", "finance", "export"] as const) {
        const response = await protectApi(request(configured.BETTER_AUTH_URL), capability);
        assert.equal(response?.status, 503);
        const text = await response!.text();
        assert.equal(text.includes(configured.DATABASE_URL), false);
        assert.equal(text.includes(configured.BETTER_AUTH_SECRET), false);
      }
    });
  }
});

test("Le mode démo exige l’activation explicite et exacte du paramètre serveur", async () => {
  for (const value of [undefined, "", "false", "TRUE", "1"]) {
    await withEnvironment({ DATABASE_URL: undefined, BETTER_AUTH_SECRET: undefined, BETTER_AUTH_URL: undefined, EXNOV_DEMO_MODE: value }, () => {
      assert.equal(teamMode(), "setup");
    });
  }
  await withEnvironment({ ...configured, EXNOV_DEMO_MODE: "true" }, async () => {
    assert.equal(teamMode(), "demo");
    assert.equal(await protectApi(request(), "ai"), null);
  });
  await withEnvironment(configured, () => assert.equal(teamMode(), "team"));
});

test("Les écritures exigent l’origine publique exacte, y compris derrière un reverse proxy", async () => {
  await withEnvironment({ BETTER_AUTH_URL: configured.BETTER_AUTH_URL }, () => {
    assert.doesNotThrow(() => assertSameOrigin(request(configured.BETTER_AUTH_URL)));
    for (const origin of [undefined, "null", "http://facturo.example.test", "http://127.0.0.1:3000", "https://facturo.example.test.evil.test", "https://evil.test"]) {
      assert.throws(() => assertSameOrigin(request(origin)), error => error instanceof RequestError && error.status === 403);
    }
    assert.doesNotThrow(() => assertSameOrigin(request(undefined, "GET")));
  });
});

test("En absence d’URL publique, le contrôle d’origine se limite à celle de la requête", async () => {
  await withEnvironment({ BETTER_AUTH_URL: undefined }, () => {
    assert.doesNotThrow(() => assertSameOrigin(request("http://127.0.0.1:3000")));
    assert.throws(() => assertSameOrigin(request("https://evil.test")), RequestError);
  });
});


test("Une session impossible à vérifier reste fermée avec un message temporaire sans détails sensibles", async () => {
  const error = new APIError("INTERNAL_SERVER_ERROR", { code: "FAILED_TO_GET_SESSION", message: "private-database-host" });
  const response = apiError(error);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.match(body.error, /momentanément indisponible/);
  assert.equal(JSON.stringify(body).includes("private-database-host"), false);
});
