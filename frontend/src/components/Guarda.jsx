import { Component } from "react";

/** Evita tela preta: se algo quebrar na renderização, mostra um cartão para recarregar. */
export default class Guarda extends Component {
  constructor(props) {
    super(props);
    this.state = { erro: null };
  }

  static getDerivedStateFromError(erro) {
    return { erro };
  }

  componentDidCatch(erro, info) {
    try {
      console.error("SKYNET falhou ao renderizar:", erro, info?.componentStack?.slice(0, 400));
    } catch {
      /* noop */
    }
  }

  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <div className="guarda-erro" role="alert">
        <h2>Algo quebrou nesta tela</h2>
        <p>{String(this.state.erro?.message ?? "erro inesperado").slice(0, 160)}</p>
        <div className="guarda-acoes">
          <button type="button" onClick={() => this.setState({ erro: null })}>Tentar de novo</button>
          <button type="button" className="secundario" onClick={() => window.location.reload()}>Recarregar</button>
          <a href="#/" onClick={() => this.setState({ erro: null })}>Voltar ao início</a>
        </div>
      </div>
    );
  }
}
