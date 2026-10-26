# mirror/ — Captura de referência do skynetchat.net (F12/HTTP, 25/10/2026)

Conteúdo capturado do site real para referência de interface:

- `home.html` — página inicial renderizada no servidor (menu completo, hero, composer)
- `routes/` — rotas servidas no servidor, byte a byte:
  - `route-login.html` (16,5 KB)
  - `route-termos.html` (43 KB)
  - `route-about.html` (24,6 KB)
  - `route-monetize.html` (17,3 KB)
- `css/` — design system real compilado (SvelteKit):
  - `0.NDTWPgt7.css` (170 KB) · `3.CCEN65Uu.css` (147 KB) — cores, espaçamentos, componentes
  - `ProjectDetailPanel.CnvsYsZz.css` · `Turnstile.Dnhv9yFl.css`
- `assets/` — manifest e ícones originais

## Views capturadas via navegador (client-side, sem rota de servidor)
- **ATUALIZAÇÕES** — feed de updates com data, autor e reações
- **PROMPTS** — publicações de prompts úteis
- **SUPORTE** — chat de suporte com opções rápidas (Recuperar conta, Assinar PRO, etc.)
- Indique e Ganhe / Imagens / Projetos / Histórico — exigem login no site original

## Tokens extraídos
- Fundo: `#070000` (preto levemente vermelho) · branco: `#ffffff`
- Fontes: Google Sans Flex + Inter (400-700)
- Chave de tema no localStorage: `skynet-theme-bg` (black/white)
- Header: "SKYNETchat" + seletor de modelo "4.5"

Nota: o app do site é SvelteKit com bundles ligados à infraestrutura deles
(Turnstile, pixels). Por isso o frontend do nosso projeto é reproduzido em
código próprio a partir destas capturas, integrado ao nosso Supabase.
