import test from 'node:test';
import assert from 'node:assert/strict';
process.env.SKYNET_AGENT_NO_LISTEN = '1';
const { urlPermitida, validarComando, calcular } = await import('../server/agent.mjs');

test('rejeita HTTP e endereços locais via URL', () => {
  assert.equal(urlPermitida('http://example.com').ok, false);
  assert.equal(urlPermitida('https://localhost').ok, false);
  assert.equal(urlPermitida('https://127.0.0.1').ok, false);
  assert.equal(urlPermitida('https://10.1.2.3').ok, false);
  assert.equal(urlPermitida('https://169.254.169.254/latest/meta-data').ok, false);
  assert.equal(urlPermitida('https://192.168.1.1').ok, false);
});

test('permite uma URL HTTPS pública sintaticamente válida', () => {
  assert.equal(urlPermitida('https://example.com/docs').ok, true);
});

test('terminal rejeita comandos fora da lista permitida', () => {
  assert.equal(validarComando('rm -rf /').ok, false);
  assert.equal(validarComando('cat README.md').ok, true);
  assert.equal(validarComando('ls; whoami').ok, false);
});

test('calculadora rejeita expressões inválidas', () => {
  assert.deepEqual(calcular('2+3*4').resultado, 14);
  assert.equal(calcular('process.exit()').ok, false);
  assert.equal(calcular('2/0').ok, false);
});
