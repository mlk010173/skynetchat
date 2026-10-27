import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseIdToken, assertRs256, validateFirebaseClaims, identityKey, decideMapping, FIREBASE_ISS,
} from "../supabase/functions/firebase-bridge/logic.mjs";

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const make = (payload, header = { alg: "RS256", kid: "k1" }) => `${b64(header)}.${b64(payload)}.c2ln`;
const NOW = 1_800_000_000;
const base = { iss: FIREBASE_ISS("skynet-proj"), aud: "skynet-proj", sub: "uid-123", user_id: "uid-123", exp: NOW + 3600, iat: NOW - 10, email: "a@b.com", email_verified: true };

test("token valido passa", () => {
  const t = parseIdToken(make(base));
  assert.equal(t.payload.sub, "uid-123");
  assert.equal(assertRs256(t.header), true);
  assert.equal(validateFirebaseClaims(t.payload, { projectId: "skynet-proj", nowSec: NOW }).ok, true);
});

test("alg none e recusado", () => {
  const t = parseIdToken(make(base, { alg: "none" }));
  assert.throws(() => assertRs256(t.header), /algoritmo nao permitido/);
});

test("HS256 e recusado (troca de algoritmo)", () => {
  const t = parseIdToken(make(base, { alg: "HS256" }));
  assert.throws(() => assertRs256(t.header), /algoritmo nao permitido/);
});

test("token expirado e recusado", () => {
  const p = { ...base, exp: NOW - 120 };
  assert.equal(validateFirebaseClaims(p, { projectId: "skynet-proj", nowSec: NOW }).ok, false);
});

test("issuer de outro projeto e recusado", () => {
  const p = { ...base, iss: FIREBASE_ISS("outro-projeto") };
  const r = validateFirebaseClaims(p, { projectId: "skynet-proj", nowSec: NOW });
  assert.equal(r.ok, false);
  assert.match(r.error, /issuer/);
});

test("audience errada e recusada", () => {
  const p = { ...base, aud: "outro-projeto" };
  assert.match(validateFirebaseClaims(p, { projectId: "skynet-proj", nowSec: NOW }).error, /audience/);
});

test("user_id divergente do sub e recusado", () => {
  const p = { ...base, user_id: "outro" };
  assert.match(validateFirebaseClaims(p, { projectId: "skynet-proj", nowSec: NOW }).error, /user_id/);
});

test("token emitido no futuro e recusado", () => {
  const p = { ...base, iat: NOW + 600 };
  assert.match(validateFirebaseClaims(p, { projectId: "skynet-proj", nowSec: NOW }).error, /futuro/);
});

test("token malformado nao derruba o processo", () => {
  assert.throws(() => parseIdToken("a.b"), /malformado/);
  assert.throws(() => parseIdToken("@@@.@@@.@@@"), /base64url/);
});

test("mapeamento recusa e-mail nao verificado", () => {
  const id = identityKey({ ...base, email_verified: false });
  assert.equal(decideMapping(id, null).action, "reject");
});

test("mapeamento recusa identidade sem e-mail", () => {
  const id = identityKey({ ...base, email: undefined });
  assert.equal(decideMapping(id, null).reason, "sem e-mail para mapear");
});

test("mapeamento reusa vinculo existente", () => {
  const id = identityKey(base);
  assert.equal(decideMapping(id, { firebase_uid: "uid-123" }).action, "reuse");
});

test("e-mail verificado cria vinculo novo", () => {
  const id = identityKey(base);
  const r = decideMapping(id, null);
  assert.equal(r.action, "link");
  assert.equal(id.email, "a@b.com");
  assert.equal(id.provider, "desconhecido");
});
