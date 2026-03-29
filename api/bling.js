export const config = { api: { bodyParser: true } };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const pedido = req.body;
    const token = process.env.BLING_TOKEN;

    if (!token) return res.status(500).json({ error: "Token do Bling não configurado" });

    const resultados = [];

    for (const item of (pedido.itens || [])) {
      const nomeProduto = [
        item.descricao,
        item.cor,
        item.tamanho,
        pedido.campanha?.split(" ")[0] // marca
      ].filter(Boolean).join(" — ");

      // 1. Busca contato no Bling
      const contatoRes = await fetch(
        `https://www.bling.com.br/Api/v3/contatos?pesquisa=${encodeURIComponent(pedido.cliente)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const contatoData = await contatoRes.json();
      let contatoId = contatoData?.data?.[0]?.id || null;

      // 2. Cria contato se não existir
      if (!contatoId) {
        const novoContato = await fetch("https://www.bling.com.br/Api/v3/contatos", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            nome: pedido.cliente,
            telefone: pedido.telefone || "",
            tipoPessoa: "F"
          })
        });
        const novoData = await novoContato.json();
        contatoId = novoData?.data?.id || null;
      }

      // 3. Cria produto no Bling
      const produtoRes = await fetch("https://www.bling.com.br/Api/v3/produtos", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: nomeProduto,
          tipo: "P",
          situacao: "A",
          formato: "S"
        })
      });
      const produtoData = await produtoRes.json();
      const produtoId = produtoData?.data?.id || null;

      // 4. Cria pedido de compra no Bling
      if (produtoId && contatoId) {
        const pedidoRes = await fetch("https://www.bling.com.br/Api/v3/pedidos/compras", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            fornecedor: { id: contatoId },
            itens: [{
              produto: { id: produtoId },
              quantidade: item.quantidade || 1,
              valor: 0
            }],
            observacoes: `Pedido via WhatsApp — ${pedido.grupo} — ${pedido.campanha}`
          })
        });
        const pedidoData = await pedidoRes.json();
        resultados.push({ item: nomeProduto, pedidoId: pedidoData?.data?.id });
      }
    }

    return res.status(200).json({ ok: true, resultados });

  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
}
