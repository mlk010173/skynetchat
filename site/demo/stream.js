/* Leitor de streaming compatível com o protocolo do Vercel AI SDK
   (0: texto, 2: dados, 3: erro, d: fim) e com o formato JSON antigo. */
(function () {
  if (window.SKYStream) return;
  window.SKYStream = {
    ler: async function (res, cb) {
      cb = cb || {};
      var chamar = function (f, a, b) { if (typeof f === "function") { try { f(a, b); } catch (e) {} } };
      var reader = res.body.getReader(), dec = new TextDecoder(), buf = "", texto = "";
      for (;;) {
        var passo = await reader.read();
        if (passo.done) break;
        buf += dec.decode(passo.value, { stream: true });
        var blocos = buf.split("\n\n");
        buf = blocos.pop() || "";
        for (var i = 0; i < blocos.length; i++) {
          var linhas = blocos[i].split("\n");
          for (var j = 0; j < linhas.length; j++) {
            var l = linhas[j].trim();
            if (l.indexOf("data:") !== 0) continue;
            var corpo = l.slice(5).trim();
            if (!corpo || corpo === "[DONE]") continue;
            var frame = /^([0-9a-d]):([\s\S]*)$/.exec(corpo);
            if (frame) {
              var tipo = frame[1], val;
              try { val = JSON.parse(frame[2]); } catch (e) { continue; }
              if (tipo === "0") { if (typeof val === "string") { texto += val; chamar(cb.onTexto, texto, val); } }
              else if (tipo === "2") { if (Array.isArray(val)) for (var k = 0; k < val.length; k++) chamar(cb.onDado, val[k]); }
              else if (tipo === "3") chamar(cb.onErro, typeof val === "string" ? val : JSON.stringify(val));
              else if (tipo === "d") chamar(cb.onFim, val || {});
              else if (tipo === "a") chamar(cb.onDado, val);
              continue;
            }
            var d;
            try { d = JSON.parse(corpo); } catch (e) { continue; }
            if (d.delta) { texto += d.delta; chamar(cb.onTexto, texto, d.delta); }
            if (d.raciocinio) chamar(cb.onDado, { tipo: "raciocinio", texto: d.raciocinio });
            if (d.tool) chamar(cb.onDado, { tipo: "etapa", ferramenta: d.tool, estado: d.status, fontes: d.fontes, erro: d.erro });
            if (d.modelo) chamar(cb.onDado, { tipo: "modelo", modelo: d.modelo, tentativas: d.tentativas });
            if (d.done) chamar(cb.onFim, d);
            if (d.ok === false && d.error) chamar(cb.onErro, d.error);
          }
        }
      }
      return texto;
    }
  };
})();
