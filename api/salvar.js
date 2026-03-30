export const config = { api: { bodyParser: true } };

async function kvGet(key) {
  const r = await fetch(`${process.env.KV_REST_API_URL}/get/${key}`, {
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` }
  });
  const d = await r.json();
  return d.result ? JSON.parse(d.result) : null;
}

async function kvSet(key, value) {
  await fetch(`${process.env.KV_REST_API_URL}/set/${key}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    body: JSON.stringify(value)
  });
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const pedidos = await kvGet("bc_pedidos") || [];
    return res.status(200).json({ pedidos });
  }

  if (req.method === "POST") {
    const pedido = req.body;
    const pedidos = await kvGet("bc_pedidos") || [];
    pedidos.push(pedido);
    await kvSet("bc_pedidos", JSON.stringify(pedidos));
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
