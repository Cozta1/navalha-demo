// Painel da plataforma (dono do Navalha): barbearias clientes, planos, assinaturas e pagamentos.
// Acesso: usuário cadastrado em public.plataforma_admins (ver README).
(async () => {
  if (!configurado) return avisoNaoConfigurado();
  const app = $("#app");
  const ST = { teste: "Teste", ativa: "Ativa", atrasada: "Atrasada", suspensa: "Suspensa", cancelada: "Cancelada" };
  let lista = [], planos = [], pedidos = [], filtro = { texto: "", status: "" };
  const RECURSOS = { relatorios_completos: "Relatórios completos", comissoes: "Comissões", marketing: "Marketing", estoque: "Estoque", emails: "E-mails" };
  const STP = { aberto: "Aberto", em_andamento: "Em andamento", feito: "Feito", recusado: "Recusado" };
  const exec = async (pr, ok) => { const { data, error } = await pr; if (error) { toast(msgErro(error), "erro"); throw error; } if (ok) toast(ok); return data; };
  const fmtData = d => d ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(String(d).slice(0, 10) + "T12:00:00Z")) : "—";

  function telaLogin(msg = "") {
    $("#sair").classList.add("hidden");
    app.innerHTML = `<div class="auth card"><h1>Admin</h1>
      <form id="f" class="mt"><div class="campo"><label>E-mail</label><input type="email" id="email" required autocomplete="email"></div>
      <div class="campo"><label>Senha</label><input type="password" id="senha" required autocomplete="current-password"></div>
      <button class="btn btn-blue btn-block">Entrar</button><p class="erro ${msg ? "" : "hidden"}" id="err">${esc(msg)}</p></form></div>`;
    $("#f").onsubmit = async ev => {
      ev.preventDefault();
      const { error } = await sb.auth.signInWithPassword({ email: $("#email").value.trim(), password: $("#senha").value });
      if (error) return telaLogin(msgErro(error));
      iniciar();
    };
  }
  $("#sair").onclick = async () => { await sb.auth.signOut(); telaLogin(); };

  async function iniciar() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return telaLogin();
    $("#sair").classList.remove("hidden");
    const r = await sb.rpc("admin_barbearias");
    if (r.error) { app.innerHTML = `<div class="auth card"><h2>Sem acesso</h2><p class="muted">A conta ${esc(session.user.email)} não é administradora da plataforma.</p></div>`; return; }
    lista = r.data;
    planos = (await sb.from("planos").select("*").order("ordem").order("preco_mensal")).data || [];
    pedidos = (await sb.from("pedidos_ajuste").select("*, barbearias(nome, whatsapp)").order("criado_em", { ascending: false }).limit(200)).data || [];
    render();
  }

  function render() {
    const conta = st => lista.filter(x => x.status === st).length;
    const mrr = lista.filter(x => ["ativa", "atrasada"].includes(x.status)).reduce((t, x) => t + Number(x.preco_mensal || 0), 0);
    const t = filtro.texto.toLowerCase();
    const vis = lista.filter(x => (!filtro.status || x.status === filtro.status) &&
      (!t || x.nome.toLowerCase().includes(t) || x.slug.includes(t) || (x.email_dono || "").toLowerCase().includes(t)));
    app.innerHTML = `<div class="kpis">
        <div class="card destaque"><span class="muted small">Receita mensal (MRR)</span><b>${dinheiro(mrr)}</b></div>
        <div class="card"><span class="muted small">Barbearias</span><b>${lista.length}</b></div>
        <div class="card"><span class="muted small">Em teste</span><b>${conta("teste")}</b></div>
        <div class="card"><span class="muted small">Ativas</span><b>${conta("ativa")}</b></div>
        <div class="card"><span class="muted small">Atrasadas</span><b>${conta("atrasada")}</b></div>
        <div class="card"><span class="muted small">Suspensas</span><b>${conta("suspensa") + conta("cancelada")}</b></div>
        <div class="card"><span class="muted small">Ajustes pendentes</span><b>${pedidos.filter(x => ["aberto", "em_andamento"].includes(x.status)).length}</b></div>
      </div>
      <div class="row space"><h2>Barbearias</h2>
        <div class="filtros"><input id="busca" placeholder="Buscar nome, link ou e-mail" value="${esc(filtro.texto)}">
          <select id="fst"><option value="">Todos os status</option>${Object.entries(ST).map(([k, v]) => `<option value="${k}" ${k === filtro.status ? "selected" : ""}>${v}</option>`).join("")}</select></div></div>
      <div class="tabela mt"><div class="tr th"><span>Barbearia</span><span>Plano</span><span>Status</span><span>Vence / teste até</span><span>Agend. 30d</span><span>Equipe</span><span></span></div>
        ${vis.map(x => `<div class="tr">
          <span><b>${esc(x.nome)}</b><br><span class="muted small">${esc(x.email_dono || "")} · <a href="site.html?b=${encodeURIComponent(x.slug)}" target="_blank" rel="noopener">site</a>${x.whatsapp ? ` · <a href="${linkWhats(x.whatsapp)}" target="_blank" rel="noopener">whats</a>` : ""}</span></span>
          <span>${esc(x.plano || "—")}${x.preco_mensal ? `<br><span class="mono small">${dinheiro(x.preco_mensal)}</span>` : ""}</span>
          <span><span class="tag ${x.status || "suspensa"}">${ST[x.status] || "Sem assinatura"}</span>${x.agenda_ligada ? "" : '<br><span class="small" style="color:#fca5a5">agenda off</span>'}</span>
          <span class="small">${x.status === "teste" ? "teste até " + fmtData(x.teste_ate) : fmtData(x.vencimento)}${x.ultimo_pagamento ? `<br><span class="muted">pago ${fmtData(x.ultimo_pagamento)}</span>` : ""}</span>
          <span class="mono">${x.agendamentos_30d}</span><span class="mono">${x.profissionais}</span>
          <span class="row"><button class="btn btn-ghost btn-sm" data-ed="${x.id}">Assinatura</button><button class="btn btn-blue btn-sm" data-pag="${x.id}">+ Pagamento</button></span>
        </div>`).join("") || `<div class="vazio">Nenhuma barbearia.</div>`}</div>
      <div class="card secao" style="padding:22px"><h2>Pedidos de ajuste</h2><p class="muted small">Pedidos de mudança nos sites. A cota do mês de cada plano é controlada pelo sistema.</p>
        ${pedidos.length ? pedidos.slice(0, 60).map(x => `<form class="pedido mt" data-ped="${x.id}">
          <div class="row space"><div><b>${esc(x.titulo)}</b> <span class="muted small">· ${esc(x.barbearias?.nome || "")} · ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(x.criado_em))}</span></div>
            <span class="tag ${{ aberto: "teste", em_andamento: "atrasada", feito: "ativa", recusado: "suspensa" }[x.status]}">${STP[x.status]}</span></div>
          <p class="small" style="margin:6px 0;white-space:pre-line">${esc(x.descricao)}</p>
          <div class="row" style="flex-wrap:nowrap"><select name="status" style="width:auto">${Object.entries(STP).map(([k, v]) => `<option value="${k}" ${k === x.status ? "selected" : ""}>${v}</option>`).join("")}</select>
            <input name="resposta" maxlength="1000" value="${esc(x.resposta || "")}" placeholder="Resposta para o cliente" class="grow" style="width:auto">
            ${x.barbearias?.whatsapp ? `<a class="btn btn-green btn-sm" target="_blank" rel="noopener" href="${linkWhats(x.barbearias.whatsapp, `Olá! Sobre o ajuste no site "${x.titulo}":`)}">Whats</a>` : ""}
            <button class="btn btn-ghost btn-sm">Salvar</button></div></form>`).join("") : `<p class="muted small mt">Nenhum pedido.</p>`}</div>
      <div class="secao"><h2>Planos</h2><p class="muted small">Aparecem na página inicial. Limite vazio = sem limite de profissionais.</p>
        ${[...planos, { id: "", nome: "", preco_mensal: "", max_profissionais: null, ativo: true, recursos: [], ajustes_mes: 1, descricao: "" }].map(p => `<form class="card plano-card mt" data-plano="${p.id}">
          <div class="plano">
            <div><label>${p.id ? "Nome" : "Novo plano"}</label><input name="nome" value="${esc(p.nome)}" required></div>
            <div><label>R$/mês</label><input name="preco_mensal" type="number" step="0.01" min="0" value="${p.preco_mensal}" required></div>
            <div><label>Máx. profissionais</label><input name="max_profissionais" type="number" min="1" value="${p.max_profissionais ?? ""}" placeholder="ilimitado"></div>
            <div><label>Ajustes/mês</label><input name="ajustes_mes" type="number" min="0" max="100" value="${p.ajustes_mes ?? 1}"></div>
            <label class="chk" style="margin:0"><input type="checkbox" name="ativo" ${p.ativo ? "checked" : ""}> à venda</label>
          </div>
          <div class="checks mt">${Object.entries(RECURSOS).map(([k, v]) => `<label class="chk"><input type="checkbox" name="rec" value="${k}" ${p.recursos?.includes(k) ? "checked" : ""}> ${v}</label>`).join("")}</div>
          <div class="row mt"><input name="descricao" maxlength="200" value="${esc(p.descricao || "")}" placeholder="Descrição para a página de vendas" class="grow" style="width:auto">
            <button class="btn ${p.id ? "btn-ghost" : "btn-blue"} btn-sm">${p.id ? "Salvar" : "Criar"}</button></div></form>`).join("")}
      </div>`;
    $("#busca").oninput = e => { filtro.texto = e.target.value; const pos = e.target.selectionStart; render(); $("#busca").focus(); $("#busca").setSelectionRange(pos, pos); };
    $("#fst").onchange = e => { filtro.status = e.target.value; render(); };
    $$("form.pedido").forEach(f => f.onsubmit = async ev => {
      ev.preventDefault();
      const d = Object.fromEntries(new FormData(f));
      try { await exec(sb.from("pedidos_ajuste").update({ status: d.status, resposta: d.resposta.trim() || null }).eq("id", f.dataset.ped), "Pedido atualizado."); iniciar(); } catch {}
    });
    $$("[data-ed]").forEach(b => b.onclick = () => modalAssinatura(lista.find(x => x.id === b.dataset.ed)));
    $$("[data-pag]").forEach(b => b.onclick = () => modalPagamento(lista.find(x => x.id === b.dataset.pag)));
    $$("form.plano-card").forEach(f => f.onsubmit = async ev => {
      ev.preventDefault();
      const fd = new FormData(f), d = Object.fromEntries(fd);
      const reg = { nome: d.nome.trim(), preco_mensal: Number(d.preco_mensal), max_profissionais: d.max_profissionais ? Number(d.max_profissionais) : null, ativo: !!d.ativo,
        ajustes_mes: Number(d.ajustes_mes) || 0, recursos: fd.getAll("rec"), descricao: (d.descricao || "").trim() || null };
      try {
        if (f.dataset.plano) await exec(sb.from("planos").update(reg).eq("id", f.dataset.plano), "Plano salvo.");
        else await exec(sb.from("planos").insert(reg), "Plano criado.");
        iniciar();
      } catch {}
    });
  }

  function janela(html, aoEnviar) {
    const m = document.createElement("div");
    m.className = "modal";
    m.innerHTML = `<div class="card"><form>${html}<div class="row mt" style="justify-content:flex-end"><button type="button" class="btn btn-ghost" data-fechar>Cancelar</button><button class="btn btn-blue">Salvar</button></div><p class="erro hidden"></p></form></div>`;
    m.addEventListener("click", e => { if (e.target === m || e.target.hasAttribute("data-fechar")) m.remove(); });
    $("form", m).onsubmit = async ev => {
      ev.preventDefault();
      try { await aoEnviar(m); m.remove(); iniciar(); } catch (e) { const er = $(".erro", m); er.textContent = msgErro(e); er.classList.remove("hidden"); }
    };
    document.body.appendChild(m);
  }

  function modalAssinatura(x) {
    janela(`<h2>${esc(x.nome)}</h2><p class="muted small">${esc(x.email_dono || "")}</p>
      <div class="grid2 mt">
        <div class="campo"><label>Plano</label><select id="a-plano"><option value="">—</option>${planos.map(p => `<option value="${p.id}" ${p.id === x.plano_id ? "selected" : ""}>${esc(p.nome)} · ${dinheiro(p.preco_mensal)}</option>`).join("")}</select></div>
        <div class="campo"><label>Status</label><select id="a-st">${Object.entries(ST).map(([k, v]) => `<option value="${k}" ${k === x.status ? "selected" : ""}>${v}</option>`).join("")}</select></div>
      </div>
      <div class="grid2">
        <div class="campo"><label>Teste até</label><input type="date" id="a-teste" value="${x.teste_ate || ""}"></div>
        <div class="campo"><label>Vencimento</label><input type="date" id="a-venc" value="${x.vencimento || ""}"></div>
      </div>
      <p class="muted small">Suspensa ou cancelada desliga a agenda online da barbearia. Atrasada mantém ligada (carência).</p>`,
    async m => {
      await exec(sb.from("assinaturas").upsert({ barbearia_id: x.id, plano_id: $("#a-plano", m).value || null, status: $("#a-st", m).value,
        teste_ate: $("#a-teste", m).value || null, vencimento: $("#a-venc", m).value || null, atualizado_em: new Date().toISOString() }), "Assinatura atualizada.");
    });
  }

  function modalPagamento(x) {
    const mes = new Date().toISOString().slice(0, 7);
    janela(`<h2>Pagamento · ${esc(x.nome)}</h2>
      <div class="grid2 mt">
        <div class="campo"><label>Valor (R$)</label><input type="number" step="0.01" min="0.01" id="p-val" value="${x.preco_mensal || ""}" required></div>
        <div class="campo"><label>Referência</label><input id="p-ref" value="${mes}" required maxlength="40"></div>
      </div>
      <div class="campo"><label>Forma</label><select id="p-forma"><option value="pix">Pix</option><option value="boleto">Boleto</option><option value="cartao">Cartão</option><option value="dinheiro">Dinheiro</option><option value="outro">Outro</option></select></div>
      <p class="muted small">Registra o pagamento, marca a assinatura como ativa e soma 1 mês ao vencimento.</p>`,
    async m => {
      const venc = await exec(sb.rpc("admin_registrar_pagamento", { p_barbearia: x.id, p_valor: Number($("#p-val", m).value), p_referencia: $("#p-ref", m).value.trim(), p_forma: $("#p-forma", m).value }));
      toast(`Pagamento registrado. Novo vencimento: ${fmtData(venc)}.`);
    });
  }

  iniciar();
})();
