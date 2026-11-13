// Testes do núcleo de memória (supabase/functions/_shared/memoria.ts).
// Rodam no vitest do frontend porque o módulo é puro: sem Deno, sem rede, sem
// imports externos. Comando: `npx vitest run src/memoria-core.test.js` em frontend/.
import { describe, expect, it } from "vitest";
import {
  TIPOS,
  classificar,
  cpfValido,
  deduplicar,
  detectarSensivel,
  estimarTokens,
  extrairCandidatos,
  extrairTopicos,
  hashConteudo,
  jaccard,
  limpar,
  luhnValido,
  mascarar,
  montarContexto,
  normalizar,
  resumirConversa,
} from "../../supabase/functions/_shared/memoria.ts";

/* --------------------------------------------------------------- sensível */

describe("detectarSensivel", () => {
  it("marca senha escrita de forma explícita", () => {
    const r = detectarSensivel("minha senha é hunter2supersecreta");
    expect(r.sensivel).toBe(true);
    expect(r.motivos).toContain("senha");
  });

  it("marca senha com dois pontos e em inglês", () => {
    expect(detectarSensivel("password: Tr0ub4dor&3").sensivel).toBe(true);
    expect(detectarSensivel("pwd = abc12345").sensivel).toBe(true);
    expect(detectarSensivel("minha senha do banco é xyz789").sensivel).toBe(true);
  });

  it("marca JWT", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4ifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    const r = detectarSensivel(`guarde este token ${jwt}`);
    expect(r.sensivel).toBe(true);
    expect(r.motivos).toContain("jwt");
  });

  it("marca chave sk-", () => {
    const r = detectarSensivel("minha chave é sk-proj-abcdefghijklmnop123456");
    expect(r.sensivel).toBe(true);
    expect(r.motivos).toContain("chave_openai");
  });

  it("marca tokens com prefixo de outros provedores", () => {
    expect(detectarSensivel("ghp_abcdefghijklmnopqrstuvwx").motivos).toContain("token_github");
    expect(detectarSensivel("sbp_abcdefghijklmnopqrstuvwx").motivos).toContain("token_supabase");
  });

  it("marca CPF válido e ignora número de 11 dígitos inválido", () => {
    // 111.444.777-35 é CPF com verificadores corretos
    expect(detectarSensivel("meu cpf é 111.444.777-35").motivos).toContain("cpf");
    expect(detectarSensivel("meu cpf é 111.444.777-36").sensivel).toBe(false);
    expect(detectarSensivel("telefone 11987654321").motivos).not.toContain("cpf");
  });

  it("marca cartão com Luhn válido e ignora inválido", () => {
    expect(detectarSensivel("cartão 4111 1111 1111 1111").motivos).toContain("cartao");
    expect(detectarSensivel("cartão 4111 1111 1111 1112").motivos).not.toContain("cartao");
  });

  it("marca e-mail junto de senha na mesma frase", () => {
    const r = detectarSensivel("meu login é fulano@exemplo.com e a senha é abcdefgh");
    expect(r.sensivel).toBe(true);
    expect(r.motivos).toEqual(expect.arrayContaining(["senha", "email_com_senha"]));
  });

  it("marca URL de banco com senha e chave privada", () => {
    expect(detectarSensivel("postgres://user:segredo@db.host:5432/postgres").sensivel).toBe(true);
    expect(detectarSensivel("-----BEGIN RSA PRIVATE KEY-----").sensivel).toBe(true);
  });

  it("não marca memória comum", () => {
    const casos = [
      "Prefiro respostas curtas e sem preâmbulo.",
      "Meu projeto Skynet usa Supabase e React.",
      "Decidimos usar pgvector para busca semântica.",
      "Sempre responda em português do Brasil.",
    ];
    for (const c of casos) expect(detectarSensivel(c), c).toEqual({ sensivel: false, motivos: [] });
  });

  it("Luhn e CPF conferem dígitos de verdade", () => {
    expect(luhnValido("4111111111111111")).toBe(true);
    expect(luhnValido("4111111111111112")).toBe(false);
    expect(luhnValido("1234")).toBe(false);
    expect(cpfValido("111.444.777-35")).toBe(true);
    expect(cpfValido("111.444.777-36")).toBe(false);
  });

  it("mascarar esconde o segredo para o log", () => {
    const m = mascarar("minha chave é sk-proj-abcdefghijklmnop123456");
    expect(m).not.toContain("abcdefghijklmnop123456");
    expect(m).toContain("sk-");
  });
});

/* -------------------------------------------------------------- utilidades */

describe("normalizar / hash / jaccard", () => {
  it("normaliza caixa, espaços e pontuação final", () => {
    expect(normalizar("  Prefiro   RESPOSTAS curtas.  ")).toBe("prefiro respostas curtas");
    expect(normalizar(null)).toBe("");
  });

  it("hash do mesmo conteúdo normalizado é igual", async () => {
    const a = await hashConteudo("Prefiro respostas curtas.");
    const b = await hashConteudo("  prefiro   respostas curtas  ");
    const c = await hashConteudo("Prefiro respostas longas.");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("jaccard mede semelhança por tokens e ignora palavras vazias", () => {
    expect(jaccard("prefiro respostas curtas", "prefiro respostas curtas")).toBe(1);
    expect(jaccard("prefiro respostas curtas", "odeio reuniões longas")).toBe(0);
    const meio = jaccard("prefiro respostas curtas e diretas", "prefiro respostas curtas");
    expect(meio).toBeGreaterThan(0.6);
    expect(meio).toBeLessThan(1);
  });

  it("limpar mantém a caixa e corta no limite", () => {
    expect(limpar("  Meu   Projeto  é ótimo ")).toBe("Meu Projeto é ótimo");
    expect(limpar("abcdefghij", 4)).toBe("abcd");
  });

  it("estimarTokens usa ~4 caracteres por token", () => {
    expect(estimarTokens("")).toBe(0);
    expect(estimarTokens("abcd")).toBe(1);
    expect(estimarTokens("a".repeat(400))).toBe(100);
  });
});

/* ------------------------------------------------------------ classificação */

describe("classificar", () => {
  it("reconhece preferência", () => {
    const c = classificar("Prefiro respostas diretas, sem introdução.");
    expect(c.tipo).toBe("preferencia");
    expect(c.importancia).toBeGreaterThanOrEqual(3);
    expect(c.resumo).toBe("Prefiro respostas diretas, sem introdução.");
  });

  it("reconhece decisão", () => {
    expect(classificar("Decidimos usar Postgres com pgvector.").tipo).toBe("decisao");
  });

  it("reconhece instrução", () => {
    expect(classificar("Sempre responda em português do Brasil.").tipo).toBe("instrucao");
    expect(classificar("Nunca use emoji nas respostas.").tipo).toBe("instrucao");
  });

  it("reconhece objetivo, tarefa, configuração e configuração de projeto", () => {
    expect(classificar("Meu objetivo é chegar a 10 mil usuários.").tipo).toBe("objetivo");
    expect(classificar("Preciso revisar o login até sexta.").tipo).toBe("tarefa");
    expect(classificar("Configure o modelo padrão como gpt-4o-mini.").tipo).toBe("configuracao");
    expect(classificar("O projeto Skynet usa Supabase.").tipo).toBe("projeto");
  });

  it("extrai o nome do projeto citado", () => {
    expect(classificar("Meu projeto Skynet Chat usa React.").projeto).toMatch(/skynet/i);
    expect(classificar("No projeto Atlas, o banco é Postgres.").projeto).toMatch(/atlas/i);
  });

  it("cai em 'fato' quando não há regra melhor e devolve tipo válido", () => {
    const c = classificar("Moro em São Paulo desde 2019.");
    expect(c.tipo).toBe("fato");
    expect(TIPOS).toContain(c.tipo);
    expect(c.projeto).toBeNull();
  });

  it("importância fica sempre entre 1 e 5", () => {
    for (const t of [
      "Ok.",
      "Sempre use vírgula antes de 'mas', é importante e obrigatório.",
      "Decidimos no projeto Atlas que o modelo é X.",
    ]) {
      const i = classificar(t).importancia;
      expect(i).toBeGreaterThanOrEqual(1);
      expect(i).toBeLessThanOrEqual(5);
    }
  });
});

/* ---------------------------------------------------------------- extração */

describe("extrairCandidatos", () => {
  it("pega 'lembre que' e limpa o gatilho", () => {
    const { candidatos } = extrairCandidatos("Lembre que eu prefiro reuniões curtas.");
    expect(candidatos.length).toBe(1);
    expect(candidatos[0].conteudo).toBe("Eu prefiro reuniões curtas");
    expect(candidatos[0].gatilho).toBe("lembre");
  });

  it("pega projeto, 'sempre', 'prefiro' e 'decidimos'", () => {
    const texto = [
      "Meu projeto Atlas é um CRM para clínicas.",
      "Sempre responda em português.",
      "Prefiro tabelas a listas longas.",
      "Decidimos usar Postgres no backend.",
    ].join(" ");
    const { candidatos } = extrairCandidatos(texto);
    const gatilhos = candidatos.map((c) => c.gatilho);
    expect(gatilhos).toContain("projeto");
    expect(gatilhos).toContain("regra");
    expect(gatilhos).toContain("preferencia");
    expect(gatilhos).toContain("decisao");
    expect(candidatos.length).toBeGreaterThanOrEqual(4);
  });

  it("ignora pergunta e frase sem gatilho", () => {
    expect(extrairCandidatos("Você lembra que eu prefiro café?").candidatos).toHaveLength(0);
    expect(extrairCandidatos("Qual é a capital da França?").candidatos).toHaveLength(0);
    expect(extrairCandidatos("").candidatos).toHaveLength(0);
  });

  it("NUNCA devolve candidato sensível — manda para 'sensiveis'", () => {
    const r = extrairCandidatos("Lembre que minha senha é hunter2supersecreta");
    expect(r.candidatos).toHaveLength(0);
    expect(r.sensiveis).toHaveLength(1);
    expect(r.sensiveis[0].motivos).toContain("senha");
    expect(r.sensiveis[0].conteudo).not.toContain("hunter2supersecreta");
  });

  it("deduplica frases repetidas e respeita o teto de 6", () => {
    const repetido = "Prefiro respostas curtas. ".repeat(3);
    expect(extrairCandidatos(repetido).candidatos).toHaveLength(1);
    const muitas = Array.from({ length: 12 }, (_, i) => `Sempre use o padrão número ${i} aqui.`).join(" ");
    expect(extrairCandidatos(muitas).candidatos.length).toBeLessThanOrEqual(6);
  });
});

/* ------------------------------------------------------------------ contexto */

describe("montarContexto", () => {
  const itens = [
    { id: "1", tipo: "preferencia", conteudo: "Prefiro respostas curtas e diretas.", score: 0.4 },
    { id: "2", tipo: "projeto", conteudo: "O projeto Skynet usa Supabase, React e Deno.", projeto: "skynet", score: 0.9 },
    { id: "3", tipo: "decisao", conteudo: "Decidimos usar pgvector para busca semântica.", score: 0.7 },
  ];

  it("ordena por score e formata o bloco", () => {
    const bloco = montarContexto(itens, 600);
    expect(bloco.startsWith("MEMÓRIA RELEVANTE")).toBe(true);
    const posSkynet = bloco.indexOf("Skynet");
    const posPref = bloco.indexOf("Prefiro");
    expect(posSkynet).toBeGreaterThan(-1);
    expect(posSkynet).toBeLessThan(posPref); // score maior primeiro
    expect(bloco).toContain("[skynet]");
    expect(bloco.split("\n").length).toBe(4); // cabeçalho + 3 linhas
  });

  it("respeita o orçamento de tokens", () => {
    const grande = Array.from({ length: 30 }, (_, i) => ({
      id: String(i),
      tipo: "fato",
      conteudo: `Fato número ${i} com bastante texto para ocupar espaço no prompt.`,
      score: 1 - i / 100,
    }));
    for (const orcamento of [60, 120, 300]) {
      const bloco = montarContexto(grande, orcamento);
      expect(estimarTokens(bloco)).toBeLessThanOrEqual(orcamento);
    }
  });

  it("devolve vazio sem itens, com orçamento zero ou sem conteúdo", () => {
    expect(montarContexto([], 600)).toBe("");
    expect(montarContexto(itens, 0)).toBe("");
    expect(montarContexto([{ conteudo: "   " }], 600)).toBe("");
  });

  it("corta uma linha gigante em vez de estourar o orçamento", () => {
    const bloco = montarContexto([{ tipo: "fato", conteudo: "x".repeat(5000), score: 1 }], 50);
    expect(estimarTokens(bloco)).toBeLessThanOrEqual(50);
  });
});

/* -------------------------------------------------------------- deduplicação */

describe("deduplicar", () => {
  const existentes = [
    { id: "a", conteudo: "Prefiro respostas curtas e diretas", tipo: "preferencia", projeto: null, hash_conteudo: "h1" },
    { id: "b", conteudo: "O projeto Skynet usa Supabase", tipo: "projeto", projeto: "skynet", hash_conteudo: "h2" },
    { id: "c", conteudo: "Sempre responda em português", tipo: "instrucao", projeto: null, hash_conteudo: "h3" },
  ];

  it("deduplica por hash igual", () => {
    const r = deduplicar(
      { conteudo: "PREFIRO respostas curtas e diretas!", tipo: "preferencia", hash_conteudo: "h1" },
      existentes,
    );
    expect(r.acao).toBe("atualizar");
    expect(r.motivo).toBe("hash");
    expect(r.alvo.id).toBe("a");
  });

  it("deduplica por Jaccard >= 0.85 mesmo com hash diferente", () => {
    const r = deduplicar(
      { conteudo: "prefiro respostas curtas e bem diretas", tipo: "preferencia", hash_conteudo: "outro" },
      existentes,
    );
    expect(r.acao).toBe("atualizar");
    expect(r.motivo).toBe("jaccard");
    expect(r.alvo.id).toBe("a");
    expect(r.similaridade).toBeGreaterThanOrEqual(0.85);
  });

  it("cria novo quando o assunto é outro", () => {
    const r = deduplicar({ conteudo: "Prefiro café sem açúcar", tipo: "preferencia", hash_conteudo: "z" }, existentes);
    // mesmo tipo, Jaccard baixo e sem marca de mudança => pode criar
    expect(r.acao).toBe("criar");
    expect(r.substitui).toBeNull();
  });

  it("marca substituição quando o novo contradiz o antigo do mesmo tipo/projeto", () => {
    const r = deduplicar(
      { conteudo: "Na verdade agora prefiro respostas longas e detalhadas", tipo: "preferencia", hash_conteudo: "n1" },
      existentes,
    );
    expect(r.acao).toBe("criar");
    expect(r.motivo).toBe("substituicao");
    expect(r.substitui).toBe("a");
  });

  it("não substitui entre tipos diferentes", () => {
    const r = deduplicar(
      { conteudo: "Sempre use o padrão de vírgula britânico", tipo: "instrucao", hash_conteudo: "n2" },
      existentes,
    );
    expect(r.substitui).toBeNull();
  });

  it("funciona com lista vazia", () => {
    const r = deduplicar({ conteudo: "Qualquer coisa nova aqui", tipo: "fato" }, []);
    expect(r).toMatchObject({ acao: "criar", alvo: null, substitui: null });
  });
});

/* --------------------------------------------------------------------- resumo */

describe("resumirConversa", () => {
  const conversa = [
    { role: "user", content: "Oi, meu projeto Atlas é um CRM para clínicas." },
    { role: "assistant", content: "Entendi, um CRM. Como posso ajudar?" },
    { role: "user", content: "Prefiro telas simples e sem menu lateral." },
    { role: "assistant", content: "Certo." },
    { role: "user", content: "Preciso do relatório até sexta." },
  ];

  it("resume sem LLM, citando abertura e pontos", () => {
    const r = resumirConversa(conversa, 800);
    expect(r).toContain("Abertura:");
    expect(r).toContain("Atlas");
    expect(r).toContain("Pontos:");
    expect(r).toContain("5 mensagens");
  });

  it("respeita o limite de caracteres", () => {
    const r = resumirConversa(conversa, 120);
    expect(r.length).toBeLessThanOrEqual(120);
  });

  it("devolve vazio para conversa vazia", () => {
    expect(resumirConversa([], 800)).toBe("");
    expect(resumirConversa([{ role: "user", content: "  " }], 800)).toBe("");
  });

  it("extrai tópicos frequentes", () => {
    const t = extrairTopicos("Supabase supabase React projeto projeto projeto Deno", 3);
    expect(t[0]).toBe("projeto");
    expect(t).toContain("supabase");
    expect(t.length).toBeLessThanOrEqual(3);
  });
});
