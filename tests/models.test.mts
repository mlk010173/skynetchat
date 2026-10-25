import { test } from "node:test";
import assert from "node:assert/strict";
import { getModels, isValidModel, getProviderBaseUrl } from "../lib/models.ts";

test("sem SKYHUB_MODELS usa lista padrão", () => {
  delete process.env.SKYHUB_MODELS;
  assert.deepEqual(getModels(), ["gpt-4o-mini", "gpt-4o"]);
});

test("SKYHUB_MODELS é parseado corretamente (vírgulas e espaços)", () => {
  process.env.SKYHUB_MODELS = "llama-3.3-70b-versatile , gpt-4o-mini ,  ";
  assert.deepEqual(getModels(), ["llama-3.3-70b-versatile", "gpt-4o-mini"]);
  assert.equal(isValidModel("llama-3.3-70b-versatile"), true);
  assert.equal(isValidModel("modelo-inexistente"), false);
  delete process.env.SKYHUB_MODELS;
});

test("base URL do provedor remove barras finais", () => {
  process.env.OPENAI_BASE_URL = "https://api.groq.com/openai/v1///";
  assert.equal(getProviderBaseUrl(), "https://api.groq.com/openai/v1");
  delete process.env.OPENAI_BASE_URL;
  assert.equal(getProviderBaseUrl(), "https://api.openai.com/v1");
});
