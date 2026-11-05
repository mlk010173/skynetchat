import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib.js";

const TEXTOS = {
  livre: { titulo: "Livre", desc: "roda sem perguntar", cor: "livre" },
  leve: { titulo: "Pedir 1x por dia", desc: "uma autorização vale 24h", cor: "leve" },
  critico: { titulo: "Pedir sempre", desc: "confirma a cada execução", cor: "critico" },
  bloqueado: { titulo: "Bloqueado", desc: "nunca executa", cor: "bloqueado" },
};

const ORDEM = ["critico", "leve", "livre", "bloqueado"];

export default function Permissoes() {
  const [dados, setDados] = useState({ ferramentas: [], pedidos: [] });
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(null);
  const navigate = useNavigate();

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await api("permissoes");
      if (!r?.ok) {
        setErro(r?.error || "Não consegui carregar suas permissões.");
      } else {
        setErro(null);
        setDados({ ferramentas: r.ferramentas || [], pedidos: r.pedidos || [] });
      }
    } catch (e) {
      setErro(String(e?.message || e));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const mudar = async (ferramenta, politica) => {
    setSalvando(ferramenta);
    setAviso(null);
    try {
      const r = await api("permissoes?action=politica", { method: "POST", body: { ferramenta, politica } });
      if (!r?.ok) setAviso(r?.error || "Não consegui salvar.");
      else {
        setAviso(`${ferramenta}: agora ${TEXTOS[politica]?.titulo?.toLowerCase() || politica}.`);
        await carregar();
      }
    } finally {
      setSalvando(null);
    }
  };

  const decidir = async (id, autorizar) => {
    const r = await api("permissoes?action=decidir", { method: "POST", body: { id, autorizar } });
    setAviso(r?.ok ? (autorizar ? "Autorizado. Peça de novo no chat que eu executo." : "Pedido negado.") : (r?.error || "Falhou."));
    await carregar();
  };

  const restaurar = async () => {
    setSalvando("reset");
    const r = await api("permissoes?action=reset", { method: "POST", body: {} });
    setAviso(r?.ok ? "Voltei tudo ao padrão do SKYNET." : (r?.error || "Falhou."));
    await carregar();
    setSalvando(null);
  };

  const grupos = ORDEM.map((politica) => ({
    politica,
    itens: dados.ferramentas.filter((f) => f.politica === politica),
  })).filter((g) => g.itens.length);

  return (
    <div className="tela-permissoes">
      <header className="permissoes-topo">
        <button type="button" className="voltar" onClick={() => navigate(-1)}>←</button>
        <div>
          <h1>Permissões do SKYNET</h1>
          <p>Escolha o que o agente executa sozinho e o que precisa da sua autorização.</p>
        </div>
      </header>

      {erro && (
        <div className="permissoes-erro">
          {erro} <Link to="/login">Entrar</Link>
        </div>
      )}

      {dados.pedidos.length > 0 && (
        <section className="permissoes-pendentes">
          <h2>Aguardando você</h2>
          {dados.pedidos.map((p) => (
            <div key={p.id} className="pedido">
              <div>
                <strong>{p.ferramenta}</strong>
                <span>{p.resumo || "sem detalhe"}</span>
              </div>
              {p.estado === "pendente" ? (
                <div className="pedido-acoes">
                  <button type="button" className="autorizar" onClick={() => decidir(p.id, true)}>Autorizar</button>
                  <button type="button" className="negar" onClick={() => decidir(p.id, false)}>Negar</button>
                </div>
              ) : (
                <span className="pedido-ok">autorizado · peça no chat</span>
              )}
            </div>
          ))}
        </section>
      )}

      {aviso && <div className="permissoes-aviso">{aviso}</div>}
      {carregando && <p className="permissoes-carregando">Carregando…</p>}

      {grupos.map((g) => (
        <section key={g.politica} className={`grupo-permissao ${TEXTOS[g.politica].cor}`}>
          <h2>
            {TEXTOS[g.politica].titulo} <small>{TEXTOS[g.politica].desc}</small>
          </h2>
          <ul>
            {g.itens.map((f) => (
              <li key={f.ferramenta}>
                <div className="item-info">
                  <strong>{f.rotulo}</strong>
                  <code>{f.ferramenta}</code>
                  {f.aprovado_em && <span className="aprovado">liberado até {new Date(f.aprovado_em).toLocaleString("pt-BR")}</span>}
                </div>
                <select
                  aria-label={`Política de ${f.rotulo}`}
                  value={f.politica}
                  disabled={salvando === f.ferramenta}
                  onChange={(e) => mudar(f.ferramenta, e.target.value)}
                >
                  <option value="livre">Livre</option>
                  <option value="leve">Pedir 1x por dia</option>
                  <option value="critico">Pedir sempre</option>
                  <option value="bloqueado">Bloqueado</option>
                </select>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <footer className="permissoes-rodape">
        <button type="button" onClick={restaurar} disabled={salvando === "reset"}>
          Restaurar padrão
        </button>
        <Link to="/">Voltar ao chat</Link>
      </footer>
    </div>
  );
}
