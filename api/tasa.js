// AUTOLOGROS · Simulador — lectura y actualización de la tasa
// Variables de entorno en Vercel: SUPABASE_URL, SUPABASE_SERVICE_KEY, TASA_CODIGO
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const CODIGO = process.env.TASA_CODIGO;
const TABLA = "config_simulador";

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (!SB_URL || !SB_KEY) {
    return res.status(500).json({ error: "Faltan variables de entorno en Vercel." });
  }

  const url = `${SB_URL}/rest/v1/${TABLA}?id=eq.1`;
  const headers = {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    "Content-Type": "application/json"
  };

  try {
    if (req.method === "GET") {
      const r = await fetch(`${url}&select=tna_fija,tna_uva,iva,uva0,actualizado`, { headers });
      const j = await r.json();
      if (!r.ok || !Array.isArray(j) || !j.length) {
        return res.status(502).json({ error: "No se pudo leer la tasa." });
      }
      return res.status(200).json(j[0]);
    }

    if (req.method === "POST") {
      const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});

      if (!CODIGO || String(b.codigo || "") !== String(CODIGO)) {
        await new Promise(ok => setTimeout(ok, 800)); // demora ante intentos repetidos
        return res.status(401).json({ error: "Código incorrecto." });
      }

      const n = v => (typeof v === "number" && isFinite(v) ? v : NaN);
      const datos = {
        tna_fija: n(b.tna_fija),
        tna_uva: n(b.tna_uva),
        iva: n(b.iva),
        uva0: n(b.uva0)
      };
      const ok = datos.tna_fija >= 0 && datos.tna_uva >= 0 &&
                 datos.iva >= 0 && datos.iva <= 100 && datos.uva0 > 0;
      if (!ok) return res.status(400).json({ error: "Hay un valor inválido." });

      datos.actualizado = new Date().toISOString();
      const r = await fetch(url, {
        method: "PATCH",
        headers: { ...headers, Prefer: "return=representation" },
        body: JSON.stringify(datos)
      });
      const j = await r.json();
      if (!r.ok) return res.status(502).json({ error: "No se pudo guardar." });
      return res.status(200).json(Array.isArray(j) ? j[0] : j);
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Método no permitido." });
  } catch (e) {
    return res.status(500).json({ error: "Error del servidor." });
  }
};
