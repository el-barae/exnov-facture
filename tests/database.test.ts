import test from "node:test";
import assert from "node:assert/strict";
import { createServer, getDefaultAutoSelectFamilyAttemptTimeout } from "node:net";
import { once } from "node:events";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { databaseTransport, getDatabase, transaction } from "../src/lib/server/database";

// A real PostgreSQL connection exercises the custom TCP socket and transaction lifecycle.
test("La connexion PostgreSQL conserve les transactions et ne modifie pas les délais réseau globaux", async () => {
  const previousUrl = process.env.DATABASE_URL;
  const defaultTimeout = getDefaultAutoSelectFamilyAttemptTimeout();
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const address = reservation.address();
  assert.ok(address && typeof address !== "string");
  await new Promise<void>((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()));
  const db = await PGlite.create();
  const server = new PGLiteSocketServer({ db, port: address.port, host: "127.0.0.1" });
  await server.start();
  try {
    process.env.DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${address.port}/postgres?sslmode=disable`;
    await getDatabase().query("CREATE TABLE test_values(value integer)");
    await transaction(async client => {
      await client.query("INSERT INTO test_values(value) VALUES(1)");
    });
    await assert.rejects(transaction(async client => {
      await client.query("INSERT INTO test_values(value) VALUES(2)");
      throw new Error("Annulation de la transaction de test");
    }), /Annulation/);
    const result = await getDatabase().query("SELECT value FROM test_values ORDER BY value");
    assert.deepEqual(result.rows, [{ value: 1 }]);
    assert.equal(getDefaultAutoSelectFamilyAttemptTimeout(), defaultTimeout);
  } finally {
    await getDatabase().end();
    await server.stop();
    await db.close();
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
  }
});


test("Neon utilise WebSocket, les autres hôtes conservent le pilote PostgreSQL standard", () => {
  assert.equal(databaseTransport("postgresql://user:password@ep-test-pooler.eu-west-1.aws.neon.tech/db"), "neon");
  assert.equal(databaseTransport("postgresql://user:password@ep-test.eu-west-1.aws.neon.tech/db"), "neon");
  assert.equal(databaseTransport("postgresql://user:password@localhost:5432/db"), "tcp");
  assert.equal(databaseTransport("postgresql://user:password@neon.tech.example.test/db"), "tcp");
});
