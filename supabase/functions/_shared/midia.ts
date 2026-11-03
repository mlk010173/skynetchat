// Resolve mídia tocável: YouTube, Spotify, SoundCloud, Vimeo e arquivos diretos.
// Usado pela função pública "midia" e pela ferramenta "midia" do chat.

export type PedidoMidia = { consulta?: string; provedor?: string; url?: string };
export type Midia = {
  ok: boolean;
  provedor?: "youtube" | "spotify" | "soundcloud" | "vimeo" | "arquivo";
  url?: string;
  embed?: string;
  titulo?: string;
  busca?: string;
  mensagem?: string;
  aviso?: string;
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export function provedorDaUrl(url: string): string {
  if (/open\.spotify\.com|spotify\.com/i.test(url)) return "spotify";
  if (/soundcloud\.com/i.test(url)) return "soundcloud";
  if (/vimeo\.com/i.test(url)) return "vimeo";
  if (/(youtube\.com|youtu\.be)/i.test(url)) return "youtube";
  if (/\.(mp3|mp4|webm|m4a|ogg|wav|opus)(\?|$)/i.test(url)) return "arquivo";
  return "";
}

export function embedding(provedor: string, url: string): string {
  if (provedor === "arquivo") return url;
  if (provedor === "youtube") {
    const id = url.match(/(?:v=|youtu\.be\/|live\/|shorts\/|embed\/)([\w-]{11})/)?.[1];
    return id ? `https://www.youtube.com/embed/${id}` : "";
  }
  if (provedor === "vimeo") {
    const id = url.match(/vimeo\.com\/(?:video\/)?(\d+)/)?.[1];
    return id ? `https://player.vimeo.com/video/${id}` : "";
  }
  if (provedor === "spotify") {
    const tipo = url.match(/open\.spotify\.com\/(track|album|playlist|episode|show|artist)\/([\w]+)/);
    if (!tipo) return "";
    return `https://open.spotify.com/embed/${tipo[1]}/${tipo[2]}?utm_source=generator&theme=0`;
  }
  if (provedor === "soundcloud") {
    return `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&color=%23ff4d4d&auto_play=false&hide_related=true&show_comments=false&show_teaser=false`;
  }
  return "";
}

/** Extrai o primeiro link de mídia de uma lista de resultados de busca. */
export function linkDeMidia(itens: Array<{ url?: string; titulo?: string }>, provedor: string): { url: string; titulo: string } | null {
  for (const it of itens ?? []) {
    const u = String(it?.url ?? "");
    if (!u) continue;
    if (provedor === "spotify" && /open\.spotify\.com\/(track|album|playlist|episode|show)\//.test(u)) return { url: u, titulo: String(it.titulo ?? "") };
    if (provedor === "soundcloud" && /soundcloud\.com\/[^/]+\/[^/]+/.test(u) && !/\/you$/.test(u)) return { url: u, titulo: String(it.titulo ?? "") };
    if (provedor === "vimeo" && /vimeo\.com\/\d+/.test(u)) return { url: u, titulo: String(it.titulo ?? "") };
    if (provedor === "youtube" && /(youtube\.com\/watch|youtu\.be\/)/.test(u)) return { url: u, titulo: String(it.titulo ?? "") };
  }
  return null;
}

/** Busca no YouTube sem chave de API: lê a página de resultados. */
async function buscarYouTube(consulta: string): Promise<{ url: string; titulo: string } | null> {
  try {
    const r = await fetch(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(consulta)}&hl=pt&gl=BR&sp=EgIQAQ%253D%253D`,
      { headers: { "user-agent": UA, "accept-language": "pt-BR,pt;q=0.9" }, signal: AbortSignal.timeout(12000) },
    );
    const html = await r.text();
    const ids = [...html.matchAll(/"videoId":"([\w-]{11})"/g)].map((m) => m[1]);
    const unicos = [...new Set(ids)];
    if (!unicos.length) return null;
    const id = unicos[0];
    const pos = html.indexOf(`"videoId":"${id}"`);
    const trecho = html.slice(pos, pos + 1200);
    const titulo = trecho.match(/"text":"([^"]{3,140})"/)?.[1] ?? consulta;
    return { url: `https://www.youtube.com/watch?v=${id}`, titulo };
  } catch {
    return null;
  }
}

/** Busca no Spotify via open.spotify.com (a página devolve links de faixas). */
async function buscarSpotify(consulta: string): Promise<{ url: string; titulo: string } | null> {
  try {
    const r = await fetch(
      `https://open.spotify.com/search/${encodeURIComponent(consulta)}`,
      { headers: { "user-agent": UA, "accept-language": "pt-BR,pt;q=0.9" }, signal: AbortSignal.timeout(12000) },
    );
    const html = await r.text();
    const m = html.match(/open\.spotify\.com\/(track|album|playlist)\/([a-zA-Z0-9]{16,})/);
    if (!m) return null;
    return { url: `https://open.spotify.com/${m[1]}/${m[2]}`, titulo: consulta };
  } catch {
    return null;
  }
}

export async function resolverMidia(pedido: PedidoMidia): Promise<Midia> {
  const url = String(pedido.url ?? "").trim();
  const consulta = String(pedido.consulta ?? "").trim();
  let provedor = String(pedido.provedor ?? "").toLowerCase();
  if (!provedor && url) provedor = provedorDaUrl(url);
  if (!provedor) provedor = "youtube";

  // 1. link direto já tocável
  if (url) {
    const emb = embedding(provedor || provedorDaUrl(url), url);
    if (emb) return { ok: true, provedor: (provedor || provedorDaUrl(url)) as Midia["provedor"], url, embed: emb, titulo: consulta || url.split("/").pop() };
    if (/^https?:\/\//i.test(url)) {
      // não é mídia reconhecida: tenta tocar no YouTube pela consulta
      provedor = "youtube";
    }
  }

  if (!consulta && !url) {
    return {
      ok: false,
      provedor: provedor as Midia["provedor"],
      busca: "",
      mensagem: "O player está aberto. Diga o nome da música, vídeo, playlist ou filme que devo tocar.",
    };
  }

  const termo = consulta || url;

  // 2. Spotify primeiro quando pedido, caindo para YouTube se não achar faixa
  if (provedor === "spotify") {
    const achado = await buscarSpotify(termo);
    if (achado) {
      const emb = embedding("spotify", achado.url);
      if (emb) return { ok: true, provedor: "spotify", url: achado.url, embed: emb, titulo: achado.titulo || termo };
    }
    const yt = await buscarYouTube(termo);
    if (yt) {
      return {
        ok: true, provedor: "youtube", url: yt.url, embed: embedding("youtube", yt.url), titulo: yt.titulo,
        aviso: "Não achei essa faixa aberta no Spotify, então toquei no YouTube.",
      };
    }
    return { ok: false, provedor: "spotify", busca: termo, mensagem: "Não encontrei essa faixa agora. Tente o nome do artista junto." };
  }

  // 3. SoundCloud
  if (provedor === "soundcloud") {
    const busca = `https://soundcloud.com/search?q=${encodeURIComponent(termo)}`;
    return { ok: false, provedor: "soundcloud", busca: termo, url: busca, mensagem: "A busca do SoundCloud precisa de um link de faixa. Cole o link ou me diga o artista para eu procurar no YouTube." };
  }

  // 4. YouTube (padrão)
  const yt = await buscarYouTube(termo);
  if (yt) return { ok: true, provedor: "youtube", url: yt.url, embed: embedding("youtube", yt.url), titulo: yt.titulo };
  return { ok: false, provedor: "youtube", busca: termo, mensagem: "Não consegui achar esse vídeo agora. Tente outro termo." };
}
