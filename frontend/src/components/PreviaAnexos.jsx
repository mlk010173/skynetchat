// SKYNET · prévia dos anexos acima do campo de digitação.
// Miniatura para imagem, ícone e nome para arquivo, botão × para remover.
export function tamanhoLegivel(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

export default function PreviaAnexos({ itens = [], aoRemover, aoAbrir }) {
  if (!itens.length) return null;
  return (
    <div className="previa-anexos" aria-label="anexos selecionados">
      {itens.map((item, i) => {
        const imagem = item.tipo?.startsWith("image/") || item.url?.startsWith("data:image") || item.url?.startsWith("blob:");
        return (
          <figure className="previa-item" key={`${item.nome}-${i}`}>
            <button
              type="button"
              className="previa-alvo"
              onClick={() => (aoAbrir ? aoAbrir(item) : window.open(item.url, "_blank", "noopener"))}
              aria-label={`abrir ${item.nome}`}
            >
              {imagem ? <img src={item.url} alt={item.nome} /> : <span className="previa-icone" aria-hidden="true">🗎</span>}
            </button>
            <figcaption>
              <b>{item.nome}</b>
              <small>{item.tamanho ? tamanhoLegivel(item.tamanho) : item.tipo?.split("/")[1] || "arquivo"}</small>
            </figcaption>
            <button type="button" className="previa-x" aria-label={`remover ${item.nome}`} onClick={() => aoRemover?.(i)}>×</button>
          </figure>
        );
      })}
    </div>
  );
}
