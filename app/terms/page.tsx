export const metadata = { title: "Termos de Serviço — SKYNET" };

export default function TermsPage() {
  return (
    <div className="doc-page">
      <h1>Termos de <span>Serviço</span></h1>
      <p>Última atualização: 25 de outubro de 2026.</p>

      <h2>1. O que é o serviço</h2>
      <p>
        O SKYNET é uma interface de chat para modelos de inteligência artificial. O serviço é
        fornecido "como está", sem garantia de disponibilidade contínua.
      </p>

      <h2>2. Uso aceitável</h2>
      <p>
        Não use o SKYNET para atividades ilegais, para gerar conteúdo que cause dano real a
        pessoas, para ataques a sistemas ou para violar direitos de terceiros.
      </p>

      <h2>3. Contas</h2>
      <p>
        Você é responsável pela sua conta e senha. O histórico de conversas fica no banco de dados
        do serviço e é visível apenas por você, por política de Row Level Security.
      </p>

      <h2>4. Privacidade</h2>
      <p>
        Coletamos o mínimo: email da conta, mensagens que você envia e respostas da IA. O modo
        anônimo não armazena mensagens. Não vendemos dados.
      </p>

      <h2>5. Conteúdo gerado por IA</h2>
      <p>
        As respostas são geradas por modelos estatísticos e podem conter erros. Não confie nelas
        como fonte única para decisões importantes.
      </p>

      <h2>6. Encerramento</h2>
      <p>
        Podemos suspender contas que violem estes termos. Você pode encerrar sua conta a
        qualquer momento solicitando a exclusão ao suporte.
      </p>

      <a className="back btn-ghost" href="/skynetchat/">← Voltar ao chat</a>
    </div>
  );
}
