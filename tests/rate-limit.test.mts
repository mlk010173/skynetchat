import { test } from "node:test";
import assert from "node:assert/strict";
import { anonymousAllowed } from "../lib/rate-limit.ts";

test("usuário anônimo novo recebe 20 mensagens permitidas", () => {
  const ip = `ip-test-${Math.random()}`;
  for (let i = 0; i < 20; i++) {
    assert.equal(anonymousAllowed(ip), true, `mensagem ${i + 1} deveria passar`);
  }
});

test("mensagem 21 do mesmo IP é bloqueada", () => {
  const ip = `ip-test-${Math.random()}`;
  for (let i = 0; i < 20; i++) anonymousAllowed(ip);
  assert.equal(anonymousAllowed(ip), false);
});

test("IPs diferentes têm baldes independentes", () => {
  const a = `ip-a-${Math.random()}`;
  const b = `ip-b-${Math.random()}`;
  for (let i = 0; i < 20; i++) anonymousAllowed(a);
  assert.equal(anonymousAllowed(a), false, "a esgotou");
  assert.equal(anonymousAllowed(b), true, "b começa limpo");
});
