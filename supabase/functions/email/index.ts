import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
};

const jsonRes = (status: number, data: any) =>
  new Response(JSON.stringify(data), {
    status,
    headers: CORS_HEADERS,
  });

function decodeBase64Url(str: string): string {
  if (!str) return "";
  try {
    let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) {
      base64 += "=";
    }
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return "";
  }
}

function encodeBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function getHeader(
  headers: Array<{ name: string; value: string }> | undefined,
  name: string
): string {
  if (!headers) return "";
  const found = headers.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return found ? found.value : "";
}

function extractBody(payload: any): string {
  if (!payload) return "";
  if (payload.body && payload.body.data) {
    return decodeBase64Url(payload.body.data);
  }
  if (payload.parts && Array.isArray(payload.parts)) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body && part.body.data) {
        return decodeBase64Url(part.body.data);
      }
    }
    for (const part of payload.parts) {
      if (part.body && part.body.data) {
        return decodeBase64Url(part.body.data);
      }
      if (part.parts) {
        const res = extractBody(part);
        if (res) return res;
      }
    }
  }
  return "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  // 1. Verify User Session in Supabase
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return jsonRes(401, { ok: false, error: "sem sessao" });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: uData, error: uErr } = await supabase.auth.getUser(token);
  if (uErr || !uData?.user) {
    return jsonRes(401, { ok: false, error: "sessao invalida" });
  }

  // 2. Verify Gmail Access Token Secret
  const gmailAccessToken = Deno.env.get("GMAIL_ACCESS_TOKEN") || "";
  if (!gmailAccessToken) {
    return jsonRes(200, {
      ok: false,
      estado: "pendente_configuracao",
      error: "Secret GMAIL_ACCESS_TOKEN nao configurado",
    });
  }

  // Parse Body or Query Parameters
  let body: any = {};
  if (req.method === "POST" || req.method === "PUT") {
    try {
      body = await req.json();
    } catch {
      body = {};
    }
  }

  const url = new URL(req.url);
  const actionParam = url.searchParams.get("action");
  const qParam = url.searchParams.get("q");
  const idParam = url.searchParams.get("id");

  const action =
    body.action ||
    actionParam ||
    (body.search ? "search" : "") ||
    (body.read ? "read" : "") ||
    (body.draft ? "draft" : "") ||
    (body.send ? "send" : "") ||
    (body.list ? "list" : "list");

  const q = body.q || qParam || "";
  const id = body.id || idParam || "";

  // Helper for Gmail API fetch with 401 handling
  const fetchGmail = async (endpoint: string, options: RequestInit = {}) => {
    const headers = {
      Authorization: `Bearer ${gmailAccessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    };
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me${endpoint}`,
      { ...options, headers }
    );

    if (response.status === 401) {
      return { is401: true, data: null, response };
    }

    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    return { is401: false, data, response };
  };

  try {
    if (action === "search" || (action === "list" && q)) {
      // Search messages with query q
      const queryStr = q ? `&q=${encodeURIComponent(q)}` : "";
      const { is401, data, response } = await fetchGmail(
        `/messages?maxResults=10${queryStr}`
      );
      if (is401) {
        return jsonRes(200, { ok: false, estado: "token_expirado", error: "Token do Gmail expirado" });
      }
      if (!response.ok) {
        return jsonRes(response.status, { ok: false, error: data?.error?.message || "Erro no Gmail API" });
      }

      const rawMessages = data?.messages || [];
      const messages = await Promise.all(
        rawMessages.map(async (msg: { id: string }) => {
          const detailRes = await fetchGmail(`/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`);
          if (detailRes.is401 || !detailRes.data) {
            return { id: msg.id, snippet: "", from: "", subject: "", date: "" };
          }
          const headers = detailRes.data.payload?.headers || [];
          return {
            id: msg.id,
            threadId: detailRes.data.threadId,
            snippet: detailRes.data.snippet || "",
            from: getHeader(headers, "From"),
            subject: getHeader(headers, "Subject"),
            date: getHeader(headers, "Date"),
          };
        })
      );

      return jsonRes(200, { ok: true, messages, q });
    }

    if (action === "list") {
      // List messages (maxResults=10)
      const { is401, data, response } = await fetchGmail(`/messages?maxResults=10`);
      if (is401) {
        return jsonRes(200, { ok: false, estado: "token_expirado", error: "Token do Gmail expirado" });
      }
      if (!response.ok) {
        return jsonRes(response.status, { ok: false, error: data?.error?.message || "Erro no Gmail API" });
      }

      const rawMessages = data?.messages || [];
      const messages = await Promise.all(
        rawMessages.map(async (msg: { id: string }) => {
          const detailRes = await fetchGmail(`/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`);
          if (detailRes.is401 || !detailRes.data) {
            return { id: msg.id, snippet: "", from: "", subject: "", date: "" };
          }
          const headers = detailRes.data.payload?.headers || [];
          return {
            id: msg.id,
            threadId: detailRes.data.threadId,
            snippet: detailRes.data.snippet || "",
            from: getHeader(headers, "From"),
            subject: getHeader(headers, "Subject"),
            date: getHeader(headers, "Date"),
          };
        })
      );

      return jsonRes(200, { ok: true, messages });
    }

    if (action === "read") {
      if (!id) {
        return jsonRes(400, { ok: false, error: "id e obrigatorio para read" });
      }
      const { is401, data, response } = await fetchGmail(`/messages/${id}?format=full`);
      if (is401) {
        return jsonRes(200, { ok: false, estado: "token_expirado", error: "Token do Gmail expirado" });
      }
      if (!response.ok) {
        return jsonRes(response.status, { ok: false, error: data?.error?.message || "Erro ao ler e-mail" });
      }

      const headers = data.payload?.headers || [];
      const bodyText = extractBody(data.payload) || data.snippet || "";

      return jsonRes(200, {
        ok: true,
        id: data.id,
        threadId: data.threadId,
        from: getHeader(headers, "From"),
        subject: getHeader(headers, "Subject"),
        date: getHeader(headers, "Date"),
        snippet: data.snippet || "",
        body: bodyText,
      });
    }

    if (action === "draft") {
      const to = body.to || "";
      const subject = body.subject || "(sem assunto)";
      const emailBody = body.body || "";

      if (!to) {
        return jsonRes(400, { ok: false, error: "destinatario 'to' e obrigatorio" });
      }

      const rawEmail = `To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset="UTF-8"\r\n\r\n${emailBody}`;
      const rawBase64 = encodeBase64Url(rawEmail);

      const { is401, data, response } = await fetchGmail(`/drafts`, {
        method: "POST",
        body: JSON.stringify({ message: { raw: rawBase64 } }),
      });

      if (is401) {
        return jsonRes(200, { ok: false, estado: "token_expirado", error: "Token do Gmail expirado" });
      }
      if (!response.ok) {
        return jsonRes(response.status, { ok: false, error: data?.error?.message || "Erro ao criar rascunho" });
      }

      return jsonRes(200, {
        ok: true,
        id: data.id,
        messageId: data.message?.id,
        draft: data,
      });
    }

    if (action === "send") {
      if (!id) {
        return jsonRes(400, { ok: false, error: "id do draft e obrigatorio para send" });
      }

      const { is401, data, response } = await fetchGmail(`/drafts/send`, {
        method: "POST",
        body: JSON.stringify({ id }),
      });

      if (is401) {
        return jsonRes(200, { ok: false, estado: "token_expirado", error: "Token do Gmail expirado" });
      }
      if (!response.ok) {
        return jsonRes(response.status, { ok: false, error: data?.error?.message || "Erro ao enviar rascunho" });
      }

      return jsonRes(200, {
        ok: true,
        id: data.id,
        send: data,
      });
    }

    return jsonRes(400, { ok: false, error: `acao desconhecida '${action}'` });
  } catch (err: any) {
    return jsonRes(500, { ok: false, error: String(err?.message || err) });
  }
});
