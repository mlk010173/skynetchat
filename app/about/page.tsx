export const metadata = { title: "Sobre o SKYNET" };

export default function AboutPage() {
  return (
    <div className="doc-page">
      <h1>SKY<span>NET</span></h1>
      <p>Chat de IA com estética de terminal e infraestrutura própria.</p>

      <h2>O que é o SKYNET?</h2>
      <p>
        Uma inteligência artificial em português com frontend e backend próprios: servidor real,
        contas reais, histórico salvo em banco de dados. Nada aqui é simulação ou espelho de outro
        site — o código é 100% novo e open source.
      </p>

      <h2>Como funciona por dentro</h2>
      <p>• <strong>Frontend + API</strong>: Next.js em serverless na Vercel.</p>
      <p>• <strong>Contas e histórico</strong>: Supabase (Postgres com Row Level Security — cada usuário só acessa as próprias conversas).</p>
      <p>• <strong>Chat</strong>: provedores de IA compatíveis com a API OpenAI (OpenAI, Groq, OpenRouter…).</p>

      <h2>Modos de uso</h2>
      <p><strong>Anônimo</strong>: conversa sem conta, com limite de 20 mensagens por hora por IP e sem histórico salvo.</p>
      <p><strong>Logado</strong>: email e senha, conversas salvas e sincronizadas entre dispositivos.</p>

      <h2>Privacidade</h2>
      <p>
        Suas mensagens ficam no seu banco Supabase, protegidas por RLS. As chaves do provedor de IA
        vivem apenas no servidor e nunca chegam ao navegador.
      </p>

      <a className="back btn-ghost" href="/skynetchat/">← Voltar ao chat</a>
    </div>
  );
}
