export const config = { api: { bodyParser: true } };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const pedido = req.body;

    // Busca pedidos existentes
    const pedidos = JSON.parse(process.env.BC_PEDIDOS || "[]");
    pedidos.push(pedido);

    // Salva no ambiente (Vercel KV seria ideal, mas por ora usamos env)
    // O frontend lê do localStorage, então retornamos o pedido para ele salvar
    return res.status(200).json({ ok: true, pedido });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
