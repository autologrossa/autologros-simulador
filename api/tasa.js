// AUTOLOGROS · Simulador — lectura y actualización de la tasa
// Variables de entorno en Vercel: SUPABASE_URL, SUPABASE_SERVICE_KEY, TASA_CODIGO
const limpio = v => String(v || "").trim().replace(/\/+$/, "");
const SB_URL = limpio(process.env.SUPABASE_URL);
const SB_KEY = String(process.env.SUPABASE_SERVICE_KEY || "").trim();
const CODIGO = String(process.env.TASA_CODIGO || "").trim();
const TABLA = "config_simulador";

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  // Diagnóstico: /api/tasa?diag=1 — no expone ninguna clave
  if (req.query && req.query.diag) {
    return res.status(200).json({
      url_cargada: !!SB_URL,
      url: SB_URL ? SB_URL.slice(0, 40) : null,
      clave_cargada: !!SB_KEY,
      largo_clave: SB_KEY.length,
      codigo_cargado: !!CODIGO,
      node: process.version,
      fetch: typeof fetch
    });
  }

  if (!SB_URL || !SB_KEY) {
    return res.status(500).json({ error: "Faltan variables de entorno en Vercel." });
  }
  if (typeof fetch !== "function") {
    return res.status(500).json({ error: "El runtime de Node no tiene fetch. Cambiá la versión de Node a 20 o 22 en Vercel." });
  }

  const url = `${SB_URL}/rest/v1/${TABLA}?id=eq.1`;
  const headers = {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    "Content-Type": "application/json"
  };

  const pedir = async (opts) => {
    const r = await fetch(opts.url, opts.init);
    const texto = await r.text();
    let datos = null;
    try { datos = JSON.parse(texto); } catch (e) { /* respuesta no JSON */ }
    return { ok: r.ok, status: r.status, datos, texto };
  };

  try {
    if (req.method === "GET") {
      const r = await pedir({ url: `${url}&select=tna_fija,tna_uva,iva,uva0,actualizado`, init: { headers } });
      if (!r.ok || !Array.isArray(r.datos)) {
        return res.status(502).json({ error: "No se pudo leer la tasa.", status: r.status, detalle: (r.texto || "").slice(0, 300) });
      }
      if (!r.datos.length) {
        return res.status(502).json({ error: "La tabla config_simulador está vacía: falta la fila con id = 1." });
      }
      return res.status(200).json(r.datos[0]);
    }

    if (req.method === "POST") {
      const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});

      if (!CODIGO || String(b.codigo || "") !== CODIGO) {
        await new Promise(ok => setTimeout(ok, 800)); // demora ante intentos repetidos
        return res.status(401).json({ error: "Código incorrecto." });
      }

      const n = v => (typeof v === "number" && isFinite(v) ? v : NaN);
      const datos = { tna_fija: n(b.tna_fija), tna_uva: n(b.tna_uva), iva: n(b.iva), uva0: n(b.uva0) };
      const valido = datos.tna_fija >= 0 && datos.tna_uva >= 0 &&
                     datos.iva >= 0 && datos.iva <= 100 && datos.uva0 > 0;
      if (!valido) return res.status(400).json({ error: "Hay un valor inválido." });

      datos.actualizado = new Date().toISOString();
      const r = await pedir({
        url,
        init: {
          method: "PATCH",
          headers: { ...headers, Prefer: "return=representation" },
          body: JSON.stringify(datos)
        }
      });
      if (!r.ok) {
        return res.status(502).json({ error: "No se pudo guardar.", status: r.status, detalle: (r.texto || "").slice(0, 300) });
      }
      const fila = Array.isArray(r.datos) ? r.datos[0] : r.datos;
      if (!fila) return res.status(502).json({ error: "No se actualizó ninguna fila." });
      return res.status(200).json(fila);
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Método no permitido." });
  } catch (e) {
    return res.status(500).json({ error: "Error del servidor.", detalle: String((e && e.message) || e).slice(0, 300) });
  }
};
