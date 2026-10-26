import { Link } from "react-router-dom";

/** /terms — Termos de Serviço (portado da versão anterior). */
export default function Terms() {
  return (
    <div className="doc-page">
      <h1>Termos de <span>Serviço</span></h1>
      <p>Última atualização: 26 de outubro de 2026.</p>

      <h2>1. O que é o serviço</h2>
      <p>O SKYNETchat é uma interface de chat para modelos de inteligência artificial. O serviço é fornecido "como está", sem garantia de disponibilidade contínua.</p>

      <h2>2. Uso aceitável</h2>
      <p>Não use o SKYNETchat para atividades ilegais, para gerar conteúdo que cause dano real a pessoas, para ataques a sistemas ou para violar direitos de terceiros.</p>

      <h2>3. Contas</h2>
      <p>O acesso é feito por código de 12 dígitos gerado na criação da conta. Você é responsável por guardar seu código. O histórico de conversas fica no banco de dados do serviço e é visível apenas por você, por política de Row Level Security.</p>

      <h2>4. Dados e privacidade</h2>
      <p>As conversas ficam armazenadas para manter seu histórico e sincronizar entre dispositivos. O email de recuperação é opcional e usado apenas para recuperar o acesso.</p>

      <h2>5. IA e limites</h2>
      <p>As respostas são geradas por modelos de IA e podem conter erros. O serviço pode limitar o número de mensagens por hora para proteger a infraestrutura.</p>

      <p className="doc-back"><Link to="/">← voltar ao chat</Link></p>
    </div>
  );
}
