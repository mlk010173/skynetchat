// Edge Function: skills — biblioteca de habilidades do SKYNET
// Cada habilidade é um pacote de funções puras (ou de uma chamada HTTP pública).
// GET  /functions/v1/skills            -> catálogo (sem código)
// GET  /functions/v1/skills?pacote=..  -> catálogo filtrado
// POST /functions/v1/skills {skill,args|texto} -> executa a habilidade pedida
// POST /functions/v1/skills {texto}            -> descobre a habilidade pelo texto

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

type Args = Record<string, any>;
interface Habilidade {
  id: string;
  nome: string;
  pacote: string;
  descricao: string;
  exemplo: string;
  chaves: string[];
  rodar: (texto: string, args: Args) => unknown;
}

const norm = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();
const num = (s: string | undefined) => {
  const v = String(s ?? "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};
const lista = (texto: string) => {
  const m = texto.match(/-?\d+(?:[.,]\d+)?/g) ?? [];
  return m.map((x) => num(x)).filter((n) => Number.isFinite(n));
};
const brl = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 6 });
const falha = (msg: string) => ({ ok: false, erro: msg });
const ok = (resultado: unknown, detalhe?: string) => ({ ok: true, resultado, detalhe });

async function pegar(url: string, ms = 12000) {
  const r = await fetch(url, { signal: AbortSignal.timeout(ms), headers: { "user-agent": "SKYNET-skills" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r;
}

const MOEDAS: Record<string, string> = {
  "dolar": "USD", "dólar": "USD", "usd": "USD", "real": "BRL", "brl": "BRL", "euro": "EUR", "eur": "EUR",
  "libra": "GBP", "gbp": "GBP", "iene": "JPY", "jpy": "JPY", "peso": "ARS", "ars": "ARS",
  "bitcoin": "BTC", "btc": "BTC", "ether": "ETH", "eth": "ETH", "yuan": "CNY", "cny": "CNY",
};

const HABILIDADES: Habilidade[] = [
  // ---------------------------------------------------------------- cálculo
  {
    id: "calcular", nome: "Calcular expressão", pacote: "calculo",
    descricao: "Resolve contas com + - * / % ** e parênteses.",
    exemplo: "calcule 12*(3+4)/2", chaves: ["^(calcule|calcula|quanto (é|e)|resolva)\\b"],
    rodar: (texto) => {
      const expr = (texto.match(/(?:calcule|calcula|resolva|quanto (?:é|e))\s*:?\s*(.+)$/i)?.[1] ?? texto)
        .replace(/[^0-9+\-*/%().,\s^]/g, "").replace(/\^/g, "**").replace(/,/g, ".").trim();
      if (!expr) return falha("não achei a conta no pedido");
      if (!/^[\d\s+\-*/%().]+$/.test(expr)) return falha("expressão com caracteres inválidos");
      // eslint-disable-next-line no-new-func
      const valor = Function(`"use strict";return (${expr})`)();
      return ok(valor, `${expr} = ${valor}`);
    },
  },
  {
    id: "porcentagem", nome: "Porcentagem", pacote: "calculo",
    descricao: "Calcula X% de Y, aumento, desconto e quanto um valor representa de outro.",
    exemplo: "20% de 350", chaves: ["%", "por cento", "porcento", "\\d+\\s*%"],
    rodar: (texto) => {
      const n = lista(texto);
      const m = texto.match(/(\d+(?:[.,]\d+)?)\s*%\s*(?:de|do|da)\s*(\d+(?:[.,]\d+)?)/i);
      if (m) {
        const p = num(m[1]), base = num(m[2]);
        const parte = (p / 100) * base;
        return ok({ percentual: p, base, valor: parte }, `${p}% de ${brl(base)} = ${brl(parte)}`);
      }
      const pct = texto.match(/(\d+(?:[.,]\d+)?)\s*%\s*(?:de )?(?:aumento|mais|acrescimo|acréscimo)/i);
      if (pct && n.length >= 2) {
        const p = num(pct[1]), base = n[n.length - 1];
        return ok({ base, percentual: p, comAumento: base * (1 + p / 100) }, `${brl(base)} + ${p}% = ${brl(base * (1 + p / 100))}`);
      }
      if (n.length >= 2) {
        const [a, b] = n;
        return ok({ a, b, aDeB: (a / b) * 100 }, `${brl(a)} é ${brl((a / b) * 100)}% de ${brl(b)}`);
      }
      return falha("preciso de dois números (ex.: 20% de 350)");
    },
  },
  {
    id: "regra_de_tres", nome: "Regra de três", pacote: "calculo",
    descricao: "Resolve proporção a/b = c/x.",
    exemplo: "regra de três 2 está para 8 assim como 5 está para", chaves: ["regra de (tr[eê]s|3)", "propor[cç][aã]o"],
    rodar: (texto) => {
      const n = lista(texto);
      if (n.length < 3) return falha("informe três valores (ex.: 2, 8, 5)");
      const [a, b, c] = n;
      const x = (b * c) / a;
      return ok({ a, b, c, x }, `${a}/${b} = ${c}/${brl(x)} → x = ${brl(x)}`);
    },
  },
  {
    id: "juros_compostos", nome: "Juros compostos", pacote: "calculo",
    descricao: "Montante final com aporte inicial, taxa mensal e meses.",
    exemplo: "juros compostos 1000 a 1% ao mês por 12 meses", chaves: ["juros compostos", "montante", "investimento rende", "\\bjuros\\b", "rendimento", "\\d+(?:[.,]\\d+)?\\s*%[^.]{0,40}?(?:m[êe]s|meses|ano)"],
    rodar: (texto) => {
      const n = lista(texto);
      const pct = texto.match(/(\d+(?:[.,]\d+)?)\s*%/);
      const meses = texto.match(/(\d+)\s*(mes|meses|mês|mês|m)/i);
      if (n.length < 1 || !pct) return falha("preciso do valor inicial e da taxa (ex.: 1000 a 1% ao mês por 12 meses)");
      const taxaPct = num(pct[1]);
      const periodos = meses ? num(meses[1]) : 12;
      const candidatos = n.filter((v) => v !== taxaPct && v !== periodos);
      const principal = (candidatos.length ? Math.max(...candidatos) : n[0]);
      const taxa = taxaPct / 100;
      const montante = principal * Math.pow(1 + taxa, periodos);
      return ok(
        { principal, taxaMensal: taxa, periodos, montante, juros: montante - principal },
        `${brl(principal)} a ${brl(taxa * 100)}%/mês por ${periodos} meses = ${brl(montante)} (juros ${brl(montante - principal)})`,
      );
    },
  },
  {
    id: "estatistica", nome: "Estatística de uma lista", pacote: "calculo",
    descricao: "Média, mediana, mínimo, máximo, soma e desvio padrão de vários números.",
    exemplo: "média de 4, 8, 15, 16, 23, 42", chaves: ["m[eé]dia", "mediana", "desvio padr", "estat[ií]stica"],
    rodar: (texto) => {
      const n = lista(texto);
      if (!n.length) return falha("não achei números na mensagem");
      const soma = n.reduce((a, b) => a + b, 0);
      const media = soma / n.length;
      const ord = [...n].sort((a, b) => a - b);
      const meio = Math.floor(ord.length / 2);
      const mediana = ord.length % 2 ? ord[meio] : (ord[meio - 1] + ord[meio]) / 2;
      const variancia = n.reduce((a, b) => a + (b - media) ** 2, 0) / n.length;
      return ok(
        { quantidade: n.length, soma, media, mediana, minimo: ord[0], maximo: ord[ord.length - 1], desvioPadrao: Math.sqrt(variancia) },
        `média ${brl(media)} · mediana ${brl(mediana)} · min ${brl(ord[0])} · máx ${brl(ord[ord.length - 1])} · desvio ${brl(Math.sqrt(variancia))}`,
      );
    },
  },
  {
    id: "raiz_potencia", nome: "Raiz e potência", pacote: "calculo",
    descricao: "Raiz quadrada, cúbica ou potência de um número.",
    exemplo: "raiz quadrada de 144", chaves: ["raiz quadrada", "raiz c[uú]bica", "elevado a", "pot[eê]ncia"],
    rodar: (texto) => {
      const n = lista(texto);
      if (!n.length) return falha("informe o número");
      const v = n[0];
      if (/c[uú]bica/i.test(texto)) return ok(Math.cbrt(v), `raiz cúbica de ${v} = ${brl(Math.cbrt(v))}`);
      const exp = texto.match(/elevado a\s*(-?\d+(?:[.,]\d+)?)/i);
      if (exp) {
        const e = num(exp[1]);
        return ok(Math.pow(v, e), `${v} elevado a ${e} = ${brl(Math.pow(v, e))}`);
      }
      return ok(Math.sqrt(v), `raiz quadrada de ${v} = ${brl(Math.sqrt(v))}`);
    },
  },
  {
    id: "fatorial", nome: "Fatorial", pacote: "calculo",
    descricao: "Fatorial de um inteiro (até 170).",
    exemplo: "fatorial de 6", chaves: ["fatorial"],
    rodar: (texto) => {
      const n = lista(texto)[0];
      if (!Number.isFinite(n) || n < 0 || n > 170) return falha("informe um inteiro entre 0 e 170");
      let r = 1;
      for (let i = 2; i <= Math.floor(n); i++) r *= i;
      return ok(r, `${Math.floor(n)}! = ${brl(r)}`);
    },
  },
  {
    id: "primo", nome: "Número primo", pacote: "calculo",
    descricao: "Diz se um número é primo e lista os primos até ele.",
    exemplo: "37 é primo?", chaves: ["primo"],
    rodar: (texto) => {
      const n = Math.floor(lista(texto)[0] ?? NaN);
      if (!Number.isFinite(n)) return falha("informe um número");
      if (n < 2) return ok({ n, primo: false }, `${n} não é primo`);
      let primo = true;
      for (let i = 2; i * i <= n; i++) if (n % i === 0) { primo = false; break; }
      const ate = [];
      for (let i = 2; i <= Math.min(n, 200); i++) {
        let p = true;
        for (let j = 2; j * j <= i; j++) if (i % j === 0) { p = false; break; }
        if (p) ate.push(i);
      }
      return ok({ n, primo, primosAte: ate }, `${n} ${primo ? "é primo" : "não é primo"} · ${ate.length} primos até ${Math.min(n, 200)}`);
    },
  },
  {
    id: "mdc_mmc", nome: "MDC e MMC", pacote: "calculo",
    descricao: "Máximo divisor comum e mínimo múltiplo comum entre números.",
    exemplo: "mmc de 12 e 18", chaves: ["mdc", "mmc", "m[aá]ximo divisor", "m[ií]nimo m[uú]ltiplo"],
    rodar: (texto) => {
      const n = lista(texto).map((x) => Math.floor(Math.abs(x)));
      if (n.length < 2) return falha("informe pelo menos dois números");
      const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
      const mdc = n.reduce((a, b) => gcd(a, b));
      const mmc = n.reduce((a, b) => (a * b) / gcd(a, b));
      return ok({ numeros: n, mdc, mmc }, `mdc ${mdc} · mmc ${mmc}`);
    },
  },
  {
    id: "fibonacci", nome: "Fibonacci", pacote: "calculo",
    descricao: "Sequência de Fibonacci com N termos.",
    exemplo: "fibonacci 10 termos", chaves: ["fibonacci"],
    rodar: (texto) => {
      const q = Math.min(Math.floor(lista(texto)[0] ?? 10), 60);
      const seq = [0, 1];
      while (seq.length < q) seq.push(seq[seq.length - 1] + seq[seq.length - 2]);
      const out = seq.slice(0, q);
      return ok(out, out.join(", "));
    },
  },

  // ------------------------------------------------------------------ texto
  {
    id: "contar_palavras", nome: "Contar palavras", pacote: "texto",
    descricao: "Conta palavras, caracteres e parágrafos de um texto.",
    exemplo: "conte as palavras: a rápida raposa marrom pula", chaves: ["contar palavras", "quantas palavras", "contar caracteres", "quantos caracteres"],
    rodar: (texto) => {
      const corpo = norm(texto.replace(/^.*?[:：]\s*/s, "") || texto);
      const palavras = corpo.split(/\s+/).filter(Boolean);
      return ok(
        { palavras: palavras.length, caracteres: corpo.length, semEspacos: corpo.replace(/\s/g, "").length },
        `${palavras.length} palavras · ${corpo.length} caracteres`,
      );
    },
  },
  {
    id: "inverter_texto", nome: "Inverter texto", pacote: "texto",
    descricao: "Inverte a ordem dos caracteres.",
    exemplo: "inverta: skynet", chaves: ["invert(a|er) (o )?texto", "de tr[aá]s para frente"],
    rodar: (texto) => {
      const corpo = norm(texto.replace(/^.*?[:：]\s*/s, "") || texto);
      const inv = [...corpo].reverse().join("");
      return ok(inv, inv);
    },
  },
  {
    id: "caixa_alta", nome: "Maiúsculas e minúsculas", pacote: "texto",
    descricao: "Converte para MAIÚSCULAS, minúsculas ou Título.",
    exemplo: "deixe em maiúsculas: skynet chat", chaves: ["mai[uú]scul", "min[uú]scul", "title case", "primeira letra"],
    rodar: (texto) => {
      const corpo = norm(texto.replace(/^.*?[:：]\s*/s, "") || texto);
      if (/min[uú]scul/i.test(texto)) return ok(corpo.toLowerCase(), corpo.toLowerCase());
      if (/title case|primeira letra/i.test(texto)) {
        const t = corpo.toLowerCase().replace(/(^|\s)\p{L}/gu, (m) => m.toUpperCase());
        return ok(t, t);
      }
      return ok(corpo.toUpperCase(), corpo.toUpperCase());
    },
  },
  {
    id: "slug", nome: "Slug para URL", pacote: "texto",
    descricao: "Transforma um título em slug amigável.",
    exemplo: "slug: Inteligência Operacional ao Vivo", chaves: ["slug", "url amig[aá]vel", "permalink"],
    rodar: (texto) => {
      const corpo = norm(texto.replace(/^.*?[:：]\s*/s, "") || texto);
      const s = corpo.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
        .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      return ok(s, s);
    },
  },
  {
    id: "sem_acento", nome: "Remover acentos", pacote: "texto",
    descricao: "Tira acentos mantendo o resto do texto.",
    exemplo: "sem acento: ação, coração, linguiça", chaves: ["sem acento", "remover acento", "tirar acento"],
    rodar: (texto) => {
      const corpo = norm(texto.replace(/^.*?[:：]\s*/s, "") || texto);
      const s = corpo.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return ok(s, s);
    },
  },
  {
    id: "base64", nome: "Base64", pacote: "texto",
    descricao: "Codifica ou decodifica texto em base64.",
    exemplo: "base64 de skynet", chaves: ["base64"],
    rodar: (texto) => {
      const corpo = norm(texto.replace(/^.*?(?:[:：]|de|do)\s*/i, "") || texto);
      if (/decodific|descodific|decode|desfazer/i.test(texto)) {
        try {
          const s = new TextDecoder().decode(Uint8Array.from(atob(corpo), (c) => c.charCodeAt(0)));
          return ok(s, s);
        } catch { return falha("isso não parece base64 válido"); }
      }
      const bytes = new TextEncoder().encode(corpo);
      let bin = "";
      for (const byte of bytes) bin += String.fromCharCode(byte);
      const b = btoa(bin);
      return ok(b, b);
    },
  },
  {
    id: "hash_sha256", nome: "Hash SHA-256", pacote: "texto",
    descricao: "Gera o hash SHA-256 de um texto.",
    exemplo: "sha256 de skynet", chaves: ["sha-?256", "hash"],
    rodar: async (texto) => {
      const corpo = norm(texto.replace(/^.*?(?:[:：]|de)\s*/i, "") || texto);
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(corpo));
      const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
      return ok(hex, hex);
    },
  },
  {
    id: "gerar_uuid", nome: "Gerar UUID", pacote: "texto",
    descricao: "Cria identificadores únicos (1 a 20).",
    exemplo: "gere 3 uuid", chaves: ["uuid", "guid", "identificador [uú]nico"],
    rodar: (texto) => {
      const q = Math.min(Math.max(Math.floor(lista(texto)[0] ?? 1), 1), 20);
      const ids = Array.from({ length: q }, () => crypto.randomUUID());
      return ok(ids, ids.join("\n"));
    },
  },
  {
    id: "extrair", nome: "Extrair dados do texto", pacote: "texto",
    descricao: "Separa e-mails, links, números ou telefones de um texto.",
    exemplo: "extraia os e-mails de joao@skynet.com e ana@base44.com", chaves: ["extrair? (e-?mails?|links?|urls?|n[uú]meros|telefones)", "pegue os links"],
    rodar: (texto) => {
      const emails = texto.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? [];
      const links = texto.match(/https?:\/\/[^\s)]+/g) ?? [];
      const telefones = texto.match(/\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}/g) ?? [];
      const numeros = lista(texto);
      return ok({ emails, links, telefones, numeros }, `${emails.length} e-mail(s), ${links.length} link(s), ${telefones.length} telefone(s)`);
    },
  },
  {
    id: "repetir", nome: "Repetir e truncar", pacote: "texto",
    descricao: "Repete um texto N vezes ou corta em N caracteres.",
    exemplo: "repita 3 vezes: sky", chaves: ["repita", "repetir", "truncar", "cortar o texto"],
    rodar: (texto) => {
      const q = Math.min(Math.floor(lista(texto)[0] ?? 2), 50);
      const corpo = norm(texto.replace(/^.*?[:：]\s*/s, "").replace(/^\d+\s*(vezes|x)\s*/i, "") || texto);
      if (/truncar|cortar/i.test(texto)) {
        const t = corpo.slice(0, q);
        return ok(t, `${t}… (${t.length} caracteres)`);
      }
      const r = Array.from({ length: q }, () => corpo).join(" ");
      return ok(r, r.slice(0, 200));
    },
  },

  // -------------------------------------------------------------- conversão
  {
    id: "converter_unidade", nome: "Converter unidades", pacote: "conversao",
    descricao: "Comprimento, massa, volume e velocidade (km, mi, m, cm, kg, lb, L, gal).",
    exemplo: "10 km em milhas",
    chaves: [
      "\\d+[\\d.,]*\\s*(?:km|kg|g|mg|cm|mm|m|l|ml|mi|lb|ft|in|gal)(?:\\/h|\\/s)?\\s*(?:em|para|pra|->|→)\\s*(?:km|kg|g|mg|cm|mm|m|l|ml|mi|lb|ft|in|gal)",
      "converter?\\s+(?:comprimento|massa|volume|velocidade|unidade)",
      "milhas?", "libras?", "polegadas?", "gal[oõ]es",
    ],
    rodar: (texto) => {
      const n = lista(texto)[0];
      const u = texto.toLowerCase();
      const t = (a: number, b: number, rotulo: string) => ok(a * b, `${brl(a)} ${rotulo.split("→")[0].trim()} = ${brl(a * b)} ${rotulo.split("→")[1].trim()}`);
      if (!Number.isFinite(n)) return falha("informe o valor (ex.: 10 km em milhas)");
      if (/km/.test(u) && /milha|mi\b/.test(u)) return t(n, 0.621371, "km → mi");
      if (/milha|mi\b/.test(u) && /km/.test(u)) return t(n, 1.60934, "mi → km");
      if (/kg|quilo/.test(u) && /libras?|lb/.test(u)) return t(n, 2.20462, "kg → lb");
      if (/libras?|lb/.test(u) && /kg|quilo/.test(u)) return t(n, 0.453592, "lb → kg");
      if (/metros?|m\b/.test(u) && /p[eé]s|ft/.test(u)) return t(n, 3.28084, "m → ft");
      if (/p[eé]s|ft/.test(u) && /metros?/.test(u)) return t(n, 0.3048, "ft → m");
      if (/litros?|l\b/.test(u) && /gal/.test(u)) return t(n, 0.264172, "L → gal");
      if (/gal/.test(u) && /litros?|l\b/.test(u)) return t(n, 3.78541, "gal → L");
      if (/cm/.test(u) && /polegada|in\b/.test(u)) return t(n, 0.393701, "cm → in");
      if (/polegada|in\b/.test(u) && /cm/.test(u)) return t(n, 2.54, "in → cm");
      if (/km\/h/.test(u) && /m\/s/.test(u)) return t(n, 0.277778, "km/h → m/s");
      if (/m\/s/.test(u) && /km\/h/.test(u)) return t(n, 3.6, "m/s → km/h");
      return falha("não identifiquei as duas unidades (ex.: 10 km em milhas)");
    },
  },
  {
    id: "temperatura", nome: "Converter temperatura", pacote: "conversao",
    descricao: "Celsius, Fahrenheit e Kelvin.",
    exemplo: "30 celsius em fahrenheit", chaves: ["celsius", "fahrenheit", "kelvin", "°c", "°f"],
    rodar: (texto) => {
      const n = lista(texto)[0];
      const u = texto.toLowerCase();
      if (!Number.isFinite(n)) return falha("informe a temperatura (ex.: 30 celsius em fahrenheit)");
      const posC = u.search(/celsius|°c/);
      const posF = u.search(/fahrenheit|°f/);
      const posK = u.search(/kelvin/);
      // quando as duas aparecem, a primeira é a unidade de origem
      if (posF >= 0 && posC >= 0 && posC < posF) {
        const f = (n * 9) / 5 + 32;
        return ok(f, `${brl(n)}°C = ${brl(f)}°F`);
      }
      if (posK >= 0 && posC >= 0 && posC < posK) return ok(n + 273.15, `${brl(n)}°C = ${brl(n + 273.15)}K`);
      if (posK >= 0 && posC >= 0 && posK < posC) return ok(n - 273.15, `${brl(n)}K = ${brl(n - 273.15)}°C`);
      if (/fahrenheit|°f/.test(u) && /celsius|°c/.test(u)) {
        const c = ((n - 32) * 5) / 9;
        return ok(c, `${brl(n)}°F = ${brl(c)}°C`);
      }
      if (/kelvin/.test(u) && /celsius|°c/.test(u)) return ok(n - 273.15, `${brl(n)}K = ${brl(n - 273.15)}°C`);
      if (/celsius|°c/.test(u) && /kelvin/.test(u)) return ok(n + 273.15, `${brl(n)}°C = ${brl(n + 273.15)}K`);
      const f = (n * 9) / 5 + 32;
      return ok(f, `${brl(n)}°C = ${brl(f)}°F`);
    },
  },
  {
    id: "formatar_bytes", nome: "Formatar bytes", pacote: "conversao",
    descricao: "Converte bytes em KB, MB, GB legíveis e vice-versa.",
    exemplo: "formatar 1572864 bytes", chaves: ["bytes", "kb", "mb", "gb", "tamanho do arquivo"],
    rodar: (texto) => {
      const n = lista(texto)[0];
      if (!Number.isFinite(n)) return falha("informe o valor em bytes");
      const u = ["B", "KB", "MB", "GB", "TB"];
      let v = n, i = 0;
      while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
      const s = `${v.toFixed(2)} ${u[i]}`;
      return ok({ bytes: n, legivel: s }, `${brl(n)} bytes = ${s}`);
    },
  },
  {
    id: "formatar_tempo", nome: "Formatar duração", pacote: "conversao",
    descricao: "Segundos em dias, horas, minutos e segundos.",
    exemplo: "formatar 93600 segundos", chaves: ["segundos", "dura[cç][aã]o", "quantas horas", "quantos minutos"],
    rodar: (texto) => {
      const n = lista(texto)[0];
      if (!Number.isFinite(n)) return falha("informe os segundos");
      const d = Math.floor(n / 86400), h = Math.floor((n % 86400) / 3600), m = Math.floor((n % 3600) / 60), s = Math.floor(n % 60);
      const partes = [d ? `${d}d` : "", h ? `${h}h` : "", m ? `${m}min` : "", `${s}s`].filter(Boolean);
      return ok({ dias: d, horas: h, minutos: m, segundos: s }, partes.join(" "));
    },
  },
  {
    id: "numero_extenso", nome: "Número por extenso", pacote: "conversao",
    descricao: "Escreve inteiros de 0 a 999.999.999 por extenso em português.",
    exemplo: "por extenso 2026", chaves: ["por extenso", "escreva o n[uú]mero"],
    rodar: (texto) => {
      const n = Math.floor(lista(texto)[0] ?? NaN);
      if (!Number.isFinite(n) || Math.abs(n) > 999999999) return falha("informe um inteiro até 999.999.999");
      const U = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
      const D = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
      const C = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];
      const ate999 = (v: number): string => {
        if (v === 0) return "";
        if (v === 100) return "cem";
        const c = Math.floor(v / 100), r = v % 100;
        const partes: string[] = [];
        if (c) partes.push(C[c]);
        if (r < 20 && r > 0) partes.push(U[r]);
        else if (r >= 20) {
          const dd = Math.floor(r / 10), uu = r % 10;
          partes.push(uu ? `${D[dd]} e ${U[uu]}` : D[dd]);
        }
        return partes.join(" e ");
      };
      const sinal = n < 0 ? "menos " : "";
      let v = Math.abs(n);
      const partes: string[] = [];
      const milhoes = Math.floor(v / 1e6);
      if (milhoes) { partes.push(`${ate999(milhoes)} ${milhoes === 1 ? "milhão" : "milhões"}`); v %= 1e6; }
      const milhares = Math.floor(v / 1000);
      if (milhares) { partes.push(`${milhares === 1 ? "" : `${ate999(milhares)} `}mil`.trim()); v %= 1000; }
      if (v) partes.push(ate999(v));
      const s = sinal + (partes.join(" e ") || "zero");
      return ok(s, s);
    },
  },
  {
    id: "romanos", nome: "Números romanos", pacote: "conversao",
    descricao: "Converte arábico ↔ romano.",
    exemplo: "2026 em romano", chaves: ["romano", "romanos"],
    rodar: (texto) => {
      if (/[ivxlcdm]{2,}/i.test(texto) && !/\d/.test(texto)) {
        const map: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
        const s = (texto.match(/[ivxlcdm]+/i)?.[0] ?? "").toLowerCase();
        let total = 0;
        for (let i = 0; i < s.length; i++) {
          const a = map[s[i]], b = map[s[i + 1]] ?? 0;
          total += a < b ? -a : a;
        }
        return ok(total, `${s.toUpperCase()} = ${total}`);
      }
      let n = Math.floor(lista(texto)[0] ?? NaN);
      if (!Number.isFinite(n) || n <= 0 || n > 3999) return falha("informe um número entre 1 e 3999");
      const tabela: [number, string][] = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
      let r = "";
      for (const [v, s] of tabela) while (n >= v) { r += s; n -= v; }
      return ok(r, r);
    },
  },
  {
    id: "base_numerica", nome: "Binário, octal e hexadecimal", pacote: "conversao",
    descricao: "Converte entre decimal, binário, octal e hexadecimal.",
    exemplo: "255 em binário", chaves: ["bin[aá]rio", "octal", "hexadecimal", "hex"],
    rodar: (texto) => {
      const u = texto.toLowerCase();
      const alvo = /bin/.test(u) ? 2 : /octal/.test(u) ? 8 : /hex/.test(u) ? 16 : 10;
      const bruto = (texto.match(/\b(0x[0-9a-f]+|[01]{3,}|[0-9a-f]{3,})\b/i)?.[0] ?? "").trim();
      let valor = NaN;
      if (/^0x/i.test(bruto)) valor = parseInt(bruto.slice(2), 16);
      else if (/^[01]{3,}$/.test(bruto) && /bin/.test(u)) valor = parseInt(bruto, 2);
      else valor = Number(bruto);
      if (!Number.isFinite(valor)) return falha("informe o número (ex.: 255 em binário)");
      const conv = valor.toString(alvo);
      return ok({ decimal: valor, binario: valor.toString(2), octal: valor.toString(8), hexadecimal: valor.toString(16), resultado: conv },
        `${valor} em base ${alvo} = ${conv}`);
    },
  },

  // ---------------------------------------------------------------- tempo
  {
    id: "agora", nome: "Data e hora agora", pacote: "tempo",
    descricao: "Hora atual em São Paulo, UTC e timestamp.",
    exemplo: "que horas são agora", chaves: ["que horas", "hora agora", "data de hoje", "hoje [eé] que dia"],
    rodar: () => {
      const agora = new Date();
      const sp = agora.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "full", timeStyle: "short" });
      return ok({ saoPaulo: sp, iso: agora.toISOString(), timestamp: agora.getTime() }, sp);
    },
  },
  {
    id: "diferenca_datas", nome: "Diferença entre datas", pacote: "tempo",
    descricao: "Dias, semanas e meses entre duas datas (AAAA-MM-DD ou DD/MM/AAAA).",
    exemplo: "diferença entre 2026-01-01 e 2026-11-04", chaves: ["diferen[cç]a entre datas", "dias entre", "quanto tempo entre"],
    rodar: (texto) => {
      const datas = [...texto.matchAll(/(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})/g)].map((m) => {
        const s = m[1];
        if (s.includes("-")) return new Date(`${s}T12:00:00Z`);
        const [d, mes, a] = s.split("/").map(Number);
        return new Date(Date.UTC(a < 100 ? 2000 + a : a, mes - 1, d, 12));
      });
      if (datas.length < 2) return falha("informe duas datas (ex.: 2026-01-01 e 2026-11-04)");
      const dias = Math.round((datas[1].getTime() - datas[0].getTime()) / 86400000);
      return ok({ dias, semanas: Number((dias / 7).toFixed(2)), meses: Number((dias / 30.44).toFixed(2)), anos: Number((dias / 365.25).toFixed(2)) },
        `${Math.abs(dias)} dias (${(Math.abs(dias) / 7).toFixed(1)} semanas)`);
    },
  },
  {
    id: "somar_dias", nome: "Somar ou subtrair dias", pacote: "tempo",
    descricao: "Data deslocada em N dias a partir de hoje ou de uma data dada.",
    exemplo: "que dia será daqui a 90 dias", chaves: ["daqui a \\d+ dias", "somar \\d+ dias", "at[eé] (o )?dia", "\\d+ dias atr[aá]s"],
    rodar: (texto) => {
      const base = texto.match(/(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})/);
      const n = Math.floor(lista(texto)[0] ?? NaN);
      if (!Number.isFinite(n)) return falha("informe quantos dias");
      const inicio = base ? new Date(base[1].includes("-") ? `${base[1]}T12:00:00Z` : base[1].split("/").reverse().join("-") + "T12:00:00Z") : new Date();
      const sinal = /atr[aá]s|antes/i.test(texto) ? -1 : 1;
      const d = new Date(inicio.getTime() + sinal * n * 86400000);
      const sp = d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "long", year: "numeric" });
      return ok({ data: d.toISOString().slice(0, 10), extenso: sp }, sp);
    },
  },
  {
    id: "dia_da_semana", nome: "Dia da semana", pacote: "tempo",
    descricao: "Descobre o dia da semana de uma data e quantos dias faltam para ela.",
    exemplo: "que dia da semana foi 2026-11-04", chaves: ["dia da semana", "que dia foi", "cai em que dia"],
    rodar: (texto) => {
      const m = texto.match(/(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})/);
      const d = m ? new Date(m[1].includes("-") ? `${m[1]}T12:00:00Z` : `${m[1].split("/").reverse().join("-")}T12:00:00Z`) : new Date();
      const sp = d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" });
      const faltam = Math.round((d.getTime() - Date.now()) / 86400000);
      return ok({ data: d.toISOString().slice(0, 10), extenso: sp, faltamDias: faltam }, `${sp} (${faltam >= 0 ? `faltam ${faltam}` : `${Math.abs(faltam)} dias atrás`})`);
    },
  },
  {
    id: "idade", nome: "Calcular idade", pacote: "tempo",
    descricao: "Idade em anos, meses e dias a partir da data de nascimento.",
    exemplo: "idade de quem nasceu em 1995-06-12", chaves: ["idade", "quantos anos (tem|faz)"],
    rodar: (texto) => {
      const m = texto.match(/(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})/);
      if (!m) return falha("informe a data de nascimento (ex.: 1995-06-12)");
      const nasc = new Date(m[1].includes("-") ? `${m[1]}T12:00:00Z` : `${m[1].split("/").reverse().join("-")}T12:00:00Z`);
      const hoje = new Date();
      let anos = hoje.getUTCFullYear() - nasc.getUTCFullYear();
      let meses = hoje.getUTCMonth() - nasc.getUTCMonth();
      let dias = hoje.getUTCDate() - nasc.getUTCDate();
      if (dias < 0) { meses--; dias += new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 0)).getUTCDate(); }
      if (meses < 0) { anos--; meses += 12; }
      return ok({ anos, meses, dias }, `${anos} anos, ${meses} meses e ${dias} dias`);
    },
  },

  // ------------------------------------------------------------------- dev
  {
    id: "json", nome: "Formatar ou validar JSON", pacote: "dev",
    descricao: "Embeleza, minifica ou valida um JSON.",
    exemplo: "formate o json {\"a\":1,\"b\":[2,3]}", chaves: ["json"],
    rodar: (texto) => {
      const i1 = texto.indexOf("{"), i2 = texto.indexOf("[");
      const ini = i1 < 0 ? i2 : i2 < 0 ? i1 : Math.min(i1, i2);
      if (ini < 0) return falha("cole o JSON que quer validar");
      const bruto = texto.slice(ini).trim();
      try {
        const obj = JSON.parse(bruto);
        if (/minific/i.test(texto)) {
          const s = JSON.stringify(obj);
          return ok(s, `${s.length} caracteres`);
        }
        const belo = JSON.stringify(obj, null, 2);
        return ok(belo, `JSON válido · ${belo.split("\n").length} linhas`);
      } catch (e) {
        return falha(`JSON inválido: ${(e as Error).message.slice(0, 120)}`);
      }
    },
  },
  {
    id: "url_codec", nome: "Codificar URL", pacote: "dev",
    descricao: "Aplica encodeURIComponent ou decodifica.",
    exemplo: "url encode: açaí com leite", chaves: ["url ?encode", "url ?decode", "codificar url", "percent-?encoding"],
    rodar: (texto) => {
      const corpo = norm(texto.replace(/^.*?[:：]\s*/s, "") || texto);
      if (/decode|decodific/i.test(texto)) {
        try { const s = decodeURIComponent(corpo); return ok(s, s); } catch { return falha("sequência de URL inválida"); }
      }
      const s = encodeURIComponent(corpo);
      return ok(s, s);
    },
  },
  {
    id: "regex", nome: "Testar regex", pacote: "dev",
    descricao: "Testa um padrão contra um texto e mostra o que casou.",
    exemplo: "regex \\d+ contra pedido 42 e 7", chaves: ["regex", "express[aã]o regular"],
    rodar: (texto) => {
      const m = texto.match(/regex\s+(\S+)\s+(?:contra|em|no)\s+(.+)$/i);
      if (!m) return falha("use: regex <padrão> contra <texto>");
      try {
        const re = new RegExp(m[1], "g");
        const achados = [...m[2].matchAll(re)].map((x) => x[0]);
        return ok({ padrao: m[1], achados, total: achados.length }, `${achados.length} ocorrência(s): ${achados.slice(0, 12).join(", ")}`);
      } catch (e) { return falha(`regex inválido: ${(e as Error).message}`); }
    },
  },
  {
    id: "cor", nome: "Conversor de cores", pacote: "dev",
    descricao: "HEX ↔ RGB e luminância para saber se o texto deve ser claro ou escuro.",
    exemplo: "cor #dc2626 em rgb", chaves: ["#[0-9a-f]{3,8}\\b", "rgb\\(", "hex para rgb", "cor "],
    rodar: (texto) => {
      const hex = texto.match(/#?([0-9a-f]{6}|[0-9a-f]{3})\b/i)?.[1];
      const rgb = texto.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
      let r: number, g: number, b: number;
      if (rgb) { [r, g, b] = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]; }
      else if (hex) {
        const h = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
        [r, g, b] = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
      } else return falha("informe uma cor (#dc2626 ou rgb(220,38,38))");
      const luminancia = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      const hexadecimal = `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
      return ok({ hexadecimal, rgb: `rgb(${r}, ${g}, ${b})`, luminancia: Number(luminancia.toFixed(3)), textoIdeal: luminancia > 0.55 ? "escuro" : "claro" },
        `${hexadecimal} = rgb(${r}, ${g}, ${b}) · texto ${luminancia > 0.55 ? "escuro" : "claro"}`);
    },
  },
  {
    id: "senha", nome: "Gerar senha", pacote: "dev",
    descricao: "Senhas fortes de 8 a 64 caracteres.",
    exemplo: "gera uma senha de 20 caracteres", chaves: ["senha", "password", "chave aleat[oó]ria"],
    rodar: (texto) => {
      const q = Math.min(Math.max(Math.floor(lista(texto)[0] ?? 16), 8), 64);
      const alfabeto = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*?";
      const bytes = crypto.getRandomValues(new Uint8Array(q));
      const s = [...bytes].map((b) => alfabeto[b % alfabeto.length]).join("");
      return ok({ senha: s, tamanho: q, entropiaBits: Math.round(q * Math.log2(alfabeto.length)) }, s);
    },
  },
  {
    id: "csv_json", nome: "CSV para JSON", pacote: "dev",
    descricao: "Converte CSV simples em lista de objetos.",
    exemplo: "csv para json: nome,idade\nana,30\nbia,25", chaves: ["csv para json", "csv"],
    rodar: (texto) => {
      const bloco = texto.split(/\n/).slice(1).join("\n").trim() || texto;
      const linhas = bloco.split(/\n/).map((l) => l.trim()).filter(Boolean);
      if (linhas.length < 2) return falha("cole o CSV com cabeçalho e ao menos uma linha");
      const cab = linhas[0].split(",").map((c) => c.trim());
      const dados = linhas.slice(1).map((l) => Object.fromEntries(l.split(",").map((c, i) => [cab[i] ?? `col${i}`, c.trim()])));
      return ok(dados, `${dados.length} linha(s), ${cab.length} coluna(s)`);
    },
  },
  {
    id: "camel_snake", nome: "camelCase, snake_case, kebab", pacote: "dev",
    descricao: "Converte nomes entre convenções.",
    exemplo: "snake case de nomeDoUsuario", chaves: ["camel ?case", "snake ?case", "kebab", "pascal ?case"],
    rodar: (texto) => {
      const corpo = norm(texto.replace(/^.*?(?:case|de)\s*:?\s*/i, "") || texto);
      const palavras = corpo.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_\-\s]+/g, " ").trim().split(" ").filter(Boolean).map((p) => p.toLowerCase());
      const camel = palavras.map((p, i) => (i ? p[0]?.toUpperCase() + p.slice(1) : p)).join("");
      const pascal = palavras.map((p) => p[0]?.toUpperCase() + p.slice(1)).join("");
      const snake = palavras.join("_");
      const kebab = palavras.join("-");
      const escolhido = /snake/i.test(texto) ? snake : /kebab/i.test(texto) ? kebab : /pascal/i.test(texto) ? pascal : camel;
      return ok({ camel, pascal, snake, kebab, resultado: escolhido }, escolhido);
    },
  },

  // ------------------------------------------------------------------ web
  {
    id: "cep", nome: "Buscar CEP", pacote: "web",
    descricao: "Endereço completo a partir do CEP (ViaCEP).",
    exemplo: "cep 01310100", chaves: ["cep"],
    rodar: async (texto) => {
      const c = (texto.match(/\b\d{8}\b|\b\d{5}-?\d{3}\b/)?.[0] ?? "").replace(/\D/g, "");
      if (c.length !== 8) return falha("informe um CEP com 8 dígitos");
      const r = await pegar(`https://viacep.com.br/ws/${c}/json/`);
      const d = await r.json();
      if (d.erro) return falha("CEP não encontrado");
      return ok(d, `${d.logradouro || "?"}, ${d.bairro || ""} · ${d.localidade}/${d.uf}`);
    },
  },
  {
    id: "cotacao", nome: "Cotação de moedas", pacote: "web",
    descricao: "Câmbio atualizado entre moedas (open.er-api.com).",
    exemplo: "cotação do dólar em real", chaves: ["cota[cç][aã]o", "d[oó]lar", "euro", "quanto est[aá] o", "c[aâ]mbio"],
    rodar: async (texto) => {
      const u = texto.toLowerCase();
      const achadas = Object.keys(MOEDAS).filter((k) => u.includes(k)).map((k) => MOEDAS[k]);
      const de = achadas[0] ?? "USD";
      const para = achadas[1] ?? (de === "BRL" ? "USD" : "BRL");
      const r = await pegar(`https://open.er-api.com/v6/latest/${de}`);
      const d = await r.json();
      const taxa = d?.rates?.[para];
      if (!taxa) return falha(`sem cotação de ${de} para ${para}`);
      return ok({ de, para, taxa, atualizado: d.time_last_update_utc, valorExemplo: taxa },
        `1 ${de} = ${brl(taxa)} ${para} (atualizado em ${String(d.time_last_update_utc).slice(0, 22)})`);
    },
  },
  {
    id: "wiki", nome: "Resumo da Wikipédia", pacote: "web",
    descricao: "Resumo enciclopédico de um tema.",
    exemplo: "o que é computação quântica na wikipedia", chaves: ["wikipedia", "wikip[eé]dia", "o que [eé] .*\\?$"],
    rodar: async (texto) => {
      const termo = norm(texto.replace(/.*?(?:wikipedia|wikip[eé]dia)\s*:?\s*/i, "").replace(/^(o que (é|e)|quem (é|e)|fale sobre|resuma)\s*/i, "").replace(/\?+$/, "")) || norm(texto);
      const alvo = encodeURIComponent(termo.split(" ").slice(0, 6).join(" "));
      const r = await pegar(`https://pt.wikipedia.org/api/rest_v1/page/summary/${alvo}`);
      const d = await r.json();
      if (!d?.extract) return falha(`não achei "${termo}" na Wikipédia`);
      return ok({ titulo: d.title, resumo: d.extract, url: d.content_urls?.desktop?.page }, d.extract.slice(0, 240));
    },
  },
  {
    id: "qr_code", nome: "Gerar QR Code", pacote: "web",
    descricao: "Cria a imagem de um QR Code para qualquer texto ou link.",
    exemplo: "qr code de https://skynetchat-xi.vercel.app", chaves: ["qr ?code", "qrcode"],
    rodar: (texto) => {
      const dado = norm(texto.replace(/.*?(?:qr ?code|qrcode)\s*(?:de|para|do)?\s*:?\s*/i, "")) || "SKYNET";
      const url = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(dado)}`;
      return ok({ texto: dado, imagem: url }, `QR Code de "${dado.slice(0, 60)}"`);
    },
  },
  {
    id: "repo_github", nome: "Resumo de repositório", pacote: "web",
    descricao: "Estrelas, linguagem e últimos commits de um repositório público.",
    exemplo: "github mlk010173/skynetchat", chaves: ["github\\.com/", "reposit[oó]rio", "repo "],
    rodar: async (texto) => {
      const m = texto.match(/([\w.-]+)\/([\w.-]+)/);
      if (!m) return falha("informe dono/repositório (ex.: mlk010173/skynetchat)");
      const repo = `${m[1]}/${m[2]}`;
      const r = await pegar(`https://api.github.com/repos/${repo}`);
      const d = await r.json();
      return ok({ repo, estrelas: d.stargazers_count, linguagem: d.language, issues: d.open_issues_count, atualizado: d.updated_at, url: d.html_url },
        `${repo}: ${d.stargazers_count} estrelas, ${d.language ?? "?"}, ${d.open_issues_count} issues abertas`);
    },
  },

  // -------------------------------------------------------------- sorteio
  {
    id: "sortear", nome: "Sortear", pacote: "sorteio",
    descricao: "Sorteia número, item de lista, dado ou cara-ou-coroa.",
    exemplo: "sorteie entre pizza, sushi e burger", chaves: ["sorte(ie|ar)", "aleat[oó]rio", "dado", "cara ou coroa", "jogar (um )?dado"],
    rodar: (texto) => {
      const u = texto.toLowerCase();
      const rnd = (n: number) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
      if (/cara ou coroa/.test(u)) {
        const r = rnd(2) ? "cara" : "coroa";
        return ok(r, r);
      }
      if (/dado/.test(u)) {
        const r = 1 + rnd(6);
        return ok(r, `🎲 ${r}`);
      }
      const itens = texto.split(/\b(?:entre|de|:)\b/).pop()!.split(/,| e /).map((s) => s.trim()).filter(Boolean);
      if (itens.length >= 2) {
        const r = itens[rnd(itens.length)];
        return ok(r, `sorteado: ${r}`);
      }
      const faixa = texto.match(/(\d+)\s*(?:a|at[eé])\s*(\d+)/i);
      if (faixa) {
        const [a, b] = [Number(faixa[1]), Number(faixa[2])];
        const r = a + rnd(b - a + 1);
        return ok(r, `número sorteado: ${r}`);
      }
      const n = Math.floor(lista(texto)[0] ?? NaN);
      if (Number.isFinite(n)) { const r = rnd(n) + 1; return ok(r, `1 a ${n}: ${r}`); }
      return falha("diga o que sortear (itens, faixa ou dado)");
    },
  },
  {
    id: "validar_cpf", nome: "Validar CPF", pacote: "validacao",
    descricao: "Confere os dígitos verificadores de um CPF.",
    exemplo: "o cpf 529.982.247-25 é válido?", chaves: ["cpf"],
    rodar: (texto) => {
      const c = (texto.match(/\d[\d.\-\s]{9,}\d/)?.[0] ?? "").replace(/\D/g, "");
      if (c.length !== 11) return falha("informe os 11 dígitos do CPF");
      const dig = (base: string, pesoInicial: number) => {
        const soma = base.split("").reduce((acc, d, i) => acc + Number(d) * (pesoInicial - i), 0);
        const r = (soma * 10) % 11;
        return r === 10 ? 0 : r;
      };
      const valido = !/^(\d)\1{10}$/.test(c) && dig(c.slice(0, 9), 10) === Number(c[9]) && dig(c.slice(0, 10), 11) === Number(c[10]);
      return ok({ cpf: c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4"), valido }, valido ? "CPF válido" : "CPF inválido");
    },
  },
  {
    id: "validar_cnpj", nome: "Validar CNPJ", pacote: "validacao",
    descricao: "Confere os dígitos verificadores de um CNPJ.",
    exemplo: "cnpj 11.222.333/0001-81 é válido?", chaves: ["cnpj"],
    rodar: (texto) => {
      const c = (texto.match(/[\d.\/\-\s]{14,}/)?.[0] ?? "").replace(/\D/g, "");
      if (c.length !== 14) return falha("informe os 14 dígitos do CNPJ");
      const calc = (base: string) => {
        const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
        const soma = base.split("").reduce((acc, d, i) => acc + Number(d) * pesos[i], 0);
        const r = soma % 11;
        return r < 2 ? 0 : 11 - r;
      };
      const valido = !/^(\d)\1{13}$/.test(c) && calc(c.slice(0, 12)) === Number(c[12]) && calc(c.slice(0, 13)) === Number(c[13]);
      return ok({ cnpj: c, valido }, valido ? "CNPJ válido" : "CNPJ inválido");
    },
  },
  {
    id: "validar_email", nome: "Validar e-mail", pacote: "validacao",
    descricao: "Checa o formato de um ou mais e-mails.",
    exemplo: "o e-mail joao@skynet.com é válido?", chaves: ["validar e-?mail", "e-?mail [eé] v[aá]lido", "e-?mails?"],
    rodar: (texto) => {
      const achados = texto.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? [];
      if (!achados.length) return falha("não achei e-mail no pedido");
      const regex = /^[\w.+-]+@[\w-]+\.[a-z]{2,}$/i;
      const avaliados = achados.map((e) => ({ email: e, valido: regex.test(e) }));
      return ok(avaliados, avaliados.map((a) => `${a.email}: ${a.valido ? "válido" : "inválido"}`).join(" · "));
    },
  },
  {
    id: "imc", nome: "IMC", pacote: "saude",
    descricao: "Índice de massa corporal com classificação.",
    exemplo: "imc de 80 kg e 1,78 m", chaves: ["imc", "massa corporal"],
    rodar: (texto) => {
      const n = lista(texto);
      const alt = n.find((v) => v > 1 && v < 2.6) ?? n[1];
      const peso = n.find((v) => v > 20) ?? n[0];
      if (!Number.isFinite(peso) || !Number.isFinite(alt)) return falha("informe peso (kg) e altura (m)");
      const imc = peso / (alt * alt);
      const classe = imc < 18.5 ? "abaixo do peso" : imc < 25 ? "peso normal" : imc < 30 ? "sobrepeso" : imc < 35 ? "obesidade grau I" : imc < 40 ? "obesidade grau II" : "obesidade grau III";
      return ok({ imc: Number(imc.toFixed(2)), classificacao: classe }, `IMC ${imc.toFixed(1)} · ${classe}`);
    },
  },
  {
    id: "dividir_conta", nome: "Dividir conta", pacote: "financeiro",
    descricao: "Divide um valor por pessoas, com gorjeta opcional.",
    exemplo: "dividir 240 reais entre 4 pessoas com 10% de gorjeta", chaves: ["dividir (a )?conta", "rachar", "por pessoa", "gorjeta", "gorjeta de", "dividir .{0,20} entre", "entre \\d+ pessoas"],
    rodar: (texto) => {
      const n = lista(texto);
      const pessoas = texto.match(/(\d+)\s*(?:pessoas?|amigos?|pessoa)/i);
      const pct = texto.match(/(\d+(?:[.,]\d+)?)\s*%/);
      const pctValor = pct ? num(pct[1]) : NaN;
      const qtd = pessoas ? num(pessoas[1]) : (n[1] ?? 2);
      const restantes = n.filter((v) => v !== pctValor && v !== qtd);
      const total = restantes.length ? Math.max(...restantes) : n[0];
      if (!Number.isFinite(total) || !Number.isFinite(qtd) || qtd < 1) return falha("informe o total e quantas pessoas");
      const gorjeta = pct ? num(pct[1]) / 100 : 0;
      const comGorjeta = total * (1 + gorjeta);
      return ok({ total, pessoas: qtd, gorjeta: gorjeta * total, totalComGorjeta: comGorjeta, porPessoa: comGorjeta / qtd },
        `R$ ${brl(comGorjeta / qtd)} por pessoa (total R$ ${brl(comGorjeta)})`);
    },
  },
  {
    id: "desconto", nome: "Desconto e acréscimo", pacote: "financeiro",
    descricao: "Preço final com desconto ou aumento em %.",
    exemplo: "produto de 350 com 15% de desconto", chaves: ["desconto", "com desconto", "% de desconto", "desconto de", "acr[eé]scimo", "aumento de"],
    rodar: (texto) => {
      const n = lista(texto);
      const pct = texto.match(/(\d+(?:[.,]\d+)?)\s*%/);
      if (!Number.isFinite(n[0]) || !pct) return falha("informe o preço e o percentual");
      const p = num(pct[1]);
      const preco = n.find((v) => v !== p) ?? n[0];
      const desconto = /desconto|off|menos/i.test(texto);
      const final = desconto ? preco * (1 - p / 100) : preco * (1 + p / 100);
      return ok({ preco, percentual: p, tipo: desconto ? "desconto" : "acrescimo", economia: preco - final, final },
        `R$ ${brl(preco)} ${desconto ? "com" : "mais"} ${p}% = R$ ${brl(final)}${desconto ? ` (economia R$ ${brl(preco - final)})` : ""}`);
    },
  },
  {
    id: "combustivel", nome: "Custo de viagem", pacote: "financeiro",
    descricao: "Litros e custo de combustível para uma distância.",
    exemplo: "viagem de 450 km com consumo de 12 km/l e gasolina a 5,89", chaves: ["combust[ií]vel", "gasolina", "km/l", "custo da viagem"],
    rodar: (texto) => {
      const n = lista(texto);
      const km = texto.match(/(\d+(?:[.,]\d+)?)\s*km(?![\/a-z])/i);
      const consumo = texto.match(/(\d+(?:[.,]\d+)?)\s*km\s*\/\s*l/i);
      const preco = texto.match(/(?:a|por|pre[cç]o de)\s*r?\$?\s*(\d+(?:[.,]\d+)?)/i);
      const distancia = num(km?.[1]);
      const rendimento = num(consumo?.[1]) || 10;
      const litro = num(preco?.[1]) || n[n.length - 1];
      if (!Number.isFinite(distancia) || !Number.isFinite(litro)) return falha("informe distância, consumo (km/l) e preço do litro");
      const litros = distancia / rendimento;
      return ok({ distancia, rendimento, precoLitro: litro, litros, custo: litros * litro },
        `${brl(distancia)} km / ${brl(rendimento)} km/l = ${brl(litros)} L · custo R$ ${brl(litros * litro)}`);
    },
  },
  {
    id: "palindromo", nome: "Palíndromo", pacote: "texto",
    descricao: "Diz se a palavra ou frase é igual de trás para frente.",
    exemplo: "arara é palíndromo?", chaves: ["pal[ií]ndromo"],
    rodar: (texto) => {
      const alvo = texto.match(/(?:^|\b(?:se|texto|palavra|frase)\s+)([\p{L}\p{N}\s'’.,!?;:-]+?)\s*(?:é|e)\s*pal[ií]ndromo/iu)?.[1]
        ?? texto.replace(/\bpal[ií]ndromo\b.*$/i, "").replace(/^.*?\b(?:se|texto|palavra|frase)\b/i, "");
      const corpo = norm(alvo).replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
      const limpo = corpo.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const sim = limpo.length > 1 && limpo === [...limpo].reverse().join("");
      return ok({ texto: corpo, palindromo: sim }, sim ? "é palíndromo" : "não é palíndromo");
    },
  },
  {
    id: "contar_vogais", nome: "Contar letras e vogais", pacote: "texto",
    descricao: "Conta vogais, consoantes e letras de um texto.",
    exemplo: "quantas vogais tem skynetchat", chaves: ["vogais", "consoantes"],
    rodar: (texto) => {
      const corpo = norm(texto.replace(/^.*?(?:tem|em|:)\s*/i, "")).replace(/[^\p{L}\s]/gu, "");
      const letras = corpo.replace(/\s/g, "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const vogais = (letras.match(/[aeiou]/g) ?? []).length;
      return ok({ letras: letras.length, vogais, consoantes: letras.length - vogais }, `${vogais} vogais e ${letras.length - vogais} consoantes em ${letras.length} letras`);
    },
  },
  {
    id: "hipotenusa", nome: "Triângulo e Pitágoras", pacote: "calculo",
    descricao: "Hipotenusa, área e perímetro a partir dos catetos.",
    exemplo: "hipotenusa de 3 e 4", chaves: ["hipotenusa", "pit[aá]goras", "[aá]rea do tri[aâ]ngulo"],
    rodar: (texto) => {
      const n = lista(texto);
      if (n.length < 2) return falha("informe os dois catetos");
      const [a, b] = n;
      const h = Math.hypot(a, b);
      return ok({ catetos: [a, b], hipotenusa: Number(h.toFixed(3)), area: (a * b) / 2, perimetro: Number((a + b + h).toFixed(3)) },
        `hipotenusa ${brl(h)} · área ${brl((a * b) / 2)}`);
    },
  },
];

const PACOTES = [...new Set(HABILIDADES.map((h) => h.pacote))];
const publica = (h: Habilidade) => ({
  id: h.id, nome: h.nome, pacote: h.pacote, descricao: h.descricao, exemplo: h.exemplo,
});

const pesoDaChave = (c: string) => (c.length >= 12 ? 6 : c.length >= 8 ? 4 : c.length >= 5 ? 3 : c.length >= 3 ? 2 : 1);

function escolher(texto: string): Habilidade | null {
  const alvo = texto.toLowerCase();
  let melhor: Habilidade | null = null;
  let pontos = 0;
  let maisLonga = 0;
  for (const h of HABILIDADES) {
    let s = 0;
    let longa = 0;
    for (const chave of h.chaves) {
      try {
        if (new RegExp(chave, "i").test(alvo)) {
          s += pesoDaChave(chave);
          if (chave.length > longa) longa = chave.length;
        }
      } catch { /* chave inválida é ignorada */ }
    }
    if (s > pontos || (s === pontos && s > 0 && longa > maisLonga)) {
      pontos = s;
      maisLonga = longa;
      melhor = h;
    }
  }
  return pontos >= 2 ? melhor : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  if (req.method === "GET") {
    const pacote = new URL(req.url).searchParams.get("pacote");
    const listaFinal = (pacote ? HABILIDADES.filter((h) => h.pacote === pacote) : HABILIDADES).map(publica);
    return json({ ok: true, total: HABILIDADES.length, pacotes: PACOTES, habilidades: listaFinal });
  }

  if (req.method !== "POST") return json({ ok: false, error: "Método não suportado." }, 405);

  let corpo: Args = {};
  try { corpo = await req.json(); } catch { /* corpo vazio */ }

  const texto = norm(corpo.texto ?? corpo.pedido ?? "");
  const habilidade = corpo.skill
    ? HABILIDADES.find((h) => h.id === String(corpo.skill)) ?? null
    : escolher(texto);

  if (!habilidade) {
    return json({
      ok: false, erro: "nenhuma habilidade corresponde ao pedido",
      dica: "envie { skill, texto } ou consulte GET para ver o catálogo",
      exemplos: HABILIDADES.slice(0, 6).map((h) => ({ id: h.id, exemplo: h.exemplo })),
    }, 404);
  }

  try {
    const saida = await habilidade.rodar(texto, (corpo.args ?? corpo) as Args);
    const resultado = (saida && typeof saida === "object" && "ok" in (saida as Args))
      ? saida as Args
      : { ok: true, resultado: saida };
    return json({
      ok: resultado.ok !== false,
      skill: habilidade.id,
      nome: habilidade.nome,
      pacote: habilidade.pacote,
      erro: resultado.erro ?? null,
      resultado: resultado.resultado ?? null,
      detalhe: resultado.detalhe ?? null,
    });
  } catch (e) {
    return json({ ok: false, skill: habilidade.id, nome: habilidade.nome, erro: String((e as Error)?.message ?? e).slice(0, 200) }, 500);
  }
});
