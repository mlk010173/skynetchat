/** Moldura das telas de auth: estética terminal do site real. */
export default function AuthShell({ title, children, links }) {
  return (
    <div className="auth-page">
      <header className="auth-header">
        <span className="logo">SKYNETCHAT</span>
        <span className="badge-online">ONLINE</span>
      </header>
      <p className="tagline">
        O DIREITO À PRIVACIDADE E O ACESSO IRRESTRITO À INFORMAÇÃO É UM DIREITO UNIVERSAL DE TODOS.
      </p>
      <section className="terminal">
        <div className="term-top">&gt;_ {title} <span className="secure">SECURE</span></div>
        {children}
        <div className="term-foot">E2E | AES-256 | ZERO-TRUST</div>
        <nav className="auth-links">{links}</nav>
      </section>
    </div>
  );
}
