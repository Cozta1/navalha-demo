// Fluxo do cliente: serviços (1 ou mais) → profissional → dia/horário (ou lista de espera) → dados → confirmado
(async () => {
  if (!configurado) return avisoNaoConfigurado();

  const slug = new URLSearchParams(location.search).get("b");
  const app = $("#app"), carrinho = $("#carrinho");
  const st = { servicos: [], prof: null, data: null, slot: null };
  let barb, servicos, profs, jornadas, profServ, notas = { profissionais: {} }, sessao = null, promocoes = [];

  if (!slug) { app.innerHTML = `<div class="vazio">Link de agendamento incompleto. Peça o link certo para o estabelecimento.</div>`; return; }

  try {
    const { data, error } = await sb.from("barbearias").select("*").eq("slug", slug).maybeSingle();
    if (error) throw error;
    if (!data) { app.innerHTML = `<div class="vazio">Estabelecimento não encontrado.</div>`; return; }
    barb = data;
    const [s, p, j, ps, rv, ss, pm] = await Promise.all([
      sb.from("servicos").select("*").eq("barbearia_id", barb.id).eq("ativo", true).order("ordem").order("nome"),
      sb.from("profissionais").select("*").eq("barbearia_id", barb.id).eq("ativo", true).order("ordem").order("nome"),
      sb.from("jornadas").select("profissional_id,dia_semana").eq("barbearia_id", barb.id),
      sb.from("profissional_servicos").select("*").eq("barbearia_id", barb.id),
      sb.rpc("resumo_avaliacoes", { p_barbearia: barb.id }),
      sb.auth.getSession(),
      sb.from("promocoes").select("*").eq("barbearia_id", barb.id).eq("ativa", true),
    ]);
    for (const r of [s, p, j, ps]) if (r.error) throw r.error;
    servicos = s.data; profs = p.data; jornadas = j.data; profServ = ps.data;
    if (rv.data) notas = rv.data;
    sessao = ss.data?.session ?? null;
    const hojeP = hojeNoFuso(barb.fuso);
    promocoes = (pm.data || []).filter(x => !x.validade_ate || x.validade_ate >= hojeP);
  } catch (e) {
    app.innerHTML = `<div class="vazio">${esc(msgErro(e))}</div>`;
    return;
  }

  aplicarTema(barb);
  document.title = `Agendar · ${barb.nome}`;
  // capa da barbearia: foto, logo, nome, nota e endereço (o Marcaí só aparece no rodapé)
  const capa = barb.hero_url || (Array.isArray(barb.fotos) && barb.fotos[0]?.url) || null;
  const bairro = barb.endereco ? barb.endereco.split(/[,–-]/).map(x => x.trim()).filter(Boolean).slice(-2).join(", ") : "";
  $("#cabecalho").innerHTML = `<div class="capa-b ${capa ? "" : "sem-foto"}">
      <div class="foto" ${capa ? `style="background-image:url('${esc(capa)}')"` : ""}></div>
      <div class="capa-topo">${barb.site_url ? `<a class="voltar-site" href="${esc(barb.site_url)}">← Site</a>` : "<span></span>"}
        <div class="acoes-topo"><span id="tema"></span><a class="conta-link" href="conta.html?b=${encodeURIComponent(slug)}">${sessao ? "Minha conta" : "Entrar"}</a></div></div>
      <div class="capa-info">${barb.logo_url ? `<img class="logo" src="${esc(barb.logo_url)}" alt="">` : ""}
        <div class="nome"><h1>${esc(barb.nome)}</h1>
          <div class="meta">${notas.total ? `<span class="chip"><span class="estrela">★</span> ${String(notas.media).replace(".", ",")} · ${notas.total} avaliações</span>` : ""}${bairro ? `<span class="chip">📍 ${esc(bairro)}</span>` : ""}</div></div></div>
    </div>`;
  $("#tema").replaceWith(botaoTema());

  mostrarMeus();

  const passo = n => {
    $$("#passos span").forEach((s, i) => s.classList.toggle("on", i < n));
    if (n > 1 && $("#passos").getBoundingClientRect().top < 0) $("#passos").scrollIntoView({ behavior: "smooth" });
  };
  const iniciais = nome => nome.split(/\s+/).map(p => p[0]).slice(0, 2).join("").toUpperCase();
  const avatar = p => p.foto_url ? `<img src="${esc(p.foto_url)}" alt="">` : esc(iniciais(p.nome));

  // preço/duração de um serviço para um profissional (ou padrão)
  const itemDoProf = (s, pid) => {
    const ps = profServ.find(x => x.servico_id === s.id && x.profissional_id === pid);
    return { ...s, preco: ps?.preco ?? s.preco, duracao_min: ps?.duracao_min ?? s.duracao_min };
  };
  const fazTodos = pid => st.servicos.every(s => profServ.some(x => x.servico_id === s.id && x.profissional_id === pid));
  const profsAptos = () => profs.filter(p => fazTodos(p.id));
  const totais = pid => {
    const itens = st.servicos.map(s => pid ? itemDoProf(s, pid) : s);
    return { preco: somaPreco(itens), duracao: somaDuracao(itens) };
  };

  function atualizarCarrinho(acao) {
    if (!st.servicos.length || !acao) { carrinho.classList.add("hidden"); return; }
    const t = totais(st.prof?.id);
    carrinho.innerHTML = `<div class="wrap estreito">
      <div><span class="sub">${st.servicos.length} serviço${st.servicos.length > 1 ? "s" : ""} · ${fmtDuracao(t.duracao)}</span><br><b>${dinheiro(t.preco)}</b></div>
      <button class="btn btn-blue" id="seguir">${acao}</button></div>`;
    carrinho.classList.remove("hidden");
    $("#seguir").onclick = () => profsAptos().length > 1 ? telaProf() : (st.prof = profsAptos()[0] || null, telaHorario());
  }

  // ---------- 1. serviços ----------
  function telaServico() {
    passo(1);
    if (!servicos.length) { app.innerHTML = `<div class="vazio">Nenhum serviço disponível para agendamento online.</div>`; return; }
    const DS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
    const avisoPromo = promocoes.map(x => `<div class="promo-aviso">🔥 <b>${esc(x.nome)}</b> · ${x.dias_semana.slice().sort().map(d => DS[d]).join(", ")}, ${x.hora_inicio.slice(0, 5)}–${x.hora_fim.slice(0, 5)} ·
      <b>${String(Number(x.desconto_pct)).replace(".", ",")}% off</b>${x.servico_ids?.length ? " em " + esc(servicos.filter(sv => x.servico_ids.includes(sv.id)).map(sv => sv.nome).join(", ")) : ""}</div>`).join("");
    app.innerHTML = `<section class="etapa anima-etapa">${avisoPromo}<h2>Escolha os <em>serviços</em></h2><p class="sub">Pode marcar mais de um</p>
      <div class="opcoes cascata">${servicos.map(s => `
        <button class="opcao ${st.servicos.some(x => x.id === s.id) ? "sel" : ""}" data-id="${s.id}">
          <span class="check">✓</span>
          <div><b>${esc(s.nome)}</b><span class="desc">${esc(s.descricao || "")}</span></div>
          <div class="preco">${dinheiro(s.preco)}<small>${fmtDuracao(s.duracao_min)}</small></div>
        </button>`).join("")}</div></section>`;
    $$(".opcao", app).forEach(b => b.onclick = () => {
      const s = servicos.find(x => x.id === b.dataset.id);
      const i = st.servicos.findIndex(x => x.id === s.id);
      if (i >= 0) st.servicos.splice(i, 1);
      else if (st.servicos.length >= 5) return toast("No máximo 5 serviços por visita.", "erro");
      else st.servicos.push(s);
      b.classList.toggle("sel", i < 0);
      if (st.servicos.length && !profsAptos().length) {
        toast("Nenhum profissional faz todos esses serviços juntos. Agende em visitas separadas.", "erro");
        st.servicos.splice(st.servicos.indexOf(s), 1); b.classList.remove("sel");
      }
      atualizarCarrinho("Continuar →");
    });
    atualizarCarrinho("Continuar →");
  }

  // ---------- 2. profissional ----------
  function telaProf() {
    passo(2); atualizarCarrinho(null);
    const aptos = profsAptos();
    app.innerHTML = `<section class="etapa anima-etapa"><h2>Com <em>quem</em>?</h2><p class="sub">${esc(st.servicos.map(s => s.nome).join(" + "))}</p>
      <div class="opcoes cascata">
        <button class="opcao" data-id=""><div class="av">✦</div><div><b>Sem preferência</b><span class="desc">Primeiro profissional livre</span></div></button>
        ${aptos.map(p => { const t = totais(p.id), nt = notas.profissionais?.[p.id]; return `<button class="opcao" data-id="${p.id}"><div class="av">${avatar(p)}</div><div><b>${esc(p.nome)}</b>${nt ? `<span class="desc">★ ${String(nt.media).replace(".", ",")} · ${nt.total} avaliaç${nt.total > 1 ? "ões" : "ão"}</span>` : ""}</div>
          <div class="preco">${dinheiro(t.preco)}<small>${fmtDuracao(t.duracao)}</small></div></button>`; }).join("")}
      </div><button class="voltar">← trocar serviços</button></section>`;
    $$(".opcao", app).forEach(b => b.onclick = () => { st.prof = aptos.find(p => p.id === b.dataset.id) || null; telaHorario(); });
    $(".voltar", app).onclick = telaServico;
  }

  // ---------- 3. dia e horário ----------
  function telaHorario() {
    passo(3); atualizarCarrinho(null);
    const hoje = hojeNoFuso(barb.fuso);
    const ids = st.prof ? [st.prof.id] : profsAptos().map(p => p.id);
    const diasTrab = new Set(jornadas.filter(j => ids.includes(j.profissional_id)).map(j => j.dia_semana));
    const dias = Array.from({ length: barb.dias_abertos + 1 }, (_, i) => somaDias(hoje, i));
    app.innerHTML = `<section class="etapa anima-etapa">
      <h2><em>Quando</em> fica bom?</h2>
      <p class="sub">${esc(st.servicos.map(s => s.nome).join(" + "))}${st.prof ? " · " + esc(st.prof.nome) : ""}</p>
      <div class="dias">${dias.map(d => {
        const f = fmtDataCurta(d);
        return `<button class="dia" data-d="${d}" ${diasTrab.has(diaSemana(d)) ? "" : "disabled"}><small>${f.semana}</small><b>${f.dia}</b><small>${f.mes}</small></button>`;
      }).join("")}</div>
      <div id="horas"></div>
      <button class="voltar">← voltar</button></section>`;
    $(".voltar", app).onclick = () => profsAptos().length > 1 ? telaProf() : telaServico();
    const botoes = $$(".dia:not(:disabled)", app);
    botoes.forEach(b => b.onclick = () => escolherDia(b.dataset.d));
    const inicial = (st.data && botoes.find(b => b.dataset.d === st.data)) || botoes[0];
    if (inicial) escolherDia(inicial.dataset.d);
    else $("#horas").innerHTML = `<div class="vazio">Sem dias disponíveis.</div>`;
  }

  async function escolherDia(d) {
    st.data = d;
    $$(".dia", app).forEach(b => b.classList.toggle("sel", b.dataset.d === d));
    $(`.dia[data-d="${d}"]`, app)?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    const box = $("#horas");
    box.innerHTML = `<p class="carregando">Buscando horários…</p>`;
    const { data, error } = await sb.rpc("horarios_disponiveis", {
      p_barbearia: barb.id, p_servicos: st.servicos.map(s => s.id), p_data: d, p_profissional: st.prof?.id ?? null,
    });
    if (st.data !== d) return; // usuário trocou de dia enquanto carregava
    if (error) { box.innerHTML = `<div class="vazio">${esc(msgErro(error))}</div>`; return; }
    const unicos = new Map();
    for (const h of data) if (!unicos.has(h.inicio)) unicos.set(h.inicio, h);
    if (!unicos.size) return telaEspera(box, d);
    const turnos = [["Manhã", 0, 12], ["Tarde", 12, 18], ["Noite", 18, 24]];
    const horaDe = iso => Number(fmtHora(iso, barb.fuso).slice(0, 2));
    box.innerHTML = turnos.map(([nome, de, ate]) => {
      const lista = [...unicos.values()].filter(h => horaDe(h.inicio) >= de && horaDe(h.inicio) < ate);
      return lista.length ? `<div class="turno"><h4>${nome}</h4><div class="horas cascata">${lista.map(h =>
        `<button class="hora ${h.promocao ? "promo" : ""}" data-i="${h.inicio}">${fmtHora(h.inicio, barb.fuso)}${h.promocao ? `<small>−${Math.round((1 - h.preco / h.preco_cheio) * 100)}%</small>` : ""}</button>`).join("")}</div></div>` : "";
    }).join("") + `<p class="small muted mt">Não achou um bom horário? <button class="link-btn" id="lev">Entrar na lista de espera</button></p>`;
    $$(".hora", box).forEach(b => b.onclick = () => { st.slot = unicos.get(b.dataset.i); telaDados(); });
    $("#lev").onclick = () => telaEspera(box, d, true);
  }

  // ---------- lista de espera ----------
  function telaEspera(box, d, voluntario = false) {
    const salvo = guarda.ler("navalha_cliente", {});
    const servico = st.servicos[0];
    box.innerHTML = `<div class="espera">
      <h3>${voluntario ? "Lista de espera" : "Dia cheio"}</h3>
      <p class="muted small" style="margin:6px 0 4px">Se abrir uma vaga em <b style="color:var(--text)">${esc(fmtDataLonga(dataHoraNoFuso(d, "12:00", barb.fuso), barb.fuso))}</b>, o estabelecimento te chama no WhatsApp${st.servicos.length > 1 ? ` (para ${esc(servico.nome)})` : ""}.</p>
      <form id="fe">
        <div class="periodos">${[["qualquer", "Qualquer hora"], ["manha", "Manhã"], ["tarde", "Tarde"], ["noite", "Noite"]].map(([v, t], i) =>
          `<label><input type="radio" name="per" value="${v}" ${i ? "" : "checked"}><span class="mono small">${t}</span></label>`).join("")}</div>
        <div class="grid2">
          <div class="campo"><label>Nome</label><input id="en" required minlength="2" maxlength="80" value="${esc(salvo.nome || "")}"></div>
          <div class="campo"><label>WhatsApp</label><input id="et" required inputmode="tel" value="${esc(fmtTelefone(salvo.telefone || ""))}" placeholder="(32) 99999-9999"></div>
        </div>
        <button class="btn btn-blue btn-block">Entrar na lista</button>
        <p class="erro hidden" id="eerr"></p>
      </form></div>`;
    mascaraTelefone($("#et"));
    $("#fe").onsubmit = async ev => {
      ev.preventDefault();
      const err = $("#eerr");
      const { error } = await sb.rpc("entrar_lista_espera", {
        p_barbearia: barb.id, p_servico: servico.id, p_profissional: st.prof?.id ?? null, p_data: d,
        p_periodo: new FormData(ev.target).get("per"), p_nome: $("#en").value, p_telefone: soDigitos($("#et").value),
      });
      if (error) { err.textContent = msgErro(error); err.classList.remove("hidden"); return; }
      guarda.gravar("navalha_cliente", { ...salvo, nome: $("#en").value.trim(), telefone: soDigitos($("#et").value) });
      box.innerHTML = `<div class="espera"><h3>Você está na lista ✓</h3><p class="muted small mt">Se abrir vaga, o estabelecimento te chama no WhatsApp. Enquanto isso, dá para escolher outro dia acima.</p></div>`;
    };
  }

  // ---------- 4. dados do cliente ----------
  function telaDados() {
    passo(4);
    const salvo = { ...guarda.ler("navalha_cliente", {}), ...(sessao ? { email: sessao.user.email } : {}) };
    const prof = profs.find(p => p.id === st.slot.profissional_id);
    const itens = st.servicos.map(s => itemDoProf(s, prof.id));
    let cupom = null; // { codigo, desconto, descricao }
    app.innerHTML = `<section class="etapa anima-etapa">
      <h2>Tudo <em>certo</em>?</h2>
      <div class="resumo">
        ${itens.map(i => `<div><span>${esc(i.nome)}</span><span class="mono">${dinheiro(i.preco)}</span></div>`).join("")}
        ${st.slot.promocao ? `<div class="promo-linha"><span>🔥 ${esc(st.slot.promocao)}</span><span class="mono">− ${dinheiro(st.slot.preco_cheio - st.slot.preco)}</span></div>` : ""}
        <div class="promo-linha hidden" id="cupom-linha"></div>
        <div class="total"><span>Total · ${fmtDuracao(st.slot.duracao_min)}</span><span id="total-final">${dinheiro(st.slot.preco)}</span></div>
        <div><span>Profissional</span><b>${esc(prof.nome)}</b></div>
        <div><span>Quando</span><b style="text-align:right">${esc(fmtDataLonga(st.slot.inicio, barb.fuso))}, ${fmtHora(st.slot.inicio, barb.fuso)}</b></div>
      </div>
      <form id="f">
        <div class="campo"><label for="nome">Nome</label><input id="nome" required minlength="2" maxlength="80" autocomplete="name" value="${esc(salvo.nome || "")}"></div>
        <div class="grid2">
          <div class="campo"><label for="tel">WhatsApp</label><input id="tel" required inputmode="tel" autocomplete="tel" placeholder="(32) 99999-9999" value="${esc(fmtTelefone(salvo.telefone || ""))}"></div>
          <div class="campo"><label for="email">E-mail (opcional)</label><input id="email" type="email" maxlength="120" autocomplete="email" placeholder="voce@email.com" value="${esc(salvo.email || "")}"></div>
        </div>
        <div class="campo"><label for="obs">Observação (opcional)</label><textarea id="obs" rows="2" maxlength="300"></textarea></div>
        <div class="campo"><label for="cupom">Cupom de desconto (opcional)</label>
          <div class="row" style="flex-wrap:nowrap"><input id="cupom" maxlength="20" autocapitalize="characters" placeholder="EX.: VOLTA10" style="text-transform:uppercase">
          <button type="button" class="btn btn-ghost" id="aplicar">Aplicar</button></div><p class="small hidden" id="cupom-msg"></p></div>
        <p class="muted small" style="margin-bottom:14px">Você pode cancelar ou trocar o horário até ${barb.cancelamento_horas}h antes, pelo link que aparece depois de confirmar.</p>
        <button class="btn btn-blue btn-block" id="conf">Confirmar agendamento</button>
        <p class="muted small aviso-dados">Seus dados são usados por ${esc(barb.nome)} para cuidar do seu horário. <a href="privacidade.html" target="_blank" rel="noopener">Política de Privacidade</a></p>
        <p class="erro hidden" id="err"></p>
      </form>
      <button class="voltar">← trocar horário</button></section>`;
    mascaraTelefone($("#tel"));
    $(".voltar", app).onclick = telaHorario;
    const msgCupom = (t, ok) => { const m = $("#cupom-msg"); m.textContent = t; m.style.color = ok ? "#86efac" : "#fca5a5"; m.classList.remove("hidden"); };
    const tirarCupom = () => { cupom = null; $("#cupom-linha").classList.add("hidden"); $("#total-final").textContent = dinheiro(st.slot.preco); };
    $("#cupom").oninput = () => { if (cupom) { tirarCupom(); $("#cupom-msg").classList.add("hidden"); } };
    $("#aplicar").onclick = async () => {
      const codigo = $("#cupom").value.trim().toUpperCase();
      if (!codigo) return;
      const { data, error } = await sb.rpc("validar_cupom", { p_barbearia: barb.id, p_codigo: codigo, p_telefone: soDigitos($("#tel").value), p_subtotal: st.slot.preco });
      if (error) { tirarCupom(); return msgCupom(msgErro(error), false); }
      cupom = { codigo, ...data };
      $("#cupom-linha").innerHTML = `<span>🏷️ Cupom ${esc(codigo)}</span><span class="mono">− ${dinheiro(data.desconto)}</span>`;
      $("#cupom-linha").classList.remove("hidden");
      $("#total-final").textContent = dinheiro(Math.max(0, st.slot.preco - data.desconto));
      msgCupom(`${data.descricao} aplicado.`, true);
    };
    $("#f").onsubmit = async ev => {
      ev.preventDefault();
      const btn = $("#conf"), err = $("#err");
      const nome = $("#nome").value.trim(), tel = soDigitos($("#tel").value), email = $("#email").value.trim();
      err.classList.add("hidden");
      if (tel.length < 10) { err.textContent = "Informe o WhatsApp com DDD."; err.classList.remove("hidden"); return; }
      btn.disabled = true; btn.textContent = "Confirmando…";
      const { data, error } = await sb.rpc("criar_agendamento", {
        p_barbearia: barb.id, p_servicos: st.servicos.map(s => s.id), p_profissional: st.slot.profissional_id,
        p_inicio: st.slot.inicio, p_nome: nome, p_telefone: tel, p_email: email || null, p_observacao: $("#obs").value,
        p_cupom: cupom?.codigo ?? null,
      });
      if (error) {
        btn.disabled = false; btn.textContent = "Confirmar agendamento";
        err.textContent = msgErro(error); err.classList.remove("hidden");
        if (/ocupado/.test(error.message)) setTimeout(telaHorario, 1800);
        if (/[Cc]upom|usou/.test(error.message)) tirarCupom();
        return;
      }
      guarda.gravar("navalha_cliente", { nome, telefone: tel, email });
      guarda.gravar("navalha_codigos", [data.codigo, ...guarda.ler("navalha_codigos", [])].slice(0, 10));
      telaSucesso(data.codigo, nome, prof);
    };
  }

  // ---------- 5. confirmado ----------
  function telaSucesso(codigo, nome, prof) {
    const fim = new Date(new Date(st.slot.inicio).getTime() + st.slot.duracao_min * 60000);
    const quando = `${fmtDataLonga(st.slot.inicio, barb.fuso)}, ${fmtHora(st.slot.inicio, barb.fuso)}`;
    const servs = st.servicos.map(s => s.nome).join(" + ");
    const linkGestao = new URL(`agendamento.html?c=${codigo}`, location.href).href;
    const msg = `Olá! Acabei de agendar pelo site:\n${servs} com ${prof.nome}\n${quando}\nNome: ${nome}`;
    app.innerHTML = `<section class="sucesso anima-etapa">
      <div class="check-anima"><svg viewBox="0 0 84 84" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="42" cy="42" r="38" opacity=".9"/><path d="M26 43l11 11 21-23"/></svg></div>
      <h2>Horário confirmado</h2>
      <p class="muted">${esc(servs)} com ${esc(prof.nome)}<br><b style="color:var(--text)">${esc(quando)}</b></p>
      <div class="opcoes mt2">
        <button class="btn btn-ghost" id="ics">Adicionar ao calendário</button>
        ${barb.whatsapp ? `<a class="btn btn-green" target="_blank" rel="noopener" href="${linkWhats(barb.whatsapp, msg)}">Avisar pelo WhatsApp</a>` : ""}
        <a class="btn btn-ghost" href="${esc(linkGestao)}">Ver, trocar ou cancelar</a>
      </div>
      <p class="muted small mt">Guarde este link para trocar ou cancelar até ${barb.cancelamento_horas}h antes.</p>
      <button class="voltar" id="novo">Fazer outro agendamento</button></section>`;
    $("#ics").onclick = () => baixarIcs({
      titulo: `${servs} · ${barb.nome}`, inicio: st.slot.inicio, fim,
      local: barb.endereco || barb.nome, descricao: `Com ${prof.nome}\nGerenciar: ${linkGestao}`,
    });
    $("#novo").onclick = () => { Object.assign(st, { servicos: [], prof: null, data: null, slot: null }); mostrarMeus(); telaServico(); };
  }

  // Próximos horários deste aparelho (códigos salvos localmente)
  async function mostrarMeus() {
    const box = $("#meus");
    const codigos = guarda.ler("navalha_codigos", []);
    if (!codigos.length) return box.classList.add("hidden");
    const res = await Promise.all(codigos.map(c => sb.rpc("consultar_agendamento", { p_codigo: c }).then(r => ({ c, a: r.data }))));
    const futuros = res.filter(r => r.a && r.a.barbearia.slug === slug && r.a.status === "confirmado" && new Date(r.a.inicio) > new Date());
    if (!futuros.length) return box.classList.add("hidden");
    box.innerHTML = `<p class="sub">Seus próximos horários</p>` + futuros.map(({ c, a }) =>
      `<a href="agendamento.html?c=${c}"><span>${esc(a.servico)} · ${esc(fmtDataLonga(a.inicio, barb.fuso))}, ${fmtHora(a.inicio, barb.fuso)}</span><span>›</span></a>`).join("");
    box.classList.remove("hidden");
  }

  const repetir = new URLSearchParams(location.search).get("repetir");
  if (repetir && /^[0-9a-f-]{36}$/i.test(repetir)) {
    const { data: a } = await sb.rpc("consultar_agendamento", { p_codigo: repetir });
    const ids = (a?.servicos || []).map(x => x.id);
    st.servicos = servicos.filter(x => ids.includes(x.id));
    if (st.servicos.length && profsAptos().length) {
      st.prof = profsAptos().find(p => p.id === a.profissional_id) || null;
      toast(`Repetindo: ${st.servicos.map(x => x.nome).join(" + ")}${st.prof ? " com " + st.prof.nome : ""}`);
      return telaHorario();
    }
    st.servicos = [];
  }
  telaServico();
})();
