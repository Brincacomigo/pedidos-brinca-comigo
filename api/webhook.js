import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const config = { api: { bodyParser: true } };

async function kvSet(key, value) {
  await fetch(`${process.env.KV_REST_API_URL}/set/${key}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    body: JSON.stringify(value)
  });
}

async function kvGet(key) {
  const r = await fetch(`${process.env.KV_REST_API_URL}/get/${key}`, {
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` }
  });
  const d = await r.json();
  return d.result ? JSON.parse(d.result) : null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const body = req.body;
    console.log("WEBHOOK RECEBIDO:", JSON.stringify(body).substring(0, 500));
    console.log("type recebido:", body?.type);
if (body?.type !== "ReceivedCallback") return res.status(200).json({ ok: true, skip: true });

    const phone = body?.phone || "";
    const sender = body?.senderName || body?.pushname || phone;
    const groupId = body?.chatId || body?.phone || "";
    console.log("chatId:", groupId, "type:", body?.type);
if (!groupId || (!groupId.includes("@g.us") && !groupId.includes("-group"))) return res.status(200).json({ ok: true, skip: "not group" }); 
    
    const cfg = await kvGet("bc_config") || {};
    let grupo = "Coletivino";
    if (cfg.grupoVip && groupId === cfg.grupoVip) grupo = "VIP";

    let campanhasRaw = await kvGet("bc_campanhas") || [];
if (typeof campanhasRaw === "string") campanhasRaw = JSON.parse(campanhasRaw);
const campanhas = campanhasRaw.filter(c => c.status === "ativa");
    if (!campanhas.length) return res.status(200).json({ ok: true, skip: "no campaigns" });

    const campanhasStr = campanhas.map(c => `- ${c.nome} (Marca: ${c.marca})`).join("\n");

    const content = [];

    if (body?.image?.imageUrl) {
      content.push({ type: "image", source: { type: "url", url: body.image.imageUrl } });
    }

    const texto = body?.text?.message || "";
    content.push({
      type: "text",
      text: `Cliente: ${sender}
Grupo: ${grupo}
Mensagem: ${texto}

Campanhas ativas:
${campanhasStr}

Analise a mensagem e imagem (se houver) e extraia o pedido.
Retorne SOMENTE JSON sem markdown:
{
  "ehPedido": true,
  "campanha": "nome exato da campanha ou null",
  "itens": [
    {
      "descricao": "descrição do produto",
      "cor": "cor ou null",
      "tamanho": "tamanho ou null",
      "quantidade": 1
    }
  ]
}
Se não for pedido, retorne: {"ehPedido": false}`
    });

    const aiRes = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{ role: "user", content }]
    });

    const txt = aiRes.content.find(b => b.type === "text")?.text || "";
    const parsed = JSON.parse(txt.replace(/```json|```/g, "").trim());

    if (!parsed.ehPedido) return res.status(200).json({ ok: true, skip: "not order" });

    const pedido = {
      id: Date.now().toString(),
      cliente: sender,
      telefone: phone,
      grupo,
      campanha: parsed.campanha || campanhas[0]?.nome || "",
      itens: parsed.itens || [],
      status: "pendente",
      data: new Date().toLocaleString("pt-BR")
    };

    const pedidos = await kvGet("bc_pedidos") || [];
    pedidos.push(pedido);
    await kvSet("bc_pedidos", JSON.stringify(pedidos));

    return res.status(200).json({ ok: true, pedido });

  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
}
