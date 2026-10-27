import { test } from "node:test";
import assert from "node:assert/strict";
import { TOOLS, CONNECTORS, SCREENS, validateToolCall, buildRpcResponse, callTool, VERSION } from "../server/mcp-server.mjs";

test("initialize devolve protocolo e servidor", () => {
  const r = buildRpcResponse({ id: 1, method: "initialize" });
  assert.equal(r.result.serverInfo.name, "skynet-mcp");
  assert.equal(r.result.serverInfo.version, VERSION);
  assert.ok(r.result.capabilities.tools);
});

test("tools/list expoe as cinco ferramentas", () => {
  const r = buildRpcResponse({ id: 2, method: "tools/list" });
  assert.equal(r.result.tools.length, 5);
  const nomes = r.result.tools.map((t) => t.name);
  for (const n of ["skynet_status", "skynet_connectors", "skynet_api", "skynet_screens", "skynet_subagent"]) assert.ok(nomes.includes(n));
});

test("metodo inexistente devolve -32601", () => {
  const r = buildRpcResponse({ id: 3, method: "nao/existe" });
  assert.equal(r.error.code, -32601);
});

test("ferramenta desconhecida e recusada", () => {
  const v = validateToolCall("rm_rf", {});
  assert.equal(v.ok, false);
  assert.match(v.error, /desconhecida/);
});

test("skynet_api so aceita funcoes da lista branca", () => {
  assert.equal(validateToolCall("skynet_api", { function: "chat" }).ok, true);
  const bad = validateToolCall("skynet_api", { function: "../../secrets" });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /nao permitida/);
});

test("skynet_subagent exige goal em texto", () => {
  const v = validateToolCall("skynet_subagent", { goal: 123 });
  assert.equal(v.ok, false);
  assert.match(v.error, /texto/);
});

test("conectores nao marcam como autorizado sem prova", () => {
  const gmail = CONNECTORS.find((c) => c.name === "gmail");
  const drive = CONNECTORS.find((c) => c.name === "googledrive");
  assert.equal(gmail.authorized, true);
  assert.ok(gmail.evidence.length > 0);
  assert.equal(drive.authorized, false);
  assert.equal(drive.can.length, 0);
});

test("todos os conectores autorizados tem evidencia", () => {
  for (const c of CONNECTORS.filter((x) => x.authorized)) assert.ok(c.evidence && c.evidence.length > 5, `${c.name} sem evidencia`);
});

test("skynet_screens monta URL por tela", async () => {
  const out = await callTool("skynet_screens", { base: "https://exemplo.test" });
  assert.equal(out.ok, true);
  assert.equal(out.screens.length, SCREENS.length);
  assert.equal(out.screens[0].url, "https://exemplo.test/");
});

test("skynet_connectors filtra autorizados", async () => {
  const out = await callTool("skynet_connectors", { onlyAuthorized: true });
  assert.equal(out.ok, true);
  assert.ok(out.connectors.every((c) => c.authorized));
});
