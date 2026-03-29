import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const config = { api: { bodyParser: true } };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const body = req.body;

    // Identifica tipo de mensagem Z-API
    const type = body?.type;
    if (type !== "ReceivedCallback") return res.status(200).json({ ok: true, skip: true });

    const msg = body?.body;
    const phone = body?.phone || "";
    const sender = body?.senderName || body?.pushname || phone;
    const groupId = body?.chatId || "";
    const isGroup = groupId.includes("@g.us");
    if (!isGroup) return res.status(200).json({ ok: true, skip: "not group" });

    // Identifica grupo
    const cfg = JSON.parse(process.env.BC_CONFIG || "{}");
    let grupo = "desconhecido";
    if (cfg.grupoColetivino && groupId === cfg.grupoColetivino) grupo = "Coletivino";
    if (cfg.grupoVip && groupId === cfg.grupoVip) grupo = "VIP";

    // Busca campanhas ativas
    const campanhas = JSON.parse(process.env.BC_CAMPANHAS || "[]")
      .filter(c => c.status === "ativa");
    if (!campanhas.length) return res.status(200).json({ ok: true, skip: "no campaigns" });

    const campanhasStr = campanhas.map(c => `- ${c.nome} (Marca: ${c.marca})`).join("\n");

    // Monta conteúdo para IA
    const content = [];

    // Adiciona imagem se houver
    if (body?.image?.imageUrl || body?.image?.base64) {
      if (body.image.base64) {
        content.push({
          type: "image",
          source: { type: "base64", media_type: "image/jpeg", data: body.image.base64 }
        });
      } else {
        content.push({
          type: "image",
          source: { type: "url", url: body.image.imageUrl }
        });
      }
    }

    // Texto da mensagem
    const texto = body?.text?.message || body?.listResponseMessage?.title || "";
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

    // Monta pedido
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

    // Salva via API interna
    await fetch(`${process.env.VERCEL_URL ? "https://" + process.env.VERCEL_URL : ""}/api/salvar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pedido)
    });

    return res.status(200).json({ ok: true, pedido });

  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
}
