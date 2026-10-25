"use client";

// CONFIGURAÇÕES — tema, modelo padrão e notificações, persistidos no Supabase (user_settings).
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/client-auth";
import { BASE } from "@/lib/api";

type Settings = { theme: "black" | "white"; default_model: string; notifications_enabled: boolean };

export default function SettingsPage() {
  const supabase = getSupabase();
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [theme, setTheme] = useState<"black" | "white">("black");
  const [model, setModel] = useState("gpt-4o-mini");
  const [notifs, setNotifs] = useState(true);
  const [status, setStatus] = useState("");
  const models = ["gpt-4o-mini", "gpt-4o"];

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { router.replace(BASE + "/login"); return; }
      document.documentElement.dataset.theme = document.documentElement.dataset.theme || "black";
      setTheme((document.documentElement.dataset.theme as "black" | "white") || "black");

      const { data: s } = await supabase.from("user_settings").select("*").eq("user_id", data.session.user.id).maybeSingle();
      if (s) {
        setModel(s.default_model ?? "gpt-4o-mini");
        setNotifs(s.notifications_enabled ?? true);
      }
      setLoaded(true);
    });
  }, [supabase, router]);

  async function persist(patch: Partial<Settings>) {
    if (!supabase) return;
    setStatus("");
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    const { error } = await supabase.from("user_settings").upsert({
      user_id: data.session.user.id,
      ...(patch.theme !== undefined ? { theme: patch.theme } : {}),
      ...(patch.default_model !== undefined ? { default_model: patch.default_model } : {}),
      ...(patch.notifications_enabled !== undefined ? { notifications_enabled: patch.notifications_enabled } : {}),
      updated_at: new Date().toISOString(),
    });
    setStatus(error ? "Falha ao salvar: " + error.message : "// salvo no servidor");
    if (!error && localStorage) {
      if (patch.theme) { localStorage.setItem("skynet-theme", patch.theme); document.documentElement.dataset.theme = patch.theme; }
      if (patch.default_model) localStorage.setItem("skynet-model", patch.default_model);
    }
  }

  if (!loaded) return <main className="page-shell"><div className="page-card"><div className="page-head"><span>&gt;_ CONFIGURAÇÕES</span></div><div className="page-note">carregando…</div></div></main>;

  return (
    <main className="page-shell">
      <div className="page-card">
        <div className="page-head">
          <span>&gt;_ CONFIGURAÇÕES</span>
          <Link href={BASE + "/"} className="page-close">✕</Link>
        </div>

        <section className="form-block">
          <div className="form-title">TEMA DE FUNDO</div>
          <div className="seg-row">
            <button className={theme === "black" ? "seg active" : "seg"} onClick={() => { setTheme("black"); persist({ theme: "black" }); }}>BLACK</button>
            <button className={theme === "white" ? "seg active" : "seg"} onClick={() => { setTheme("white"); persist({ theme: "white" }); }}>WHITE</button>
          </div>
        </section>

        <section className="form-block">
          <div className="form-title">MODELO PADRÃO</div>
          <div className="seg-row">
            {models.map((m) => (
              <button key={m} className={model === m ? "seg active" : "seg"} onClick={() => { setModel(m); persist({ default_model: m }); }}>{m}</button>
            ))}
          </div>
        </section>

        <section className="form-block">
          <div className="form-title">NOTIFICAÇÕES</div>
          <button
            className={notifs ? "toggle on" : "toggle"}
            onClick={() => { const v = !notifs; setNotifs(v); persist({ notifications_enabled: v }); }}
            aria-pressed={notifs}
          >
            <span className="toggle-dot" />
            {notifs ? "ATIVADAS" : "DESATIVADAS"}
          </button>
        </section>

        {status && <div className="auth-status">{status}</div>}

        <Link href={BASE + "/account"} className="page-link">← CONTA E PERFIL</Link>
      </div>
    </main>
  );
}
