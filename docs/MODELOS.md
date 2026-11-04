# Modelos de IA do SKYNET

Os modelos vivem **só no backend**, com roteamento automático (`supabase/functions/_shared/router.ts`).
O app nunca escolhe provedor: manda `auto` (equilíbrio) ou `melhor` (máxima qualidade) e o servidor decide,
com failover, medidor de latência e cooldown por modelo.

## Onde o catálogo é definido

| Secret | Papel |
|---|---|
| `SKYNET_CATALOG` | catálogo principal em JSON: `[{id, provider, label, tier, priority}]` |
| `SKYNET_MODELS` | formato antigo, lista separada por vírgulas (fallback) |
| `SKYNET_PROVIDERS` | provedores extras: `[{id, baseUrl, keyEnv}]` |
| `OPENAI_BASE_URL` / `OPENAI_API_KEY` | provedor primário (NVIDIA integrate) |

Tiers: `rapido`, `equilibrado`, `potente`, `raciocinio`. O `priority` desempata dentro do tier
(menor = preferido). A fila de cada resposta usa no máximo 6 modelos e reserva a última vaga
para um modelo **sem histórico**, em rodízio, para descobrir novos bons modelos.

## Diagnóstico do provedor (obrigatório antes de adicionar)

```
GET /functions/v1/modelos-provedor?k=$SKYNET_OPS_KEY                  # lista o que o provedor anuncia
GET /functions/v1/modelos-provedor?k=$SKYNET_OPS_KEY&test=id1,id2,... # testa de verdade (até 20 por chamada)
```

**Lição de 04/11/2026:** o provedor anunciava 85 modelos e apenas 16 respondiam; o resto devolvia
`404 Function ... Not found`. Adicionar sem testar só gasta tentativas e deixa o chat lento,
porque a fila queima vagas em modelos mortos antes de chegar no que funciona.

## Catálogo verificado (04/11/2026)

- `potente`: mistral-large-4-1t-a52b, nemotron-3.5-super-vl-120b-a12b, nemotron-3-ultra-550b-a55b
- `raciocinio`: nemotron-3-nano-omni-30b-a3b-reasoning
- `equilibrado`: step-5-preview, llama-3.2-90b-vision-instruct, minimax-m3.1-flash, muse-glimmer-30b, openai (pollinations)
- `rapido`: laguna-xs-2.1, nemotron-3.5-bolt-e4b, nemotron-3.5-lightning-30b-a3b, openai-fast (pollinations)

Provedor secundário sem custo: **Pollinations** (`https://text.pollinations.ai/openai`), configurado em
`SKYNET_PROVIDERS` com `keyEnv: POLLINATIONS_KEY` (valor `public`, o serviço ignora o header).
Serve como rede de segurança quando a NVIDIA falha ou entra em cooldown.

## Como adicionar um modelo

1. Confirme com `&test=` que responde 200 e quanto demora.
2. Escolha o tier pela capacidade e o `priority` pela latência.
3. Atualize `SKYNET_CATALOG` (não remova os que já funcionam) e, se for outro provedor, `SKYNET_PROVIDERS`.
4. Verifique em `/functions/v1/models` e mande uma pergunta real no chat com `model: "auto"` e `"melhor"`.
5. Olhe `model_health` (ok/fail/avg_ms/cooldown_until) depois de algumas respostas.
