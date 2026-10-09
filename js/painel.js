// Painel do dono/barbeiro: login, cadastro da barbearia, agenda, serviços, profissionais e configurações
(async () => {
  if (!configurado) return avisoNaoConfigurado();

  const app = $("#app");
  const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  const STATUS = { confirmado: "Confirmado", concluido: "Concluído", cancelado: "Cancelado", faltou: "Faltou" };
  let barb = null, servicos = [], profs = [], profServ = [];
  let papel = "dono", meuProf = null, assinatura = null, planosVenda = [];
  const RECURSO = { site: "Site próprio", marketing: "Marketing", estoque: "Estoque", relatorios_completos: "Relatórios completos", comissoes: "Comissões", emails: "E-mails automáticos" };
  // em teste ativo tudo liberado; depois, só o que o plano inclui
  const emTeste = () => assinatura?.status === "teste" && (!assinatura.teste_ate || assinatura.teste_ate >= hojeNoFuso(barb.fuso));
  const tem = r => emTeste() || !!assinatura?.planos?.recursos?.includes(r);
  const planoMinimo = r => planosVenda.find(pl => pl.recursos?.includes(r))?.nome || "superior";
  const conviteTok = new URLSearchParams(location.search).get("convite");
  const ehDono = () => papel === "dono";
  let aba = guarda.ler("navalha_aba", "inicio");
  let diaAgenda = null, filtroProf = "";
  let modoAgenda = guarda.ler("navalha_modo_agenda", "tempo"); // "tempo" (linha do tempo) ou "lista"
  let timerAgenda = null;

  const linkPublico = () => new URL(`agendar.html?b=${barb.slug}`, location.href).href;
  const linkAvaliar = codigo => new URL(`agendamento.html?c=${codigo}#avaliar`, location.href).href;
  const exec = async (promessa, okMsg) => {
    const { data, error } = await promessa;
    if (error) { toast(msgErro(error), "erro"); throw error; }
    if (okMsg) toast(okMsg);
    return data;
  };

  // =================== Autenticação ===================
  function telaLogin(modo = "entrar") {
    pararAgenda();
    document.body.classList.remove("logado");
    const cadastro = modo === "cadastrar", recuperar = modo === "recuperar";
    app.innerHTML = `<div class="auth card">
      <h1>${cadastro ? "Criar conta" : recuperar ? "Recuperar senha" : "Entrar"}</h1>
      ${conviteTok ? `<p class="small" style="text-align:center;margin-bottom:12px;color:#86efac">Você foi convidado para a equipe de uma barbearia. ${cadastro ? "Crie a conta" : "Entre"} com o <b>mesmo e-mail do convite</b>.</p>` : ""}
      <p class="muted small" style="text-align:center;margin-bottom:18px">${cadastro ? "Comece a receber agendamentos online da sua barbearia." : recuperar ? "Enviaremos um link para você criar uma nova senha." : "Acesse a agenda da sua barbearia."}</p>
      <form id="f">
        <div class="campo"><label>E-mail</label><input type="email" id="email" required autocomplete="email"></div>
        ${recuperar ? "" : `<div class="campo"><label>Senha</label><input type="password" id="senha" required minlength="6" autocomplete="${cadastro ? "new-password" : "current-password"}"></div>`}
        <button class="btn btn-blue btn-block" id="go">${cadastro ? "Criar conta" : recuperar ? "Enviar link" : "Entrar"}</button>
        <p class="erro hidden" id="err"></p>
      </form>
      <p class="small muted mt" style="text-align:center">
        ${cadastro ? `Já tem conta? <button class="link-btn" data-m="entrar">Entrar</button>`
          : `Novo por aqui? <button class="link-btn" data-m="cadastrar">Criar conta</button>`}
        ${modo === "entrar" ? ` · <button class="link-btn" data-m="recuperar">Esqueci a senha</button>` : ""}
      </p></div>`;
    $$("[data-m]", app).forEach(b => b.onclick = () => telaLogin(b.dataset.m));
    $("#f").onsubmit = async ev => {
      ev.preventDefault();
      const email = $("#email").value.trim(), senha = $("#senha")?.value, err = $("#err"), btn = $("#go");
      err.classList.add("hidden"); btn.disabled = true;
      const volta = location.href.split("#")[0].split("?")[0] + (conviteTok ? `?convite=${conviteTok}` : "");
      let r;
      if (cadastro) r = await sb.auth.signUp({ email, password: senha, options: { emailRedirectTo: volta } });
      else if (recuperar) r = await sb.auth.resetPasswordForEmail(email, { redirectTo: volta });
      else r = await sb.auth.signInWithPassword({ email, password: senha });
      btn.disabled = false;
      if (r.error) { err.textContent = msgErro(r.error); err.classList.remove("hidden"); return; }
      if (recuperar) { app.innerHTML = `<div class="auth card"><h2>Confira seu e-mail</h2><p class="muted">Se existir uma conta com ${esc(email)}, você vai receber o link para criar uma nova senha.</p></div>`; return; }
      if (cadastro && !r.data.session) { app.innerHTML = `<div class="auth card"><h2>Confirme seu e-mail</h2><p class="muted">Enviamos um link para <b>${esc(email)}</b>. Clique nele e depois volte aqui para entrar.</p></div>`; return; }
      iniciar();
    };
  }

  function telaNovaSenha() {
    app.innerHTML = `<div class="auth card"><h1>Nova senha</h1>
      <form id="f" class="mt"><div class="campo"><label>Nova senha</label><input type="password" id="senha" required minlength="6" autocomplete="new-password"></div>
      <button class="btn btn-blue btn-block">Salvar senha</button></form></div>`;
    $("#f").onsubmit = async ev => {
      ev.preventDefault();
      await exec(sb.auth.updateUser({ password: $("#senha").value }), "Senha alterada.");
      iniciar();
    };
  }

  const sair = async () => { await sb.auth.signOut(); barb = null; telaLogin(); };

  // =================== Cadastro da barbearia ===================
  function telaOnboarding() {
    app.innerHTML = `<div class="auth card" style="max-width:520px">
      <h1>Sua barbearia</h1>
      <p class="muted small" style="text-align:center;margin-bottom:18px">Leva 1 minuto. Dá para mudar tudo depois.</p>
      <form id="f">
        <div class="campo"><label>Nome da barbearia</label><input id="nome" required minlength="2" maxlength="80" placeholder="Ex.: Os Barbeiros JF"></div>
        <div class="campo"><label>Endereço do link de agendamento</label>
          <div class="row"><span class="muted small">agendar.html?b=</span><input id="slug" class="grow" required pattern="[a-z0-9][a-z0-9-]{1,38}[a-z0-9]" maxlength="40" style="width:auto"></div>
          <p class="muted small" style="margin-top:4px">Só letras minúsculas, números e hífen.</p></div>
        <div class="grid2">
          <div class="campo"><label>WhatsApp da barbearia</label><input id="whats" inputmode="tel" placeholder="(32) 99999-9999"></div>
          <div class="campo"><label>Seu nome (primeiro profissional)</label><input id="prof" required maxlength="60"></div>
        </div>
        <button class="btn btn-blue btn-block" id="go">Criar barbearia</button>
        <p class="erro hidden" id="err"></p>
      </form></div>`;
    mascaraTelefone($("#whats"));
    let slugManual = false;
    $("#slug").oninput = () => slugManual = true;
    $("#nome").oninput = () => {
      if (slugManual) return;
      $("#slug").value = $("#nome").value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
        .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
    };
    $("#f").onsubmit = async ev => {
      ev.preventDefault();
      const err = $("#err"), btn = $("#go");
      err.classList.add("hidden"); btn.disabled = true;
      const { error } = await sb.rpc("criar_barbearia", {
        p_nome: $("#nome").value, p_slug: $("#slug").value, p_whatsapp: $("#whats").value, p_profissional: $("#prof").value,
      });
      btn.disabled = false;
      if (error) { err.textContent = msgErro(error); err.classList.remove("hidden"); return; }
      toast("Barbearia criada! Agora cadastre seus serviços.");
      aba = "servicos";
      iniciar();
    };
  }

  // =================== Estrutura principal ===================
  async function iniciar() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return telaLogin();
    app.innerHTML = `<p class="carregando">Carregando…</p>`;
    if (conviteTok) {
      const { error } = await sb.rpc("aceitar_convite", { p_token: conviteTok });
      history.replaceState(null, "", location.pathname);
      if (error) toast(msgErro(error), "erro"); else toast("Convite aceito. Bem-vindo à equipe!");
    }
    try {
      const membros = await exec(sb.from("membros").select("barbearia_id,papel,profissional_id").eq("user_id", session.user.id).limit(1));
      if (!membros.length) return telaOnboarding();
      papel = membros[0].papel; meuProf = membros[0].profissional_id;
      if (!ehDono()) filtroProf = meuProf;
      barb = await exec(sb.from("barbearias").select("*").eq("id", membros[0].barbearia_id).single());
      assinatura = (await sb.from("assinaturas").select("*, planos(nome, preco_mensal, max_profissionais, profissionais_inclusos, preco_extra, fidelidade_meses, recursos, ajustes_mes)").eq("barbearia_id", barb.id).maybeSingle()).data;
      planosVenda = (await sb.from("planos").select("nome,preco_mensal,recursos").eq("ativo", true).order("preco_mensal")).data || [];
      await carregarCadastros();
    } catch { return; }
    aplicarTema(barb);
    document.body.classList.add("logado");
    diaAgenda ??= hojeNoFuso(barb.fuso);
    if (!MENU.some(i => i.a === aba && visivel(i))) aba = "inicio";
    const marca = `<div class="lat-marca">${barb.logo_url ? `<img src="${esc(barb.logo_url)}" alt="">` : `<span class="ini">${esc(barb.nome.trim()[0] || "N").toUpperCase()}</span>`}
      <div><b>${esc(barb.nome)}</b><small>${ehDono() ? "Painel do dono" : "Painel do barbeiro"}</small></div></div>`;
    const botao = (i, cls) => `<button class="${cls}" data-a="${i.a}"><span class="ic">${i.ic}</span>${cls === "nav-item" ? `${esc(rotulo(i))}${i.trava && !tem(i.trava) ? '<span class="cad">🔒</span>' : ""}` : `<span>${esc(i.curto || rotulo(i))}</span>`}</button>`;
    const grupos = [...new Set(MENU.map(i => i.g))];
    app.innerHTML = `<div class="shell">
      <aside class="lateral">${marca}
        ${grupos.map(g => { const itens = MENU.filter(i => i.g === g && visivel(i)); return itens.length ? `<div class="lat-grupo">${g}</div>${itens.map(i => botao(i, "nav-item")).join("")}` : ""; }).join("")}
        <div class="lat-pe">
          <a class="nav-item" href="${linkPublico()}" target="_blank" rel="noopener"><span class="ic">↗</span>Página de agendamento</a>
          <div class="row"><span id="temaLat"></span><button class="btn btn-ghost btn-sm" data-sair>Sair</button></div>
        </div>
      </aside>
      <div class="principal-wrap">
        <header class="topo-cel">${marca}<div class="row"><span id="temaCel"></span></div></header>
        <main class="principal">
          ${avisoAssinatura()}
          <div class="topo-tela"><div><h1 id="tituloTela"></h1><p class="sub" id="subTela"></p></div></div>
          <div id="conteudo"></div>
        </main>
      </div>
    </div>
    <nav class="barra-inf">${MENU.filter(i => i.barra && visivel(i)).map(i => botao(i, "")).join("")}
      <button data-mais><span class="ic">☰</span><span>Mais</span></button></nav>`;
    $("#temaLat").replaceWith(botaoTema());
    $("#temaCel").replaceWith(botaoTema());
    $$("[data-a]", app).forEach(b => b.onclick = () => abrir(b.dataset.a));
    $$("[data-sair]", app).forEach(b => b.onclick = sair);
    $("[data-mais]", app)?.addEventListener("click", folhaMais);
    abrir(aba);
  }

  // Menu: g = grupo do menu lateral; barra = aparece na barra inferior do celular
  const MENU = [
    { a: "inicio", ic: "◐", t: "Início", g: "Dia a dia", barra: 1, todos: 1 },
    { a: "agenda", ic: "📅", t: "Agenda", tb: "Minha agenda", curto: "Agenda", g: "Dia a dia", barra: 1, todos: 1 },
    { a: "caixa", ic: "💵", t: "Caixa", g: "Dia a dia", barra: 1, todos: 1 },
    { a: "clientes", ic: "👥", t: "Clientes", g: "Dia a dia", barra: 1, todos: 1 },
    { a: "relatorios", ic: "📊", t: "Relatórios", g: "Gestão" },
    { a: "marketing", ic: "📣", t: "Marketing", g: "Gestão", trava: "marketing" },
    { a: "avaliacoes", ic: "★", t: "Avaliações", g: "Gestão" },
    { a: "estoque", ic: "📦", t: "Estoque", g: "Gestão", trava: "estoque" },
    { a: "servicos", ic: "✂️", t: "Serviços", g: "Configurações" },
    { a: "profissionais", ic: "👤", t: "Profissionais", g: "Configurações" },
    { a: "equipe", ic: "🔑", t: "Equipe", g: "Configurações" },
    { a: "ajustes", ic: "🌐", t: "Meu site", g: "Configurações", trava: "site" },
    { a: "config", ic: "⚙️", t: "Barbearia", g: "Configurações" },
  ];
  const visivel = i => i.todos || ehDono();
  const rotulo = i => (!ehDono() && i.tb) || i.t;

  function folhaMais() {
    const f = document.createElement("div");
    f.className = "folha-mais";
    f.innerHTML = `<div><div class="alca"></div><div class="grade-mais">
      ${MENU.filter(i => !i.barra && visivel(i)).map(i => `<button data-a="${i.a}"><span class="ic">${i.ic}</span>${esc(i.t)}${i.trava && !tem(i.trava) ? " 🔒" : ""}</button>`).join("")}
      <a class="btn btn-ghost" style="grid-column:1/-1" href="${linkPublico()}" target="_blank" rel="noopener">↗ Ver página de agendamento</a>
      <button style="grid-column:1/-1" data-sair>Sair</button></div></div>`;
    f.onclick = e => { if (e.target === f) f.remove(); };
    $$("[data-a]", f).forEach(b => b.onclick = () => { f.remove(); abrir(b.dataset.a); });
    $("[data-sair]", f).onclick = () => { f.remove(); sair(); };
    document.body.appendChild(f);
  }

  function avisoAssinatura() {
    if (!assinatura) return "";
    const hoje = hojeNoFuso(barb.fuso);
    const dias = assinatura.teste_ate ? Math.round((new Date(assinatura.teste_ate + "T12:00:00Z") - new Date(hoje + "T12:00:00Z")) / 86400000) : null;
    const desligada = ["suspensa", "cancelada"].includes(assinatura.status) || (assinatura.status === "teste" && dias !== null && dias < 0);
    if (desligada) return `<div class="aviso-assin erro-a">⛔ <b>Agenda online desligada.</b> ${ehDono() ? "Sua assinatura está " + (assinatura.status === "teste" ? "com o teste vencido" : assinatura.status) + ". Os clientes não conseguem agendar pelo site. Fale com o suporte para reativar." : "Fale com o dono da barbearia."}</div>`;
    if (!ehDono()) return "";
    if (assinatura.status === "teste") return `<div class="aviso-assin">🎁 Teste grátis: <b>${dias === 0 ? "último dia" : dias + " dia" + (dias > 1 ? "s" : "") + " restante" + (dias > 1 ? "s" : "")}</b>. Depois disso, a agenda online pausa até a assinatura.</div>`;
    if (assinatura.status === "atrasada") return `<div class="aviso-assin erro-a">⚠️ <b>Mensalidade em atraso.</b> Regularize para não pausar a agenda online.</div>`;
    return "";
  }

  // Reduz a foto no navegador (economiza espaço e deixa o site leve) e envia para midia/<barbearia>/
  async function enviarImagem(arquivo, maxLado = 1600) {
    if (!/^image\/(jpeg|png|webp)$/.test(arquivo.type)) throw new Error("Use foto JPG, PNG ou WEBP.");
    const bmp = await createImageBitmap(arquivo);
    const esc_ = Math.min(1, maxLado / Math.max(bmp.width, bmp.height));
    const cv = Object.assign(document.createElement("canvas"), { width: Math.round(bmp.width * esc_), height: Math.round(bmp.height * esc_) });
    cv.getContext("2d").drawImage(bmp, 0, 0, cv.width, cv.height);
    const blob = await new Promise(r => cv.toBlob(r, "image/jpeg", 0.85));
    const caminho = `${barb.id}/${crypto.randomUUID()}.jpg`;
    const { error } = await sb.storage.from("midia").upload(caminho, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
    if (error) throw error;
    return sb.storage.from("midia").getPublicUrl(caminho).data.publicUrl;
  }

  async function carregarCadastros() {
    [servicos, profs, profServ] = await Promise.all([
      exec(sb.from("servicos").select("*").eq("barbearia_id", barb.id).order("ordem").order("nome")),
      exec(sb.from("profissionais").select("*").eq("barbearia_id", barb.id).order("ordem").order("nome")),
      exec(sb.from("profissional_servicos").select("*").eq("barbearia_id", barb.id)),
    ]);
  }

  function abrir(a) {
    aba = a; guarda.gravar("navalha_aba", a);
    const item = MENU.find(i => i.a === a) || MENU[0];
    $$(".nav-item, .barra-inf [data-a]").forEach(b => b.classList.toggle("on", b.dataset.a === a));
    $(".barra-inf [data-mais]")?.classList.toggle("on", !item.barra);
    $("#tituloTela").textContent = rotulo(item);
    $("#subTela").textContent = a === "inicio" ? fmtDataLonga(new Date().toISOString(), barb.fuso) : "";
    document.title = `${rotulo(item)} · ${barb.nome}`;
    pararAgenda();
    window.scrollTo(0, 0);
    (({ inicio: telaInicio, agenda: telaAgenda, servicos: telaServicos, clientes: telaClientes, avaliacoes: telaAvaliacoes, profissionais: telaProfissionais, caixa: telaCaixa, marketing: telaMarketing, estoque: telaEstoque, relatorios: telaRelatorios, config: telaConfig, equipe: telaEquipe, ajustes: tem("site") ? telaAjustes : () => telaBloqueada("site"),
       marketing: tem("marketing") ? telaMarketing : () => telaBloqueada("marketing"),
       estoque: tem("estoque") ? telaEstoque : () => telaBloqueada("estoque") })[a] || telaAgenda)();
  }

  // =================== Início ===================
  async function telaInicio() {
    const c = $("#conteudo"), hoje = hojeNoFuso(barb.fuso);
    if (!$("#inicio")) c.innerHTML = `<div id="inicio"><p class="carregando">Carregando…</p></div>`;
    const ini = dataHoraNoFuso(hoje, "00:00", barb.fuso).toISOString(), fim = dataHoraNoFuso(somaDias(hoje, 1), "00:00", barb.fuso).toISOString();
    const doProf = q => (ehDono() ? q : q.eq("profissional_id", meuProf));
    let ags, cmds, jor, esp, aval, produtos = [], pedidos = [], mk = null;
    try {
      [ags, cmds, jor, esp, aval, produtos, pedidos, mk] = await Promise.all([
        exec(doProf(sb.from("agendamentos").select("*").eq("barbearia_id", barb.id).gte("inicio", ini).lt("inicio", fim)).order("inicio")),
        exec(doProf(sb.from("comandas").select("total,status,profissional_id").eq("barbearia_id", barb.id).eq("status", "fechada").gte("fechada_em", ini).lt("fechada_em", fim))),
        exec(doProf(sb.from("jornadas").select("profissional_id,inicio,fim").eq("barbearia_id", barb.id).eq("dia_semana", diaSemana(hoje)))),
        exec(sb.from("lista_espera").select("id").eq("barbearia_id", barb.id).eq("data", hoje).eq("status", "aguardando")),
        exec(sb.rpc("resumo_avaliacoes", { p_barbearia: barb.id })),
        ehDono() && tem("estoque") ? exec(sb.from("produtos").select("nome,estoque,estoque_minimo,ativo").eq("barbearia_id", barb.id)) : [],
        ehDono() ? exec(sb.from("pedidos_ajuste").select("titulo,status,atualizado_em").eq("barbearia_id", barb.id).in("status", ["em_andamento", "feito"]).order("atualizado_em", { ascending: false }).limit(3)) : [],
        ehDono() && tem("marketing") ? exec(sb.rpc("marketing_clientes", { p_barbearia: barb.id, p_dias_sumido: 45 })) : null,
      ]);
    } catch { return; }
    if (aba !== "inicio" || !$("#inicio")) return;

    const agora = new Date(), minT = t => +t.slice(0, 2) * 60 + +t.slice(3, 5);
    const ativos = ags.filter(a => a.status === "confirmado" || a.status === "concluido");
    const recebido = cmds.reduce((t, x) => t + Number(x.total), 0);
    const previsto = ativos.reduce((t, a) => t + Number(a.preco), 0);
    const capacidade = jor.reduce((t, j) => t + minT(j.fim) - minT(j.inicio), 0);
    const ocupado = ativos.reduce((t, a) => t + (new Date(a.fim) - new Date(a.inicio)) / 60000, 0);
    const ocup = capacidade ? Math.min(100, Math.round(ocupado / capacidade * 100)) : null;
    const proximos = ags.filter(a => a.status === "confirmado" && new Date(a.fim) > agora).sort((x, y) => new Date(x.inicio) - new Date(y.inicio)).slice(0, 5);
    const restantes = ags.filter(a => a.status === "confirmado" && new Date(a.inicio) > agora).length;
    const nomeProf = id => profs.length > 1 && ehDono() ? " · " + esc(profs.find(p => p.id === id)?.nome || "") : "";
    const lembrete = a => `Olá, ${a.cliente_nome.split(" ")[0]}! Passando para lembrar do seu horário hoje às ${fmtHora(a.inicio, barb.fuso)} na ${barb.nome} (${a.servico_nome}). Te esperamos! 💈`;

    const alertas = [];
    if (esp.length) alertas.push({ ic: "⏳", t: `${esp.length} na lista de espera hoje`, s: "Abriu vaga? Chame pelo WhatsApp.", a: "agenda" });
    const baixos = produtos.filter(x => x.ativo && x.estoque <= x.estoque_minimo);
    if (baixos.length) alertas.push({ ic: "📦", t: `${baixos.length} produto${baixos.length > 1 ? "s" : ""} acabando`, s: baixos.slice(0, 3).map(x => x.nome).join(", "), a: "estoque" });
    const nivers = mk?.aniversariantes?.filter(x => x.dias === 0) || [];
    if (nivers.length) alertas.push({ ic: "🎂", t: `${nivers.length} aniversariante${nivers.length > 1 ? "s" : ""} hoje`, s: nivers.slice(0, 3).map(x => x.nome.split(" ")[0]).join(", "), a: "marketing" });
    if (mk?.sumidos?.length) alertas.push({ ic: "👋", t: `${mk.sumidos.length} cliente${mk.sumidos.length > 1 ? "s" : ""} sumido${mk.sumidos.length > 1 ? "s" : ""}`, s: "Sem vir há mais de 45 dias.", a: "marketing" });
    for (const pd of pedidos) alertas.push({ ic: pd.status === "feito" ? "✅" : "🛠️", t: pd.status === "feito" ? `Ajuste feito: ${pd.titulo}` : `Ajuste em andamento: ${pd.titulo}`, s: "Pedido de ajuste no site", a: "ajustes" });

    $("#inicio").innerHTML = `
      <div id="agoraIni"></div>
      <div class="resumo-dia">
        <div class="card"><span class="muted small">Recebido hoje</span><b>${dinheiro(recebido)}</b></div>
        <div class="card"><span class="muted small">Agendamentos</span><b>${ativos.length} <small>${restantes ? `· ${restantes} a seguir` : ""}</small></b></div>
        <div class="card"><span class="muted small">Ocupação da agenda</span><b>${ocup === null ? "—" : ocup + "%"}</b><span class="muted small">${dinheiro(previsto)} previsto</span></div>
        <div class="card"><span class="muted small">Avaliação</span><b>${aval.total ? `★ ${String(aval.media).replace(".", ",")}` : "—"} <small>${aval.total ? `· ${aval.total}` : ""}</small></b></div>
      </div>
      <div class="acoes-rapidas">
        <button class="acao-r" data-q="novo"><span class="ic">＋</span>Agendamento</button>
        <button class="acao-r" data-q="avulsa"><span class="ic">💵</span>Venda avulsa</button>
        <button class="acao-r" data-q="bloq"><span class="ic">⛔</span>Bloquear horário</button>
        <button class="acao-r" data-q="link"><span class="ic">🔗</span>Copiar link</button>
      </div>
      <div class="ini-grid">
        <div class="card ini-lista"><div class="row space"><h3>Próximos clientes</h3><button class="link-btn small" data-ir="agenda">Ver agenda →</button></div>
          ${proximos.length ? proximos.map(a => `<div class="prox" data-abrir="${a.id}">
            <span class="hh">${fmtHora(a.inicio, barb.fuso)}</span>
            <div><b>${esc(a.cliente_nome)}</b><small>${esc(a.servico_nome)} · ${dinheiro(a.preco)}${nomeProf(a.profissional_id)}</small></div>
            ${new Date(a.inicio) > agora ? `<a class="btn btn-ghost btn-sm" data-sem-abrir target="_blank" rel="noopener" href="${linkWhats(a.cliente_telefone, lembrete(a))}">Lembrete</a>` : `<span class="tag confirmado">Agora</span>`}
          </div>`).join("") : `<p class="muted small" style="padding:12px 0">Nenhum cliente a seguir hoje.</p>`}
        </div>
        <div class="card"><h3>Avisos</h3>
          ${alertas.length ? alertas.map(x => `<div class="alerta" data-ir="${x.a}"><span class="ic">${x.ic}</span><div><b>${esc(x.t)}</b><small>${esc(x.s)}</small></div></div>`).join("")
            : `<p class="muted small" style="padding:12px 0">Tudo em dia por aqui. ✂️</p>`}
        </div>
      </div>`;
    renderAgora(ags, $("#agoraIni"), true);
    const raiz = $("#inicio");
    $$("[data-abrir]", raiz).forEach(el => el.addEventListener("click", e => { if (!e.target.closest("[data-sem-abrir]")) detalheAgendamento(ags.find(a => a.id === el.dataset.abrir), ags); }));
    $$("[data-ir]", raiz).forEach(el => el.onclick = () => { if (el.dataset.ir === "agenda") diaAgenda = hoje; abrir(el.dataset.ir); });
    $$("[data-q]", raiz).forEach(b => b.onclick = async () => {
      diaAgenda = hoje;
      if (b.dataset.q === "novo") modalAgendamento();
      if (b.dataset.q === "bloq") modalBloqueio();
      if (b.dataset.q === "avulsa") { try { modalComanda(await exec(sb.rpc("abrir_comanda", { p_barbearia: barb.id }))); } catch {} }
      if (b.dataset.q === "link") { try { await navigator.clipboard.writeText(linkPublico()); toast("Link de agendamento copiado."); } catch { prompt("Copie o link:", linkPublico()); } }
    });
    pararAgenda();
    timerAgenda = setInterval(() => document.visibilityState === "visible" && $("#inicio") && telaInicio(), 60000);
  }

  // =================== Agenda ===================
  function pararAgenda() { clearInterval(timerAgenda); timerAgenda = null; }

  async function telaAgenda() {
    const c = $("#conteudo");
    c.innerHTML = `
      <div class="row space">
        <div class="barra-dia">
          <button class="btn btn-ghost btn-sm" id="ant">‹</button>
          <input type="date" id="dia" value="${diaAgenda}">
          <button class="btn btn-ghost btn-sm" id="prox">›</button>
          <button class="btn btn-ghost btn-sm" id="hoje">Hoje</button>
          ${profs.length > 1 && ehDono() ? `<select id="fprof"><option value="">Todos os profissionais</option>${profs.map(p => `<option value="${p.id}" ${p.id === filtroProf ? "selected" : ""}>${esc(p.nome)}</option>`).join("")}</select>` : ""}
        </div>
        <div class="row">
          <div class="seg" id="modo"><button data-modo="tempo" class="${modoAgenda === "tempo" ? "on" : ""}">Linha do tempo</button><button data-modo="lista" class="${modoAgenda === "lista" ? "on" : ""}">Lista</button></div>
          <button class="btn btn-ghost btn-sm" id="bloq">⛔ Bloquear horário</button>
          <button class="btn btn-blue btn-sm" id="novo">+ Agendamento</button>
        </div>
      </div>
      <div class="titulo-dia" id="tdia"></div>
      <div class="resumo-dia" id="resumo"></div>
      <div id="agora"></div>
      <div id="espera"></div>
      <div id="lista"><p class="carregando">Carregando…</p></div>`;
    $$("#modo button").forEach(b => b.onclick = () => {
      modoAgenda = b.dataset.modo; guarda.gravar("navalha_modo_agenda", modoAgenda);
      $$("#modo button").forEach(x => x.classList.toggle("on", x === b));
      carregarAgenda();
    });
    const mudar = d => { diaAgenda = d; $("#dia").value = d; carregarAgenda(); };
    $("#ant").onclick = () => mudar(somaDias(diaAgenda, -1));
    $("#prox").onclick = () => mudar(somaDias(diaAgenda, 1));
    $("#hoje").onclick = () => mudar(hojeNoFuso(barb.fuso));
    $("#dia").onchange = e => e.target.value && mudar(e.target.value);
    $("#fprof")?.addEventListener("change", e => { filtroProf = e.target.value; carregarAgenda(); });
    $("#novo").onclick = () => modalAgendamento();
    // a linha do "agora" anda sozinha
    const tic = setInterval(() => { if (!$("#lista")) return clearInterval(tic); posicionarAgora(); }, 30000);
    $("#bloq").onclick = () => modalBloqueio();
    await carregarAgenda();
    timerAgenda = setInterval(() => document.visibilityState === "visible" && carregarAgenda(true), 60000);
  }

  async function carregarAgenda(silencioso = false) {
    if (!$("#lista")) { if (aba === "inicio" && $("#inicio")) telaInicio(); return; }
    const ini = dataHoraNoFuso(diaAgenda, "00:00", barb.fuso).toISOString();
    const fim = dataHoraNoFuso(somaDias(diaAgenda, 1), "00:00", barb.fuso).toISOString();
    let qa = sb.from("agendamentos").select("*").eq("barbearia_id", barb.id).gte("inicio", ini).lt("inicio", fim).order("inicio");
    let qb = sb.from("bloqueios").select("*").eq("barbearia_id", barb.id).lt("inicio", fim).gt("fim", ini).order("inicio");
    if (filtroProf) { qa = qa.eq("profissional_id", filtroProf); qb = qb.eq("profissional_id", filtroProf); }
    const qe = sb.from("lista_espera").select("*").eq("barbearia_id", barb.id).eq("data", diaAgenda).in("status", ["aguardando", "avisado"]).order("criado_em");
    const qj = sb.from("jornadas").select("profissional_id,inicio,fim").eq("barbearia_id", barb.id).eq("dia_semana", diaSemana(diaAgenda));
    let ags, bls, esp, jor;
    try { [ags, bls, esp, jor] = await Promise.all([exec(qa), exec(qb), exec(qe), exec(qj)]); } catch { return; }
    if (!$("#lista")) return; // trocou de aba

    $("#tdia").textContent = fmtDataLonga(dataHoraNoFuso(diaAgenda, "12:00", barb.fuso), barb.fuso);
    const ativos = ags.filter(a => a.status === "confirmado" || a.status === "concluido");
    const soma = l => l.reduce((t, a) => t + Number(a.preco), 0);
    $("#resumo").innerHTML = `
      <div class="card"><span class="muted small">Agendamentos</span><b>${ativos.length}</b></div>
      <div class="card"><span class="muted small">Previsto</span><b>${dinheiro(soma(ativos))}</b></div>
      <div class="card"><span class="muted small">Concluído</span><b>${dinheiro(soma(ags.filter(a => a.status === "concluido")))}</b></div>
      <div class="card"><span class="muted small">Cancel./faltas</span><b>${ags.length - ativos.length}</b></div>`;

    const nomeProf = id => profs.find(p => p.id === id)?.nome || "";
    renderEspera(esp.filter(e => !filtroProf || !e.profissional_id || e.profissional_id === filtroProf));
    renderAgora(ags);
    if (modoAgenda === "tempo") {
      renderLinhaTempo(ags, bls, jor, silencioso);
    } else {
      const itens = [
        ...ags.map(a => ({ t: a.inicio, html: itemAgendamento(a, nomeProf(a.profissional_id)) })),
        ...bls.map(b => ({ t: b.inicio, html: itemBloqueio(b, nomeProf(b.profissional_id)) })),
      ].sort((x, y) => new Date(x.t) - new Date(y.t));
      $("#lista").innerHTML = itens.length ? itens.map(i => i.html).join("") : `<div class="vazio">Nenhum agendamento neste dia.</div>`;
      ligarAcoes($("#lista"), ags);
    }
    if (!silencioso && modoAgenda === "lista") $("#lista").scrollIntoView({ block: "nearest" });
  }

  // Botões de ação de um agendamento/bloqueio (na lista ou no detalhe aberto pela linha do tempo)
  function ligarAcoes(raiz, ags, aoAgir = () => {}) {
    $$("[data-st]", raiz).forEach(b => b.onclick = async () => {
      const { id, st } = b.dataset;
      if (st === "cancelado" && !confirm("Cancelar este agendamento? O horário volta a ficar livre.")) return;
      const extra = st === "cancelado" ? { cancelado_por: "barbearia" } : st === "confirmado" ? { cancelado_por: null } : {};
      await exec(sb.from("agendamentos").update({ status: st, ...extra }).eq("id", id), `Marcado como ${STATUS[st].toLowerCase()}.`).catch(() => {});
      aoAgir(); carregarAgenda(true);
    });
    $$("[data-trocar]", raiz).forEach(b => b.onclick = () => { aoAgir(); modalTrocar(ags.find(a => a.id === b.dataset.trocar)); });
    $$("[data-cobrar]", raiz).forEach(b => b.onclick = async () => {
      aoAgir();
      try { modalComanda(await exec(sb.rpc("abrir_comanda", { p_barbearia: barb.id, p_agendamento: b.dataset.cobrar }))); } catch {}
    });
    $$("[data-delbloq]", raiz).forEach(b => b.onclick = async () => {
      if (!confirm("Remover este bloqueio?")) return;
      await exec(sb.from("bloqueios").delete().eq("id", b.dataset.delbloq), "Bloqueio removido.").catch(() => {});
      aoAgir(); carregarAgenda(true);
    });
  }

  // ---------- "Agora" e "Próximo" (só no dia de hoje) ----------
  function renderAgora(ags, box = $("#agora"), sempre = false) {
    if (!sempre && diaAgenda !== hojeNoFuso(barb.fuso)) { box.innerHTML = ""; return; }
    const agora = new Date();
    const ativos = ags.filter(a => a.status === "confirmado" || a.status === "concluido");
    const atual = ativos.find(a => new Date(a.inicio) <= agora && new Date(a.fim) > agora);
    const prox = ags.filter(a => a.status === "confirmado" && new Date(a.inicio) > agora).sort((x, y) => new Date(x.inicio) - new Date(y.inicio))[0];
    const emMin = d => { const m = Math.round((new Date(d) - agora) / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`; };
    const nomeProf = id => profs.length > 1 ? " · " + esc(profs.find(p => p.id === id)?.nome || "") : "";
    box.innerHTML = `<div class="agora-prox">
      <div class="ap ${atual ? "ativo" : ""}" ${atual ? `data-abrir="${atual.id}"` : ""}><span class="ap-rot">● Agora</span>
        ${atual ? `<b>${esc(atual.cliente_nome)}</b><span>${fmtHora(atual.inicio, barb.fuso)}–${fmtHora(atual.fim, barb.fuso)} · ${esc(atual.servico_nome)}${nomeProf(atual.profissional_id)}</span><small>termina em ${emMin(atual.fim)}</small>`
          : `<b>Cadeira livre</b><span>Nenhum atendimento neste momento</span>`}</div>
      <div class="ap" ${prox ? `data-abrir="${prox.id}"` : ""}><span class="ap-rot">Próximo</span>
        ${prox ? `<b>${esc(prox.cliente_nome)}</b><span>${fmtHora(prox.inicio, barb.fuso)} · ${esc(prox.servico_nome)}${nomeProf(prox.profissional_id)}</span><small>em ${emMin(prox.inicio)}</small>`
          : `<b>Sem mais horários hoje</b><span>Bom momento para chamar quem está na lista de espera</span>`}</div></div>`;
    $$("[data-abrir]", box).forEach(el => el.onclick = () => detalheAgendamento(ags.find(a => a.id === el.dataset.abrir), ags));
  }

  // ---------- Linha do tempo (como a do Booksy): uma coluna por profissional ----------
  const PX_MIN = 1.3; // 78px por hora
  let linhaTempo = null; // { ini, fim } em minutos do dia, para a linha do "agora"
  function renderLinhaTempo(ags, bls, jor, silencioso) {
    const box = $("#lista");
    const min = iso => { const h = fmtHora(iso, barb.fuso); return +h.slice(0, 2) * 60 + +h.slice(3, 5); };
    const minT = t => +t.slice(0, 2) * 60 + +t.slice(3, 5);
    const visiveis = profs.filter(p => (filtroProf ? p.id === filtroProf : p.ativo || ags.some(a => a.profissional_id === p.id)));
    // faixa de horas: jornada do dia + qualquer horário fora dela (encaixe), arredondado para horas cheias
    const marcos = [...jor.map(j => minT(j.inicio)), ...jor.map(j => minT(j.fim)),
      ...ags.filter(a => a.status !== "cancelado").flatMap(a => [min(a.inicio), min(a.fim) || 1440]), ...bls.flatMap(b => [Math.max(0, min(b.inicio)), min(b.fim) || 1440])];
    let ini = marcos.length ? Math.min(...marcos) : 480, fim = marcos.length ? Math.max(...marcos) : 1200;
    ini = Math.max(0, Math.floor(Math.min(ini, 480) / 60) * 60); fim = Math.min(1440, Math.ceil(Math.max(fim, ini + 600) / 60) * 60);
    linhaTempo = { ini, fim };
    const alt = (fim - ini) * PX_MIN;
    const horas = []; for (let m = ini; m <= fim; m += 60) horas.push(m);
    const top = m => (m - ini) * PX_MIN;
    const ST = { confirmado: "conf", concluido: "conc", faltou: "falt" };

    const coluna = p => {
      const faixas = jor.filter(j => j.profissional_id === p.id).map(j => [minT(j.inicio), minT(j.fim)]).sort((a, b) => a[0] - b[0]);
      // fora do expediente: sombreado
      const fora = []; let c = ini;
      for (const [a, b] of faixas) { if (a > c) fora.push([c, a]); c = Math.max(c, b); }
      if (c < fim) fora.push([c, fim]);
      const blocos = ags.filter(a => a.profissional_id === p.id && a.status !== "cancelado").map(a => {
        const i0 = min(a.inicio), f0 = min(a.fim) || 1440, h = Math.max(22, (f0 - i0) * PX_MIN - 3);
        return `<button class="bloco ${ST[a.status]} ${h < 46 ? "curto" : ""}" style="top:${top(i0) + 1}px;height:${h}px" data-abrir="${a.id}">
          <span class="bh">${fmtHora(a.inicio, barb.fuso)}–${fmtHora(a.fim, barb.fuso)}</span><b>${esc(a.cliente_nome)}</b><span class="bs">${esc(a.servico_nome)}</span></button>`;
      }).join("");
      const bloqs = bls.filter(b => b.profissional_id === p.id).map(b => {
        const i0 = Math.max(ini, min(b.inicio)), f0 = Math.min(fim, min(b.fim) || 1440);
        return `<div class="bloqueio-t" style="top:${top(i0)}px;height:${Math.max(18, (f0 - i0) * PX_MIN)}px" data-bloq="${b.id}"><span>⛔ ${esc(b.motivo || "Bloqueado")}</span></div>`;
      }).join("");
      return `<div class="col-prof" data-prof="${p.id}">
        <div class="col-corpo" style="height:${alt}px">${fora.map(([a, b]) => `<div class="fora" style="top:${top(a)}px;height:${(b - a) * PX_MIN}px"></div>`).join("")}${bloqs}${blocos}</div></div>`;
    };

    box.innerHTML = visiveis.length ? `<div class="tempo">
        <div class="tempo-cab"><div class="canto"></div>${visiveis.map(p => `<div class="cab-prof"><span class="av-p">${esc(p.nome.split(/\s+/).map(x => x[0]).slice(0, 2).join("").toUpperCase())}</span>${esc(p.nome)}</div>`).join("")}</div>
        <div class="tempo-rolagem" id="rolagem"><div class="tempo-grade" style="height:${alt}px">
          <div class="col-horas">${horas.map(m => `<span style="top:${top(m)}px">${String(m / 60).padStart(2, "0")}:00</span>`).join("")}</div>
          <div class="cols" style="background-size:100% ${60 * PX_MIN}px">${visiveis.map(coluna).join("")}</div>
          <div class="agora-linha hidden" id="agora-linha"><span></span></div>
        </div></div></div>
      <p class="muted small mt">Toque num horário vazio para encaixar um cliente; toque num agendamento para ver as ações.</p>`
      : `<div class="vazio">Cadastre um profissional para ver a agenda.</div>`;

    $$(".bloco", box).forEach(el => el.onclick = e => { e.stopPropagation(); detalheAgendamento(ags.find(a => a.id === el.dataset.abrir), ags); });
    $$(".bloqueio-t", box).forEach(el => el.onclick = async e => {
      e.stopPropagation();
      if (!confirm("Remover este bloqueio?")) return;
      await exec(sb.from("bloqueios").delete().eq("id", el.dataset.bloq), "Bloqueio removido.").catch(() => {});
      carregarAgenda(true);
    });
    // clique no vazio: encaixe naquele horário (arredonda para o intervalo da agenda)
    $$(".col-corpo", box).forEach(col => col.onclick = e => {
      const y = e.clientY - col.getBoundingClientRect().top;
      const passo = barb.intervalo_min || 30;
      const m = Math.floor((ini + y / PX_MIN) / passo) * passo;
      modalAgendamento({ prof: col.parentElement.dataset.prof, hora: `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}` });
    });
    posicionarAgora();
    if (!silencioso) {
      const rol = $("#rolagem"), linha = $("#agora-linha");
      if (rol) rol.scrollTop = linha && !linha.classList.contains("hidden") ? Math.max(0, parseFloat(linha.style.top) - 120) : 0;
    }
  }

  function posicionarAgora() {
    const linha = $("#agora-linha");
    if (!linha || !linhaTempo) return;
    const h = fmtHora(new Date().toISOString(), barb.fuso), m = +h.slice(0, 2) * 60 + +h.slice(3, 5);
    const hoje = diaAgenda === hojeNoFuso(barb.fuso) && m >= linhaTempo.ini && m <= linhaTempo.fim;
    linha.classList.toggle("hidden", !hoje);
    if (hoje) { linha.style.top = `${(m - linhaTempo.ini) * PX_MIN}px`; $("span", linha).textContent = h; }
  }

  // Detalhe de um agendamento (aberto pela linha do tempo ou pelo "Agora/Próximo")
  function detalheAgendamento(a, ags) {
    if (!a) return;
    const m = document.createElement("div");
    m.className = "modal";
    m.innerHTML = `<div class="card detalhe"><div class="row space"><h2>${fmtHora(a.inicio, barb.fuso)}–${fmtHora(a.fim, barb.fuso)}</h2><button class="x" data-fechar aria-label="Fechar">×</button></div>
      ${itemAgendamento(a, profs.find(p => p.id === a.profissional_id)?.nome || "")}</div>`;
    const fechar = () => m.remove();
    m.addEventListener("click", e => { if (e.target === m || e.target.hasAttribute("data-fechar")) fechar(); });
    document.body.appendChild(m);
    ligarAcoes(m, ags, fechar);
  }

  function itemAgendamento(a, prof) {
    const quando = `${fmtDataLonga(a.inicio, barb.fuso)} às ${fmtHora(a.inicio, barb.fuso)}`;
    const lembrete = `Olá, ${a.cliente_nome.split(" ")[0]}! Passando para lembrar do seu horário na ${barb.nome}: ${a.servico_nome}, ${quando}. Te esperamos! 💈`;
    const futuro = new Date(a.inicio) > new Date();
    return `<div class="item ${a.status}">
      <div class="h">${fmtHora(a.inicio, barb.fuso)}<small>até ${fmtHora(a.fim, barb.fuso)}</small></div>
      <div>
        <b>${esc(a.cliente_nome)}</b> <span class="tag ${a.status}">${STATUS[a.status]}</span>
        <div class="muted small">${esc(a.servico_nome)} · ${dinheiro(a.preco)}${profs.length > 1 ? ` · ${esc(prof)}` : ""}${a.origem === "painel" ? " · encaixe" : ""}${a.reagendado_em ? " · reagendado" : ""}${Number(a.desconto_cupom) ? ` · 🏷️ cupom −${dinheiro(a.desconto_cupom)}` : ""}${a.status === "cancelado" && a.cancelado_por ? ` · pelo ${a.cancelado_por === "cliente" ? "cliente" : "salão"}` : ""}</div>
        <div class="small"><a href="${linkWhats(a.cliente_telefone)}" target="_blank" rel="noopener">${esc(fmtTelefone(a.cliente_telefone))}</a></div>
        ${a.observacao ? `<div class="muted small">📝 ${esc(a.observacao)}</div>` : ""}
      </div>
      <div class="acoes">
        ${a.status === "confirmado" && futuro ? `<a class="btn btn-green btn-sm" target="_blank" rel="noopener" href="${linkWhats(a.cliente_telefone, lembrete)}">Lembrete</a>` : ""}
        ${a.status === "confirmado" || a.status === "concluido" ? `<button class="btn btn-blue btn-sm" data-cobrar="${a.id}">💵 Cobrar</button>` : ""}
        ${a.status === "confirmado" ? `
          <button class="btn btn-ghost btn-sm" data-trocar="${a.id}">Trocar</button>
          <button class="btn btn-ghost btn-sm" data-id="${a.id}" data-st="concluido">✓ Concluído</button>
          <button class="btn btn-ghost btn-sm" data-id="${a.id}" data-st="faltou">Faltou</button>
          <button class="btn btn-red btn-sm" data-id="${a.id}" data-st="cancelado">Cancelar</button>`
        : a.status !== "cancelado" ? `${a.status === "concluido" ? `<a class="btn btn-green btn-sm" target="_blank" rel="noopener" href="${linkWhats(a.cliente_telefone, `Valeu pela visita, ${a.cliente_nome.split(" ")[0]}! 💈 Se puder, conta pra gente como foi: ${linkAvaliar(a.codigo)}`)}">Pedir avaliação</a>` : ""}
          <button class="btn btn-ghost btn-sm" data-id="${a.id}" data-st="confirmado">Desfazer</button>` : ""}
      </div></div>`;
  }

  function renderEspera(lista) {
    const box = $("#espera");
    if (!lista.length) { box.innerHTML = ""; return; }
    const PER = { manha: "manhã", tarde: "tarde", noite: "noite", qualquer: "qualquer hora" };
    const dataTxt = fmtDataLonga(dataHoraNoFuso(diaAgenda, "12:00", barb.fuso), barb.fuso);
    box.innerHTML = `<div class="card espera-box"><div class="row space"><h3>Lista de espera · ${lista.length}</h3>
      <span class="muted small">Abriu vaga? Chame quem está esperando.</span></div>
      ${lista.map(e => `<div class="espera-item">
        <div><b>${esc(e.nome)}</b> <span class="muted small">${esc(e.servico_nome)} · ${PER[e.periodo]}${e.profissional_id ? " · " + esc(profs.find(p => p.id === e.profissional_id)?.nome || "") : ""}</span>
          ${e.status === "avisado" ? ' <span class="tag faltou">Avisado</span>' : ""}</div>
        <div class="acoes">
          <a class="btn btn-green btn-sm" data-avisar="${e.id}" target="_blank" rel="noopener" href="${linkWhats(e.telefone, `Olá, ${e.nome.split(" ")[0]}! Abriu um horário na ${barb.nome} para ${dataTxt}. Quer agendar? Entra aqui: ${linkPublico()}`)}">Avisar</a>
          <button class="btn btn-ghost btn-sm" data-tirar="${e.id}">Tirar</button>
        </div></div>`).join("")}</div>`;
    $$("[data-avisar]", box).forEach(b => b.addEventListener("click", () => sb.from("lista_espera").update({ status: "avisado" }).eq("id", b.dataset.avisar).then(() => setTimeout(() => carregarAgenda(true), 800))));
    $$("[data-tirar]", box).forEach(b => b.onclick = async () => {
      await exec(sb.from("lista_espera").update({ status: "cancelado" }).eq("id", b.dataset.tirar), "Removido da lista.").catch(() => {});
      carregarAgenda(true);
    });
  }

  function modalTrocar(a) {
    const dur = (new Date(a.fim) - new Date(a.inicio)) / 60000;
    const dia = new Intl.DateTimeFormat("en-CA", { timeZone: barb.fuso }).format(new Date(a.inicio));
    modal(`<h2>Trocar horário</h2>
      <p class="muted small" style="margin-bottom:14px">${esc(a.cliente_nome)} · ${esc(a.servico_nome)} · ${dur} min</p>
      <div class="grid2">
        <div class="campo"><label>Data</label><input type="date" id="t-data" value="${dia}" required></div>
        <div class="campo"><label>Horário</label><input type="time" id="t-hora" value="${fmtHora(a.inicio, barb.fuso)}" required step="300"></div>
      </div>
      <div class="campo"><label>Profissional</label><select id="t-prof">${opcoesProf(a.profissional_id)}</select></div>
      <p class="muted small">Avise o cliente pelo WhatsApp depois de trocar.</p>`,
    async m => {
      const inicio = dataHoraNoFuso($("#t-data", m).value, $("#t-hora", m).value, barb.fuso);
      await exec(sb.from("agendamentos").update({
        inicio: inicio.toISOString(), fim: new Date(inicio.getTime() + dur * 60000).toISOString(),
        profissional_id: $("#t-prof", m).value, reagendado_em: new Date().toISOString(),
      }).eq("id", a.id), "Horário trocado.");
    });
  }

  function itemBloqueio(b, prof) {
    return `<div class="item bloqueio">
      <div class="h">${fmtHora(b.inicio, barb.fuso)}<small>até ${fmtHora(b.fim, barb.fuso)}</small></div>
      <div><b>${esc(b.motivo || "Horário bloqueado")}</b> <span class="tag bloqueio">Bloqueio</span>
        ${profs.length > 1 ? `<div class="muted small">${esc(prof)}</div>` : ""}</div>
      <div class="acoes"><button class="btn btn-ghost btn-sm" data-delbloq="${b.id}">Remover</button></div></div>`;
  }

  function modal(html, aoEnviar) {
    const m = document.createElement("div");
    m.className = "modal";
    m.innerHTML = `<div class="card"><form>${html}
      <div class="row mt" style="justify-content:flex-end"><button type="button" class="btn btn-ghost" data-fechar>Cancelar</button><button class="btn btn-blue">Salvar</button></div>
      <p class="erro hidden"></p></form></div>`;
    const fechar = () => m.remove();
    m.addEventListener("click", e => { if (e.target === m || e.target.hasAttribute("data-fechar")) fechar(); });
    $("form", m).onsubmit = async ev => {
      ev.preventDefault();
      const err = $(".erro", m), btn = $("button.btn-blue", m);
      err.classList.add("hidden"); btn.disabled = true;
      try { await aoEnviar(m); fechar(); carregarAgenda(true); }
      catch (e) { err.textContent = msgErro(e); err.classList.remove("hidden"); btn.disabled = false; }
    };
    document.body.appendChild(m);
    $("input, select", m)?.focus();
    return m;
  }

  const opcoesProf = sel => profs.filter(p => p.ativo && (ehDono() || p.id === meuProf)).map(p => `<option value="${p.id}" ${p.id === sel ? "selected" : ""}>${esc(p.nome)}</option>`).join("");

  function modalAgendamento(pre = {}) {
    const ativos = servicos.filter(s => s.ativo);
    if (!ativos.length) return toast("Cadastre um serviço primeiro.", "erro");
    const m = modal(`<h2>Novo agendamento</h2>
      <div class="campo"><label>Serviços</label><div class="checks" id="m-servs">${ativos.map(s =>
        `<label class="chk"><input type="checkbox" value="${s.id}"> ${esc(s.nome)} <span class="muted">${dinheiro(s.preco)}</span></label>`).join("")}</div></div>
      <div class="grid2">
        <div class="campo"><label>Profissional</label><select id="m-prof">${opcoesProf(pre.prof || filtroProf)}</select></div>
        <div class="campo"><label>Data</label><input type="date" id="m-data" value="${diaAgenda}" required></div>
      </div>
      <div class="grid2">
        <div class="campo"><label>Horário</label><input type="time" id="m-hora" required step="300" value="${pre.hora || ""}"></div>
        <div class="campo"><label>WhatsApp do cliente</label><input id="m-tel" required inputmode="tel" placeholder="(32) 99999-9999"></div>
      </div>
      <div class="campo"><label>Nome do cliente</label><input id="m-nome" required minlength="2" maxlength="80"></div>
      <div class="campo"><label>Observação</label><input id="m-obs" maxlength="300"></div>
      <p class="muted small" id="m-total"></p>`,
    async m => {
      const servs = $$("#m-servs input:checked", m).map(i => i.value);
      if (!servs.length) throw new Error("Escolha pelo menos um serviço.");
      const tel = soDigitos($("#m-tel", m).value);
      if (tel.length < 10) throw new Error("Informe o WhatsApp com DDD.");
      const inicio = dataHoraNoFuso($("#m-data", m).value, $("#m-hora", m).value, barb.fuso);
      await exec(sb.rpc("painel_criar_agendamento", {
        p_barbearia: barb.id, p_profissional: $("#m-prof", m).value, p_servicos: servs, p_inicio: inicio.toISOString(),
        p_nome: $("#m-nome", m).value.trim(), p_telefone: tel, p_observacao: $("#m-obs", m).value.trim() || null,
      }), "Agendamento criado.");
    });
    mascaraTelefone($("#m-tel", m));
    const total = () => {
      const pid = $("#m-prof", m).value;
      const itens = $$("#m-servs input:checked", m).map(i => {
        const sv = servicos.find(x => x.id === i.value), ps = profServ.find(x => x.servico_id === sv.id && x.profissional_id === pid);
        return { preco: ps?.preco ?? sv.preco, duracao_min: ps?.duracao_min ?? sv.duracao_min, faz: !!ps };
      });
      const naoFaz = itens.some(x => !x.faz);
      $("#m-total", m).innerHTML = itens.length ? `Total: <b class="mono">${dinheiro(somaPreco(itens))}</b> · ${fmtDuracao(somaDuracao(itens))}${naoFaz ? ' · <span style="color:#fca5a5">esse profissional não faz algum dos serviços</span>' : ""}` : "";
    };
    m.addEventListener("change", total);
    // preenche o nome ao digitar o telefone de um cliente já cadastrado
    $("#m-tel", m).addEventListener("blur", async () => {
      const tel = soDigitos($("#m-tel", m).value);
      if (tel.length < 10 || $("#m-nome", m).value) return;
      const { data } = await sb.from("clientes").select("nome").eq("barbearia_id", barb.id).eq("telefone", tel).maybeSingle();
      if (data) $("#m-nome", m).value = data.nome;
    });
  }

  function modalBloqueio() {
    const m = modal(`<h2>Bloquear horário</h2>
      <p class="muted small" style="margin-bottom:14px">Clientes não conseguem agendar nesse período (almoço, folga, compromisso…).</p>
      <div class="grid2">
        <div class="campo"><label>Profissional</label><select id="b-prof">${opcoesProf(filtroProf)}</select></div>
        <div class="campo"><label>Data</label><input type="date" id="b-data" value="${diaAgenda}" required></div>
      </div>
      <label class="row" style="color:var(--text);margin-bottom:14px"><input type="checkbox" id="b-dia"> Dia inteiro</label>
      <div class="grid2" id="b-horas">
        <div class="campo"><label>De</label><input type="time" id="b-ini" value="12:00"></div>
        <div class="campo"><label>Até</label><input type="time" id="b-fim" value="13:00"></div>
      </div>
      <div class="campo"><label>Motivo (só você vê)</label><input id="b-mot" maxlength="120" placeholder="Almoço"></div>`,
    async m => {
      const d = $("#b-data", m).value, inteiro = $("#b-dia", m).checked;
      const inicio = dataHoraNoFuso(d, inteiro ? "00:00" : $("#b-ini", m).value, barb.fuso);
      const fim = inteiro ? dataHoraNoFuso(somaDias(d, 1), "00:00", barb.fuso) : dataHoraNoFuso(d, $("#b-fim", m).value, barb.fuso);
      if (fim <= inicio) throw new Error("O horário final precisa ser depois do inicial.");
      await exec(sb.from("bloqueios").insert({
        barbearia_id: barb.id, profissional_id: $("#b-prof", m).value,
        inicio: inicio.toISOString(), fim: fim.toISOString(), motivo: $("#b-mot", m).value.trim() || null,
      }), "Horário bloqueado.");
    });
    $("#b-dia", m).onchange = e => $("#b-horas", m).classList.toggle("hidden", e.target.checked);
  }

  // =================== Serviços ===================
  function telaServicos() {
    const c = $("#conteudo");
    c.innerHTML = `<div class="row space"><div><h2>Serviços</h2><p class="muted small">O que aparece para o cliente escolher. A duração define o tamanho do horário.</p></div>
      <button class="btn btn-blue btn-sm" id="add">+ Serviço</button></div><div id="lista-s" class="mt"></div>`;
    const lista = $("#lista-s");
    const render = () => {
      lista.innerHTML = servicos.length ? "" : `<div class="vazio">Nenhum serviço ainda. Clique em “+ Serviço”.</div>`;
      servicos.forEach(s => lista.appendChild(formServico(s)));
    };
    $("#add").onclick = () => {
      const f = formServico({ nome: "", descricao: "", preco: "", duracao_min: 30, ativo: true, ordem: servicos.length });
      if (!servicos.length) lista.innerHTML = "";
      lista.prepend(f); $("input", f).focus();
    };
    render();
  }

  function formServico(s) {
    const f = document.createElement("form");
    f.className = "card mt";
    f.innerHTML = `<div class="linha-cad">
        <div><label>Nome</label><input name="nome" required maxlength="60" value="${esc(s.nome)}"></div>
        <div><label>Descrição</label><input name="descricao" maxlength="200" value="${esc(s.descricao || "")}"></div>
        <div><label>Preço (R$)</label><input name="preco" type="number" min="0" step="0.01" required value="${esc(s.preco)}"></div>
        <div><label>Duração (min)</label><input name="duracao_min" type="number" min="5" max="480" step="5" required value="${esc(s.duracao_min)}"></div>
        <div class="row" style="padding-bottom:8px"><label class="row" style="margin:0;color:var(--text)"><input type="checkbox" name="ativo" ${s.ativo ? "checked" : ""}> Ativo</label></div>
      </div>
      <div class="row mt" style="justify-content:flex-end">
        ${s.id ? `<button type="button" class="btn btn-red btn-sm" data-del>Excluir</button>` : `<button type="button" class="btn btn-ghost btn-sm" data-del>Descartar</button>`}
        <button class="btn btn-blue btn-sm">Salvar</button></div>`;
    f.onsubmit = async ev => {
      ev.preventDefault();
      const d = Object.fromEntries(new FormData(f));
      const reg = { nome: d.nome.trim(), descricao: d.descricao.trim() || null, preco: Number(d.preco), duracao_min: Number(d.duracao_min), ativo: !!d.ativo };
      try {
        if (s.id) await exec(sb.from("servicos").update(reg).eq("id", s.id), "Serviço salvo.");
        else await exec(sb.from("servicos").insert({ ...reg, barbearia_id: barb.id, ordem: s.ordem }), "Serviço criado.");
        await carregarCadastros(); telaServicos();
      } catch {}
    };
    $("[data-del]", f).onclick = async () => {
      if (!s.id) return f.remove();
      if (!confirm(`Excluir “${s.nome}”? Agendamentos antigos continuam no histórico.`)) return;
      try { await exec(sb.from("servicos").delete().eq("id", s.id), "Serviço excluído."); await carregarCadastros(); telaServicos(); } catch {}
    };
    return f;
  }

  // =================== Profissionais e jornada ===================
  async function telaProfissionais() {
    const c = $("#conteudo");
    c.innerHTML = `<div class="row space"><div><h2>Profissionais</h2><p class="muted small">Quem atende e em quais horários. Para pausa de almoço, use duas faixas no mesmo dia.</p></div>
      <button class="btn btn-blue btn-sm" id="add">+ Profissional</button></div><div id="lista-p"><p class="carregando">Carregando…</p></div>`;
    let jornadas;
    try { jornadas = await exec(sb.from("jornadas").select("*").eq("barbearia_id", barb.id).order("inicio")); } catch { return; }
    const lista = $("#lista-p");
    lista.innerHTML = "";
    profs.forEach(p => lista.appendChild(cardProf(p, jornadas.filter(j => j.profissional_id === p.id))));
    $("#add").onclick = async () => {
      const nome = prompt("Nome do profissional:");
      if (!nome?.trim()) return;
      try {
        const [p] = await exec(sb.from("profissionais").insert({ barbearia_id: barb.id, nome: nome.trim(), ordem: profs.length }).select());
        // copia a jornada do primeiro profissional como ponto de partida
        const base = jornadas.filter(j => j.profissional_id === profs[0]?.id);
        if (base.length) await exec(sb.from("jornadas").insert(base.map(j => ({ barbearia_id: barb.id, profissional_id: p.id, dia_semana: j.dia_semana, inicio: j.inicio, fim: j.fim }))));
        toast("Profissional adicionado."); await carregarCadastros(); telaProfissionais();
      } catch {}
    };
  }

  function cardProf(p, jornadas) {
    const el = document.createElement("div");
    el.className = "card mt";
    const faixa = (ini = "08:00", fim = "18:00") => `<span class="faixa"><input type="time" value="${ini.slice(0, 5)}" data-i> – <input type="time" value="${fim.slice(0, 5)}" data-f><button type="button" title="Remover">×</button></span>`;
    el.innerHTML = `
      <div class="grid2">
        <div class="campo"><label>Nome</label><input data-campo="nome" maxlength="60" value="${esc(p.nome)}"></div>
        <div class="campo"><label>Foto (URL, opcional)</label><input data-campo="foto_url" maxlength="500" value="${esc(p.foto_url || "")}" placeholder="https://…"></div>
      </div>
      <div class="grid2 ${tem("comissoes") ? "" : "hidden"}">
        <div class="campo"><label>Comissão em serviços (%)</label><input type="number" min="0" max="100" step="0.5" data-campo="comissao_servico_pct" value="${p.comissao_servico_pct ?? 40}"></div>
        <div class="campo"><label>Comissão em produtos (%)</label><input type="number" min="0" max="100" step="0.5" data-campo="comissao_produto_pct" value="${p.comissao_produto_pct ?? 10}"></div>
      </div>
      <label class="row" style="color:var(--text)"><input type="checkbox" data-campo="ativo" ${p.ativo ? "checked" : ""}> Aceita agendamentos</label>
      <h3 class="mt">Serviços que faz</h3>
      <p class="muted small" style="margin:4px 0 8px">Deixe preço/duração em branco para usar o padrão do serviço.</p>
      <div class="servs-prof">${servicos.map(sv => {
        const ps = profServ.find(x => x.profissional_id === p.id && x.servico_id === sv.id);
        return `<div class="serv-prof" data-serv="${sv.id}">
          <label class="chk"><input type="checkbox" data-faz ${ps ? "checked" : ""}> ${esc(sv.nome)}${sv.ativo ? "" : ' <span class="muted">(inativo)</span>'}</label>
          <input type="number" min="0" step="0.01" data-preco placeholder="${sv.preco}" value="${ps?.preco ?? ""}" title="Preço (R$)">
          <input type="number" min="5" max="480" step="5" data-dur placeholder="${sv.duracao_min}" value="${ps?.duracao_min ?? ""}" title="Duração (min)">
        </div>`; }).join("") || '<p class="muted small">Cadastre serviços na aba Serviços.</p>'}</div>
      <h3 class="mt">Jornada</h3>
      <div class="jornada">${DIAS.map((nome, d) => `
        <div class="dia-j" data-dia="${d}"><b class="small" style="padding-top:8px">${nome}</b>
          <div class="faixas">${jornadas.filter(j => j.dia_semana === d).map(j => faixa(j.inicio, j.fim)).join("")}
            <button type="button" class="btn btn-ghost btn-sm" data-addf>+ faixa</button>
            ${jornadas.some(j => j.dia_semana === d) ? "" : `<span class="muted small" data-folga>Folga</span>`}</div></div>`).join("")}
      </div>
      <div class="row mt" style="justify-content:flex-end">
        <button type="button" class="btn btn-red btn-sm" data-del>Excluir</button>
        <button type="button" class="btn btn-blue btn-sm" data-salvar>Salvar</button></div>`;
    el.addEventListener("click", e => {
      if (e.target.matches(".faixa button")) {
        const caixa = e.target.closest(".faixas"); e.target.closest(".faixa").remove();
        if (!$(".faixa", caixa)) $("[data-addf]", caixa).insertAdjacentHTML("afterend", `<span class="muted small" data-folga>Folga</span>`);
      }
      if (e.target.matches("[data-addf]")) {
        $("[data-folga]", e.target.parentElement)?.remove();
        const ult = $$(".faixa", e.target.parentElement).pop();
        const ini = ult ? $("[data-f]", ult).value : "08:00";
        e.target.insertAdjacentHTML("beforebegin", faixa(ini, ult ? "20:00" : "18:00"));
      }
    });
    $("[data-salvar]", el).onclick = async () => {
      const novas = [];
      for (const linha of $$(".dia-j", el)) for (const f of $$(".faixa", linha)) {
        const ini = $("[data-i]", f).value, fim = $("[data-f]", f).value;
        if (!ini || !fim || fim <= ini) return toast(`${DIAS[linha.dataset.dia]}: o fim da faixa precisa ser depois do início.`, "erro");
        novas.push({ barbearia_id: barb.id, profissional_id: p.id, dia_semana: Number(linha.dataset.dia), inicio: ini, fim });
      }
      try {
        await exec(sb.from("profissionais").update({
          nome: $("[data-campo=nome]", el).value.trim(), foto_url: $("[data-campo=foto_url]", el).value.trim() || null,
          ativo: $("[data-campo=ativo]", el).checked,
          comissao_servico_pct: Number($("[data-campo=comissao_servico_pct]", el).value || 0),
          comissao_produto_pct: Number($("[data-campo=comissao_produto_pct]", el).value || 0),
        }).eq("id", p.id));
        await exec(sb.from("jornadas").delete().eq("profissional_id", p.id));
        if (novas.length) await exec(sb.from("jornadas").insert(novas));
        const faz = $$(".serv-prof", el).filter(r => $("[data-faz]", r).checked).map(r => ({
          barbearia_id: barb.id, profissional_id: p.id, servico_id: r.dataset.serv,
          preco: $("[data-preco]", r).value === "" ? null : Number($("[data-preco]", r).value),
          duracao_min: $("[data-dur]", r).value === "" ? null : Number($("[data-dur]", r).value),
        }));
        await exec(sb.from("profissional_servicos").delete().eq("profissional_id", p.id));
        if (faz.length) await exec(sb.from("profissional_servicos").insert(faz));
        toast("Profissional salvo."); await carregarCadastros();
      } catch {}
    };
    $("[data-del]", el).onclick = async () => {
      if (!confirm(`Excluir ${p.nome}?`)) return;
      const { error } = await sb.from("profissionais").delete().eq("id", p.id);
      if (error) return toast(/foreign key|violates/.test(error.message) ? "Esse profissional tem agendamentos no histórico. Desmarque “Aceita agendamentos” em vez de excluir." : msgErro(error), "erro");
      toast("Profissional excluído."); await carregarCadastros(); telaProfissionais();
    };
    return el;
  }

  // =================== Clientes ===================
  async function telaClientes() {
    const c = $("#conteudo");
    c.innerHTML = `<div class="row space"><div><h2>Clientes</h2><p class="muted small">A ficha é criada sozinha quando alguém agenda.</p></div>
      <input id="busca" placeholder="Buscar por nome ou telefone" style="max-width:320px"></div>
      <div id="lista-c" class="mt"><p class="carregando">Carregando…</p></div>`;
    let clientes, ags;
    try {
      [clientes, ags] = await Promise.all([
        exec(sb.from("clientes").select("*").eq("barbearia_id", barb.id).order("nome")),
        exec(sb.from("agendamentos").select("cliente_id,inicio,status,preco").eq("barbearia_id", barb.id)),
      ]);
    } catch { return; }
    const agora = new Date();
    const stats = new Map();
    for (const a of ags) {
      if (!a.cliente_id) continue;
      const s = stats.get(a.cliente_id) || { visitas: 0, gasto: 0, faltas: 0, ultima: null, proxima: null };
      if (a.status === "concluido") { s.visitas++; s.gasto += Number(a.preco); if (!s.ultima || a.inicio > s.ultima) s.ultima = a.inicio; }
      if (a.status === "faltou") s.faltas++;
      if (a.status === "confirmado" && new Date(a.inicio) > agora && (!s.proxima || a.inicio < s.proxima)) s.proxima = a.inicio;
      stats.set(a.cliente_id, s);
    }
    const render = () => {
      const t = $("#busca").value.trim().toLowerCase(), dig = soDigitos(t);
      const lista = clientes.filter(x => !t || x.nome.toLowerCase().includes(t) || (dig && x.telefone.includes(dig)));
      $("#lista-c").innerHTML = lista.length ? `<div class="tabela"><div class="tr th"><span>Cliente</span><span>Visitas</span><span>Gasto</span><span>Última</span><span>Próxima</span><span></span></div>
        ${lista.map(x => { const s = stats.get(x.id) || {}; return `<div class="tr" data-cli="${x.id}">
          <span><b>${esc(x.nome)}</b><br><a class="small" href="${linkWhats(x.telefone)}" target="_blank" rel="noopener">${esc(fmtTelefone(x.telefone))}</a>${s.faltas ? ` <span class="tag faltou">${s.faltas} falta${s.faltas > 1 ? "s" : ""}</span>` : ""}</span>
          <span class="mono">${s.visitas || 0}</span><span class="mono">${dinheiro(s.gasto || 0)}</span>
          <span class="small">${s.ultima ? new Intl.DateTimeFormat("pt-BR", { timeZone: barb.fuso }).format(new Date(s.ultima)) : "—"}</span>
          <span class="small">${s.proxima ? new Intl.DateTimeFormat("pt-BR", { timeZone: barb.fuso, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(s.proxima)) : "—"}</span>
          <span><button class="btn btn-ghost btn-sm" data-ficha="${x.id}">Ficha</button></span></div>`; }).join("")}</div>`
        : `<div class="vazio">${clientes.length ? "Ninguém encontrado." : "Nenhum cliente ainda. A ficha aparece aqui no primeiro agendamento."}</div>`;
      $$("[data-ficha]").forEach(b => b.onclick = () => modalFicha(clientes.find(x => x.id === b.dataset.ficha)));
    };
    $("#busca").oninput = render;
    render();
  }

  function modalFicha(cl) {
    const m = modal(`<h2>${esc(cl.nome)}</h2>
      <div class="grid2">
        <div class="campo"><label>Nome</label><input id="f-nome" required minlength="2" maxlength="80" value="${esc(cl.nome)}"></div>
        <div class="campo"><label>WhatsApp</label><input value="${esc(fmtTelefone(cl.telefone))}" disabled></div>
      </div>
      <div class="grid2">
        <div class="campo"><label>E-mail</label><input id="f-email" type="email" maxlength="120" value="${esc(cl.email || "")}"></div>
        <div class="campo"><label>Aniversário</label><input id="f-nasc" type="date" value="${cl.nascimento || ""}"></div>
      </div>
      <div class="campo"><label>Observações (só a barbearia vê)</label><textarea id="f-obs" rows="3" maxlength="1000" placeholder="Ex.: prefere máquina 1 dos lados, alergia a…">${esc(cl.observacoes || "")}</textarea></div>
      <div id="f-pac"></div>
      <h3 class="mt">Histórico</h3><div id="f-hist" class="mt"><p class="carregando">Carregando…</p></div>`,
    async m => {
      await exec(sb.from("clientes").update({
        nome: $("#f-nome", m).value.trim(), email: $("#f-email", m).value.trim() || null,
        nascimento: $("#f-nasc", m).value || null, observacoes: $("#f-obs", m).value.trim() || null,
      }).eq("id", cl.id), "Ficha salva.");
      if (aba === "clientes") telaClientes();
    });
    sb.from("pacotes_clientes").select("*").eq("cliente_id", cl.id).eq("status", "ativo").then(({ data }) => {
      const ativos = (data || []).filter(x => x.usados < x.quantidade);
      if (ativos.length) $("#f-pac", m).innerHTML = `<h3 class="mt">Pacotes</h3>${ativos.map(x => `<div class="hist"><span class="small">até ${new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(x.valido_ate + "T12:00:00Z"))}</span><span>${esc(x.nome)}</span><span class="mono">${x.quantidade - x.usados}/${x.quantidade}</span><span></span></div>`).join("")}`;
    });
    sb.from("agendamentos").select("inicio,servico_nome,preco,status").eq("cliente_id", cl.id).order("inicio", { ascending: false }).limit(30)
      .then(({ data }) => {
        $("#f-hist", m).innerHTML = (data || []).length ? data.map(a => `<div class="hist"><span class="small">${new Intl.DateTimeFormat("pt-BR", { timeZone: barb.fuso, dateStyle: "short", timeStyle: "short" }).format(new Date(a.inicio))}</span>
          <span>${esc(a.servico_nome)}</span><span class="mono small">${dinheiro(a.preco)}</span><span class="tag ${a.status}">${STATUS[a.status]}</span></div>`).join("") : `<p class="muted small">Sem agendamentos.</p>`;
      });
  }

  // =================== Avaliações ===================
  async function telaAvaliacoes() {
    const c = $("#conteudo");
    c.innerHTML = `<p class="carregando">Carregando…</p>`;
    let lista, resumo;
    try {
      [lista, resumo] = await Promise.all([
        exec(sb.from("avaliacoes").select("*").eq("barbearia_id", barb.id).order("criado_em", { ascending: false }).limit(200)),
        exec(sb.rpc("resumo_avaliacoes", { p_barbearia: barb.id })),
      ]);
    } catch { return; }
    const est = n => `<span style="color:#ffc531">${"★".repeat(n)}</span><span style="color:var(--line)">${"★".repeat(5 - n)}</span>`;
    const dist = [5, 4, 3, 2, 1].map(n => [n, lista.filter(v => v.nota === n && v.publicada).length]);
    const max = Math.max(1, ...dist.map(d => d[1]));
    c.innerHTML = `<div class="aval-topo">
        <div class="card"><span class="muted small">Nota média</span><b class="nota-grande">${resumo.total ? String(resumo.media).replace(".", ",") : "—"}</b><span class="muted small">${resumo.total} avaliaç${resumo.total === 1 ? "ão" : "ões"} publicadas</span></div>
        <div class="card">${dist.map(([n, q]) => `<div class="barra-nota"><span class="mono small">${n}★</span><i><em style="width:${q / max * 100}%"></em></i><span class="mono small">${q}</span></div>`).join("")}</div>
        <div class="card"><span class="muted small">Por profissional</span>${profs.map(p => { const r = resumo.profissionais?.[p.id]; return `<div class="row space small" style="margin-top:6px"><span>${esc(p.nome)}</span><span class="mono">${r ? `★ ${String(r.media).replace(".", ",")} (${r.total})` : "—"}</span></div>`; }).join("")}</div>
      </div>
      <p class="muted small mt">Depois de marcar um atendimento como concluído, use “Pedir avaliação” na agenda: o cliente recebe o link no WhatsApp.</p>
      <div id="lista-av" class="mt">${lista.length ? lista.map(v => `<div class="card mt av-item ${v.publicada ? "" : "oculta"}">
        <div class="row space"><div>${est(v.nota)} <b style="margin-left:6px">${esc(v.nome_exibicao)}</b>
          <span class="muted small"> · ${esc(v.servico_nome || "")}${v.profissional_id ? " · " + esc(profs.find(p => p.id === v.profissional_id)?.nome || "") : ""} · ${new Intl.DateTimeFormat("pt-BR", { timeZone: barb.fuso }).format(new Date(v.criado_em))}</span></div>
          ${v.publicada ? "" : '<span class="tag cancelado">Oculta</span>'}</div>
        ${v.comentario ? `<p style="margin-top:8px">${esc(v.comentario)}</p>` : ""}
        <form class="resp" data-id="${v.id}"><textarea rows="2" maxlength="500" placeholder="Responder publicamente (opcional)">${esc(v.resposta || "")}</textarea>
          <div class="row" style="justify-content:flex-end;margin-top:6px">
            <button type="button" class="btn btn-ghost btn-sm" data-vis="${v.id}" data-pub="${v.publicada}">${v.publicada ? "Ocultar do site" : "Mostrar no site"}</button>
            <button class="btn btn-blue btn-sm">${v.resposta ? "Atualizar resposta" : "Responder"}</button></div></form>
      </div>`).join("") : `<div class="vazio">Nenhuma avaliação ainda.</div>`}</div>`;
    $$("form.resp", c).forEach(f => f.onsubmit = async ev => {
      ev.preventDefault();
      try { await exec(sb.from("avaliacoes").update({ resposta: $("textarea", f).value.trim() || null }).eq("id", f.dataset.id), "Resposta salva."); telaAvaliacoes(); } catch {}
    });
    $$("[data-vis]", c).forEach(b => b.onclick = async () => {
      const publicar = b.dataset.pub !== "true";
      try { await exec(sb.from("avaliacoes").update({ publicada: publicar }).eq("id", b.dataset.vis), publicar ? "Avaliação visível no site." : "Avaliação oculta."); telaAvaliacoes(); } catch {}
    });
  }

  // =================== Caixa (comandas) ===================
  const FORMAS = { pix: "Pix", dinheiro: "Dinheiro", credito: "Crédito", debito: "Débito", outro: "Outro" };
  let diaCaixa = null;

  async function telaCaixa() {
    diaCaixa ??= hojeNoFuso(barb.fuso);
    const c = $("#conteudo");
    c.innerHTML = `<div class="row space">
        <div class="barra-dia"><button class="btn btn-ghost btn-sm" id="cant">‹</button><input type="date" id="cdia" value="${diaCaixa}">
          <button class="btn btn-ghost btn-sm" id="cprox">›</button><button class="btn btn-ghost btn-sm" id="choje">Hoje</button></div>
        <button class="btn btn-blue btn-sm" id="avulsa">+ Venda avulsa</button></div>
      <div class="resumo-dia mt" id="cres"></div><div id="clista"><p class="carregando">Carregando…</p></div>`;
    const mudar = d => { diaCaixa = d; telaCaixa(); };
    $("#cant").onclick = () => mudar(somaDias(diaCaixa, -1));
    $("#cprox").onclick = () => mudar(somaDias(diaCaixa, 1));
    $("#choje").onclick = () => mudar(hojeNoFuso(barb.fuso));
    $("#cdia").onchange = e => e.target.value && mudar(e.target.value);
    $("#avulsa").onclick = async () => { try { modalComanda(await exec(sb.rpc("abrir_comanda", { p_barbearia: barb.id }))); } catch {} };
    const ini = dataHoraNoFuso(diaCaixa, "00:00", barb.fuso).toISOString(), fim = dataHoraNoFuso(somaDias(diaCaixa, 1), "00:00", barb.fuso).toISOString();
    let lista, pags;
    try {
      lista = await exec(sb.from("comandas").select("*").eq("barbearia_id", barb.id).gte("aberta_em", ini).lt("aberta_em", fim).order("aberta_em"));
      // comandas abertas de outros dias também aparecem (ficaram pendentes)
      const pend = await exec(sb.from("comandas").select("*").eq("barbearia_id", barb.id).eq("status", "aberta").lt("aberta_em", ini));
      lista = [...pend, ...lista];
      pags = lista.length ? await exec(sb.from("comanda_pagamentos").select("*").in("comanda_id", lista.filter(x => x.status === "fechada").map(x => x.id))) : [];
    } catch { return; }
    if (!$("#clista")) return;
    const fechadas = lista.filter(x => x.status === "fechada");
    const porForma = {}; for (const pg of pags) porForma[pg.forma] = (porForma[pg.forma] || 0) + Number(pg.valor);
    $("#cres").innerHTML = `<div class="card"><span class="muted small">Recebido</span><b>${dinheiro(fechadas.reduce((t, x) => t + Number(x.total), 0))}</b></div>
      ${Object.keys(FORMAS).filter(f => porForma[f]).map(f => `<div class="card"><span class="muted small">${FORMAS[f]}</span><b>${dinheiro(porForma[f])}</b></div>`).join("")}
      <div class="card"><span class="muted small">Em aberto</span><b>${lista.filter(x => x.status === "aberta").length}</b></div>`;
    const ST = { aberta: ["Aberta", "confirmado"], fechada: ["Paga", "concluido"], cancelada: ["Cancelada", "cancelado"] };
    $("#clista").innerHTML = lista.length ? lista.map(x => `<div class="item cmd ${ST[x.status][1]}" data-cmd="${x.id}">
        <div class="h">${fmtHora(x.status === "fechada" ? x.fechada_em : x.aberta_em, barb.fuso)}</div>
        <div><b>${esc(x.cliente_nome || "Venda avulsa")}</b> <span class="tag ${ST[x.status][1]}">${ST[x.status][0]}</span>
          <div class="muted small">${x.profissional_id ? esc(profs.find(p => p.id === x.profissional_id)?.nome || "") + " · " : ""}${x.status === "fechada" ? dinheiro(x.total) + (Number(x.desconto) ? ` (desconto ${dinheiro(x.desconto)})` : "") : x.status === "cancelada" ? esc(x.motivo_cancelamento || "") : "toque para continuar"}</div></div>
        <div class="acoes"><button class="btn btn-ghost btn-sm">${x.status === "aberta" ? "Abrir" : "Ver"}</button></div></div>`).join("")
      : `<div class="vazio">Nenhuma venda neste dia. Cobre um atendimento pela agenda (botão 💵 Cobrar) ou faça uma venda avulsa.</div>`;
    $$("[data-cmd]").forEach(el => el.onclick = () => modalComanda(el.dataset.cmd));
  }

  async function modalComanda(id) {
    let cmd, itens, pagos, produtos, pacotes, saldos = [];
    try {
      [cmd, itens, pagos, produtos, pacotes] = await Promise.all([
        exec(sb.from("comandas").select("*").eq("id", id).single()),
        exec(sb.from("comanda_itens").select("*").eq("comanda_id", id).order("id")),
        exec(sb.from("comanda_pagamentos").select("*").eq("comanda_id", id)),
        exec(sb.from("produtos").select("*").eq("barbearia_id", barb.id).eq("ativo", true).order("nome")),
        exec(sb.from("pacotes").select("*").eq("barbearia_id", barb.id).eq("ativo", true).order("nome")),
      ]);
    } catch { return; }
    const carregarSaldos = async () => {
      saldos = cmd.cliente_id ? ((await sb.from("pacotes_clientes").select("*").eq("cliente_id", cmd.cliente_id).eq("status", "ativo")).data || [])
        .filter(x => x.usados < x.quantidade && x.valido_ate >= hojeNoFuso(barb.fuso)) : [];
    };
    await carregarSaldos();
    const aberta = cmd.status === "aberta";
    const m = document.createElement("div");
    m.className = "modal";
    document.body.appendChild(m);
    const fechar = () => { m.remove(); if ($("#clista")) telaCaixa(); if ($("#lista")) carregarAgenda(true); };
    m.addEventListener("click", e => { if (e.target === m) fechar(); });
    let pagamentos = [{ forma: "pix", valor: "" }];
    const nomeProf = pid => profs.find(p => p.id === pid)?.nome || "";

    const render = () => {
      const sub = itens.reduce((t, i) => t + Number(i.total), 0);
      const desc = Math.min(sub, Math.max(0, Number($("#c-desc", m)?.value || cmd.desconto || 0)));
      const total = aberta ? sub - desc : Number(cmd.total);
      const pago = pagamentos.reduce((t, x) => t + (Number(x.valor) || 0), 0);
      const falta = Math.round((total - pago) * 100) / 100;
      m.innerHTML = `<div class="card comanda">
        <div class="row space"><h2>${esc(cmd.cliente_nome || "Venda avulsa")}</h2><button class="x" data-fechar aria-label="Fechar">×</button></div>
        ${aberta && !cmd.cliente_id ? `<div class="row mt" style="flex-wrap:nowrap"><input id="c-tel" inputmode="tel" placeholder="WhatsApp do cliente (para pacote/histórico)"><button class="btn btn-ghost btn-sm" id="c-busca">Vincular</button></div>` : ""}
        ${saldos.length ? `<p class="small mt" style="color:#86efac">🎟️ ${saldos.map(x => `${esc(x.nome)}: ${x.quantidade - x.usados} restante${x.quantidade - x.usados > 1 ? "s" : ""}`).join(" · ")}</p>` : ""}
        <p class="muted small">${aberta ? "Comanda aberta" : cmd.status === "fechada" ? `Paga em ${new Intl.DateTimeFormat("pt-BR", { timeZone: barb.fuso, dateStyle: "short", timeStyle: "short" }).format(new Date(cmd.fechada_em))}` : "Cancelada" + (cmd.motivo_cancelamento ? ": " + esc(cmd.motivo_cancelamento) : "")}</p>
        <div class="itens-cmd mt">${itens.map(i => `<div class="item-cmd">
            <div><b>${esc(i.descricao)}</b><span class="muted small"> ${i.tipo === "produto" ? "produto" : i.tipo === "pacote" ? "pacote" : ""}${i.pacote_cliente_id ? " · pago com pacote" : ""}${i.profissional_id ? " · " + esc(nomeProf(i.profissional_id)) : ""}</span>
              ${aberta && i.tipo === "servico" && !i.pacote_cliente_id && saldos.some(x => x.servico_id === i.servico_id) ? `<button class="link-btn small" data-usarpac="${i.id}">usar pacote</button>` : ""}</div>
            ${aberta ? `<input type="number" min="1" max="999" value="${i.quantidade}" data-qtd="${i.id}" class="qtd" aria-label="Quantidade">` : `<span class="mono small">${i.quantidade}×</span>`}
            <span class="mono">${dinheiro(i.total)}</span>
            ${aberta ? `<button class="x" data-rm="${i.id}" aria-label="Remover">×</button>` : (i.comissao_valor != null ? `<span class="muted small" title="Comissão">${dinheiro(i.comissao_valor)}</span>` : "<span></span>")}
          </div>`).join("") || '<p class="muted small">Nenhum item.</p>'}</div>
        ${aberta ? `<div class="add-cmd mt">
            <select id="c-add"><option value="">+ Adicionar serviço ou produto…</option>
              <optgroup label="Serviços">${servicos.filter(x => x.ativo).map(x => `<option value="s:${x.id}">${esc(x.nome)} · ${dinheiro(x.preco)}</option>`).join("")}</optgroup>
              <optgroup label="Produtos">${produtos.map(x => `<option value="p:${x.id}">${esc(x.nome)} · ${dinheiro(x.preco_venda)} · ${x.estoque} em estoque</option>`).join("")}</optgroup>
              ${pacotes.length ? `<optgroup label="Pacotes">${pacotes.map(x => `<option value="k:${x.id}">${esc(x.nome)} · ${dinheiro(x.preco)}</option>`).join("")}</optgroup>` : ""}
            </select>
            <select id="c-prof" title="Quem fez/vendeu (comissão)"><option value="">Sem comissão</option>${opcoesProf(cmd.profissional_id)}</select>
          </div>` : ""}
        <div class="totais mt">
          <div><span>Subtotal</span><span class="mono">${dinheiro(sub)}</span></div>
          <div><span>Desconto</span>${aberta ? `<input type="number" id="c-desc" min="0" step="0.01" value="${desc || ""}" placeholder="0,00" class="mono">` : `<span class="mono">${dinheiro(cmd.desconto)}</span>`}</div>
          <div class="total"><span>Total</span><span class="mono">${dinheiro(total)}</span></div>
        </div>
        ${aberta ? `<h3 class="mt">Pagamento</h3>
          ${pagamentos.map((x, k) => `<div class="pag-row"><select data-forma="${k}">${Object.entries(FORMAS).map(([v, t]) => `<option value="${v}" ${v === x.forma ? "selected" : ""}>${t}</option>`).join("")}</select>
            <input type="number" min="0" step="0.01" data-valor="${k}" value="${x.valor}" placeholder="${Math.max(0, falta + (Number(x.valor) || 0)).toFixed(2)}" class="mono">
            ${pagamentos.length > 1 ? `<button class="x" data-rmpag="${k}">×</button>` : "<span></span>"}</div>`).join("")}
          <div class="row space small mt"><button class="link-btn" id="c-maispag">+ dividir pagamento</button>
            <span class="mono ${Math.abs(falta) < 0.005 ? "" : "falta"}">${falta > 0.004 ? "Falta " + dinheiro(falta) : falta < -0.004 ? "Troco " + dinheiro(-falta) : "✓ Fechado"}</span></div>
          <p class="erro hidden" id="c-err"></p>
          <div class="row mt" style="justify-content:space-between"><button class="btn btn-red btn-sm" id="c-cancel">Cancelar comanda</button>
            <button class="btn btn-blue" id="c-fechar">Receber ${dinheiro(total)}</button></div>`
        : `${pagos.length ? `<h3 class="mt">Pagamento</h3>${pagos.map(x => `<div class="row space small"><span>${FORMAS[x.forma]}</span><span class="mono">${dinheiro(x.valor)}</span></div>`).join("")}` : ""}
           ${cmd.status === "fechada" ? `<div class="row mt" style="justify-content:flex-end"><button class="btn btn-red btn-sm" id="c-cancel">Cancelar venda (estorna estoque)</button></div>` : ""}`}
      </div>`;
      bind(total, falta);
    };

    const recarregarItens = async () => { itens = await exec(sb.from("comanda_itens").select("*").eq("comanda_id", id).order("id")); render(); };
    const bind = (total, falta) => {
      $("[data-fechar]", m).onclick = fechar;
      $("#c-cancel", m)?.addEventListener("click", async () => {
        const motivo = prompt(cmd.status === "fechada" ? "Motivo do cancelamento (o estoque volta):" : "Cancelar esta comanda? Motivo (opcional):");
        if (motivo === null) return;
        try { await exec(sb.rpc("cancelar_comanda", { p_comanda: id, p_motivo: motivo }), "Comanda cancelada."); fechar(); } catch {}
      });
      if (!aberta) return;
      $("#c-add", m).onchange = async e => {
        const [tipo, rid] = e.target.value.split(":"); if (!rid) return;
        const pid = $("#c-prof", m).value || null;
        let reg;
        if (tipo === "s") {
          const sv = servicos.find(x => x.id === rid), ps = profServ.find(x => x.servico_id === rid && x.profissional_id === pid);
          reg = { comanda_id: id, tipo: "servico", servico_id: rid, profissional_id: pid, descricao: sv.nome, quantidade: 1, preco_unit: ps?.preco ?? sv.preco };
        } else if (tipo === "k") {
          const pk = pacotes.find(x => x.id === rid);
          if (!cmd.cliente_id) { toast("Vincule o cliente (WhatsApp) antes de vender um pacote.", "erro"); return render(); }
          reg = { comanda_id: id, tipo: "pacote", pacote_id: rid, profissional_id: pid, descricao: pk.nome, quantidade: 1, preco_unit: pk.preco };
        } else {
          const pr = produtos.find(x => x.id === rid);
          if (pr.estoque <= 0 && !confirm(`${pr.nome} está sem estoque no sistema. Vender assim mesmo?`)) return render();
          reg = { comanda_id: id, tipo: "produto", produto_id: rid, profissional_id: pid, descricao: pr.nome, quantidade: 1, preco_unit: pr.preco_venda };
        }
        try { await exec(sb.from("comanda_itens").insert(reg)); await recarregarItens(); } catch {}
      };
      $$("[data-usarpac]", m).forEach(b => b.onclick = async () => {
        const it = itens.find(x => x.id === b.dataset.usarpac), pc = saldos.find(x => x.servico_id === it.servico_id);
        try { await exec(sb.from("comanda_itens").update({ pacote_cliente_id: pc.id }).eq("id", it.id)); await recarregarItens(); } catch {}
      });
      $("#c-busca", m)?.addEventListener("click", async () => {
        const tel = soDigitos($("#c-tel", m).value);
        if (tel.length < 10) return toast("Informe o WhatsApp com DDD.", "erro");
        const { data } = await sb.from("clientes").select("id,nome").eq("barbearia_id", barb.id).eq("telefone", tel).maybeSingle();
        let cli = data;
        if (!cli) {
          const nome = prompt("Cliente novo. Nome:");
          if (!nome?.trim()) return;
          try { [cli] = await exec(sb.from("clientes").insert({ barbearia_id: barb.id, nome: nome.trim(), telefone: tel }).select("id,nome")); } catch { return; }
        }
        try {
          await exec(sb.from("comandas").update({ cliente_id: cli.id, cliente_nome: cli.nome }).eq("id", id));
          cmd.cliente_id = cli.id; cmd.cliente_nome = cli.nome; await carregarSaldos(); render();
        } catch {}
      });
      $$("[data-rm]", m).forEach(b => b.onclick = async () => { try { await exec(sb.from("comanda_itens").delete().eq("id", b.dataset.rm)); await recarregarItens(); } catch {} });
      $$("[data-qtd]", m).forEach(inp => inp.onchange = async () => {
        const q = Math.max(1, Math.min(999, Number(inp.value) || 1));
        try { await exec(sb.from("comanda_itens").update({ quantidade: q }).eq("id", inp.dataset.qtd)); await recarregarItens(); } catch {}
      });
      $("#c-desc", m).onchange = () => { cmd.desconto = Number($("#c-desc", m).value) || 0; render(); };
      $$("[data-forma]", m).forEach(sel => sel.onchange = () => { pagamentos[sel.dataset.forma].forma = sel.value; });
      $$("[data-valor]", m).forEach(inp => inp.onchange = () => { pagamentos[inp.dataset.valor].valor = inp.value; render(); });
      $$("[data-rmpag]", m).forEach(b => b.onclick = () => { pagamentos.splice(Number(b.dataset.rmpag), 1); render(); });
      $("#c-maispag", m).onclick = () => { pagamentos.push({ forma: "dinheiro", valor: "" }); render(); };
      $("#c-fechar", m).onclick = async () => {
        const err = $("#c-err", m);
        // um pagamento sem valor = recebe o total; dinheiro a mais vira troco (registra só o devido)
        let lista = pagamentos.map(x => ({ forma: x.forma, valor: Number(x.valor) || 0 }));
        if (lista.length === 1 && !lista[0].valor) lista[0].valor = total;
        const pagoTotal = lista.reduce((t, x) => t + x.valor, 0);
        const troco = Math.round((pagoTotal - total) * 100) / 100;
        if (troco > 0) {
          const din = lista.find(x => x.forma === "dinheiro" && x.valor >= troco);
          if (!din) { err.textContent = "O valor passou do total. Só pagamento em dinheiro pode ter troco."; err.classList.remove("hidden"); return; }
          din.valor = Math.round((din.valor - troco) * 100) / 100;
        }
        lista = lista.filter(x => x.valor > 0);
        const { error } = await sb.rpc("fechar_comanda", { p_comanda: id, p_desconto: Number($("#c-desc", m).value) || 0, p_pagamentos: lista });
        if (error) { err.textContent = msgErro(error); err.classList.remove("hidden"); return; }
        toast(troco > 0 ? `Venda fechada. Troco: ${dinheiro(troco)}` : "Venda fechada.");
        fechar();
      };
    };
    render();
  }

  // =================== Estoque ===================
  async function telaEstoque() {
    const c = $("#conteudo");
    c.innerHTML = `<div class="row space"><div><h2>Estoque</h2><p class="muted small">A quantidade muda sozinha nas vendas. Use Entrada quando chegar mercadoria.</p></div>
      <button class="btn btn-blue btn-sm" id="add">+ Produto</button></div><div id="lista-p" class="mt"><p class="carregando">Carregando…</p></div>`;
    let produtos;
    try { produtos = await exec(sb.from("produtos").select("*").eq("barbearia_id", barb.id).order("nome")); } catch { return; }
    const baixos = produtos.filter(x => x.ativo && x.estoque <= x.estoque_minimo);
    $("#lista-p").innerHTML = (baixos.length ? `<div class="card espera-box">⚠️ <b>${baixos.length} produto${baixos.length > 1 ? "s" : ""} no estoque mínimo:</b> ${baixos.map(x => esc(x.nome)).join(", ")}</div>` : "")
      + (produtos.length ? `<div class="tabela mt"><div class="tr tr-prod th"><span>Produto</span><span>Preço</span><span>Custo</span><span>Estoque</span><span></span></div>
        ${produtos.map(x => `<div class="tr tr-prod ${x.ativo ? "" : "inativo"}"><span><b>${esc(x.nome)}</b>${x.ativo ? "" : ' <span class="muted small">(inativo)</span>'}</span>
          <span class="mono">${dinheiro(x.preco_venda)}</span><span class="mono muted">${x.custo != null ? dinheiro(x.custo) : "—"}</span>
          <span class="mono ${x.estoque <= x.estoque_minimo ? "falta" : ""}">${x.estoque} <span class="muted small">/ mín ${x.estoque_minimo}</span></span>
          <span class="row"><button class="btn btn-ghost btn-sm" data-mov="${x.id}">Entrada/ajuste</button><button class="btn btn-ghost btn-sm" data-ed="${x.id}">Editar</button></span></div>`).join("")}</div>`
        : `<div class="vazio">Cadastre os produtos que você vende (pomada, óleo de barba…) para controlar o estoque e vender no caixa.</div>`);
    $("#add").onclick = () => modalProduto(null);
    $$("[data-ed]").forEach(b => b.onclick = () => modalProduto(produtos.find(x => x.id === b.dataset.ed)));
    $$("[data-mov]").forEach(b => b.onclick = () => modalMovimento(produtos.find(x => x.id === b.dataset.mov)));
  }

  function modalProduto(pr) {
    modal(`<h2>${pr ? "Editar produto" : "Novo produto"}</h2>
      <div class="campo"><label>Nome</label><input id="pr-nome" required maxlength="80" value="${esc(pr?.nome || "")}"></div>
      <div class="grid2">
        <div class="campo"><label>Preço de venda (R$)</label><input id="pr-preco" type="number" min="0" step="0.01" required value="${pr?.preco_venda ?? ""}"></div>
        <div class="campo"><label>Custo (R$, opcional)</label><input id="pr-custo" type="number" min="0" step="0.01" value="${pr?.custo ?? ""}"></div>
      </div>
      <div class="grid2">
        <div class="campo"><label>Estoque mínimo (alerta)</label><input id="pr-min" type="number" min="0" value="${pr?.estoque_minimo ?? 2}"></div>
        ${pr ? `<div class="campo"><label class="row" style="margin-top:28px;color:var(--text)"><input type="checkbox" id="pr-ativo" ${pr.ativo ? "checked" : ""}> Ativo</label></div>`
             : `<div class="campo"><label>Quantidade inicial</label><input id="pr-ini" type="number" min="0" value="0"></div>`}
      </div>`,
    async m => {
      const reg = { nome: $("#pr-nome", m).value.trim(), preco_venda: Number($("#pr-preco", m).value), custo: $("#pr-custo", m).value === "" ? null : Number($("#pr-custo", m).value), estoque_minimo: Number($("#pr-min", m).value) || 0 };
      if (pr) {
        reg.ativo = $("#pr-ativo", m).checked;
        await exec(sb.from("produtos").update(reg).eq("id", pr.id), "Produto salvo.");
      } else {
        const [novo] = await exec(sb.from("produtos").insert({ ...reg, barbearia_id: barb.id }).select());
        const ini = Number($("#pr-ini", m).value) || 0;
        if (ini > 0) await exec(sb.from("movimentos_estoque").insert({ barbearia_id: barb.id, produto_id: novo.id, tipo: "entrada", quantidade: ini, custo_unit: reg.custo, observacao: "Estoque inicial" }));
        toast("Produto cadastrado.");
      }
      telaEstoque();
    });
  }

  async function modalMovimento(pr) {
    const m = modal(`<h2>${esc(pr.nome)}</h2><p class="muted small">Em estoque agora: <b class="mono" style="color:var(--text)">${pr.estoque}</b></p>
      <div class="periodos mt">${[["entrada", "Entrada (chegou mercadoria)"], ["ajuste", "Ajuste (contagem, perda, uso no salão)"]].map(([v, t], i) =>
        `<label class="chk"><input type="radio" name="tipo" value="${v}" ${i ? "" : "checked"}> ${t}</label>`).join("")}</div>
      <div class="grid2 mt">
        <div class="campo"><label id="mv-lq">Quantidade que entrou</label><input id="mv-q" type="number" required step="1"></div>
        <div class="campo" id="mv-cbox"><label>Custo unitário (R$, opcional)</label><input id="mv-c" type="number" min="0" step="0.01" value="${pr.custo ?? ""}"></div>
      </div>
      <div class="campo"><label>Observação</label><input id="mv-o" maxlength="200" placeholder="Ex.: NF 1234, fornecedor X"></div>
      <h3 class="mt">Últimos movimentos</h3><div id="mv-hist" class="mt"><p class="carregando">Carregando…</p></div>`,
    async m => {
      const tipo = $("input[name=tipo]:checked", m).value, qn = Math.trunc(Number($("#mv-q", m).value));
      if (!qn || (tipo === "entrada" && qn < 0)) throw new Error(tipo === "entrada" ? "Informe quantas unidades entraram." : "Informe a diferença (ex.: -2 para baixa, 3 para sobra).");
      await exec(sb.from("movimentos_estoque").insert({ barbearia_id: barb.id, produto_id: pr.id, tipo, quantidade: qn,
        custo_unit: tipo === "entrada" && $("#mv-c", m).value !== "" ? Number($("#mv-c", m).value) : null, observacao: $("#mv-o", m).value.trim() || null }), "Estoque atualizado.");
      telaEstoque();
    });
    $$("input[name=tipo]", m).forEach(r => r.onchange = () => {
      const aj = r.value === "ajuste" && r.checked;
      if (!r.checked) return;
      $("#mv-lq", m).textContent = aj ? "Diferença (− sai, + entra)" : "Quantidade que entrou";
      $("#mv-cbox", m).classList.toggle("hidden", aj);
    });
    const TIP = { entrada: "Entrada", venda: "Venda", ajuste: "Ajuste", estorno: "Estorno" };
    const { data } = await sb.from("movimentos_estoque").select("*").eq("produto_id", pr.id).order("criado_em", { ascending: false }).limit(15);
    $("#mv-hist", m).innerHTML = (data || []).length ? data.map(x => `<div class="hist"><span class="small">${new Intl.DateTimeFormat("pt-BR", { timeZone: barb.fuso, dateStyle: "short", timeStyle: "short" }).format(new Date(x.criado_em))}</span>
      <span>${TIP[x.tipo]}${x.observacao ? ` <span class="muted small">· ${esc(x.observacao)}</span>` : ""}</span><span class="mono ${x.quantidade < 0 ? "falta" : ""}">${x.quantidade > 0 ? "+" : ""}${x.quantidade}</span><span></span></div>`).join("") : `<p class="muted small">Sem movimentos.</p>`;
  }

  // =================== Relatórios ===================
  let periodoRel = "mes";
  async function telaRelatorios() {
    const hoje = hojeNoFuso(barb.fuso);
    const [y, mo] = hoje.split("-").map(Number);
    const ini = (yy, mm) => `${yy}-${String(mm).padStart(2, "0")}-01`;
    const fimMes = (yy, mm) => somaDias(mm === 12 ? ini(yy + 1, 1) : ini(yy, mm + 1), -1);
    const PER = {
      hoje: ["Hoje", hoje, hoje], d7: ["7 dias", somaDias(hoje, -6), hoje], mes: ["Este mês", ini(y, mo), hoje],
      ant: ["Mês passado", ini(mo === 1 ? y - 1 : y, mo === 1 ? 12 : mo - 1), fimMes(mo === 1 ? y - 1 : y, mo === 1 ? 12 : mo - 1)],
      d90: ["90 dias", somaDias(hoje, -89), hoje],
    };
    const [, de, ate] = PER[periodoRel] || PER.mes;
    const c = $("#conteudo");
    c.innerHTML = `<div class="row space"><h2>Relatórios</h2><div class="seg">${Object.entries(PER).map(([k, [t]]) => `<button class="${k === periodoRel ? "on" : ""}" data-per="${k}">${t}</button>`).join("")}</div></div>
      <p class="muted small">${new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(de + "T12:00:00Z"))} a ${new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(ate + "T12:00:00Z"))} · valores das vendas pagas no caixa</p>
      <div id="rel" class="mt"><p class="carregando">Calculando…</p></div>`;
    $$("[data-per]").forEach(b => b.onclick = () => { periodoRel = b.dataset.per; telaRelatorios(); });
    let r;
    try { r = await exec(sb.rpc("relatorio", { p_barbearia: barb.id, p_de: de, p_ate: ate })); } catch { return; }
    if (!$("#rel")) return;
    if (r.basico) {
      $("#rel").innerHTML = `<div class="resumo-dia">
          <div class="card"><span class="muted small">Faturamento</span><b>${dinheiro(r.faturamento)}</b></div>
          <div class="card"><span class="muted small">Ticket médio</span><b>${dinheiro(r.ticket_medio)}</b><span class="muted small">${r.comandas} vendas</span></div>
          <div class="card"><span class="muted small">Atendimentos</span><b>${r.concluidos}</b></div></div>
        <div class="card mt"><h3>Faturamento por dia</h3><div id="graf" class="graf"></div></div>
        ${bloqueio("relatorios_completos", "Por profissional, por serviço e produto, comissões, ocupação da agenda, faltas e clientes novos.")}`;
      return graficoDias($("#graf"), r.por_dia);
    }
    const pct = v => `${String(Number(v)).replace(".", ",")}%`;
    const kpi = (t, v, sub = "") => `<div class="card"><span class="muted small">${t}</span><b>${v}</b>${sub ? `<span class="muted small">${sub}</span>` : ""}</div>`;
    const tabela = (cab, linhas) => linhas.length ? `<div class="tabela"><div class="tr th" style="grid-template-columns:${cab.map(x => x[1]).join(" ")}">${cab.map(x => `<span>${x[0]}</span>`).join("")}</div>
      ${linhas.map(l => `<div class="tr" style="grid-template-columns:${cab.map(x => x[1]).join(" ")}">${l.map(v => `<span>${v}</span>`).join("")}</div>`).join("")}</div>` : `<p class="muted small">Sem dados no período.</p>`;
    $("#rel").innerHTML = `
      <div class="resumo-dia">
        ${kpi("Faturamento", dinheiro(r.faturamento), Number(r.descontos) ? `${dinheiro(r.descontos)} em descontos` : "")}
        ${kpi("Ticket médio", dinheiro(r.ticket_medio), `${r.comandas} venda${r.comandas === 1 ? "" : "s"}`)}
        ${kpi("Serviços / produtos", `${dinheiro(r.servicos_valor)}`, `produtos: ${dinheiro(r.produtos_valor)}`)}
        ${kpi("Comissões", dinheiro(r.comissoes))}
        ${kpi("Atendimentos", r.concluidos, `${r.clientes_atendidos} clientes · ${r.clientes_novos} novos`)}
        ${kpi("Faltas", pct(r.taxa_falta), `${r.faltas} faltas · ${r.cancelados} cancelados`)}
        ${kpi("Agendado online", pct(r.online_pct))}
      </div>
      <div class="card mt"><h3>Faturamento por dia</h3><div id="graf" class="graf"></div></div>
      <div class="rel-grid mt">
        <div class="card"><h3>Por profissional</h3><div class="mt">${tabela([["Profissional", "1.4fr"], ["Faturou", "1fr"], ["Comissão", "1fr"], ["Atend.", ".6fr"], ["Ocupação", ".8fr"]],
          r.por_profissional.map(p => [esc(p.nome), `<span class="mono">${dinheiro(p.faturamento)}</span>`, `<span class="mono">${dinheiro(p.comissao)}</span>`, `<span class="mono">${p.atendimentos}</span>`, `<span class="mono">${pct(p.ocupacao)}</span>`]))}</div></div>
        <div class="card"><h3>Forma de pagamento</h3><div class="mt">${tabela([["Forma", "1fr"], ["Valor", "1fr"]],
          Object.entries(r.por_pagamento).sort((a, b) => b[1] - a[1]).map(([f, v]) => [FORMAS[f] || f, `<span class="mono">${dinheiro(v)}</span>`]))}</div></div>
        <div class="card"><h3>Serviços</h3><div class="mt">${tabela([["Serviço", "1.6fr"], ["Qtd", ".5fr"], ["Valor", "1fr"]],
          r.por_servico.map(x => [esc(x.nome), `<span class="mono">${x.qtd}</span>`, `<span class="mono">${dinheiro(x.valor)}</span>`]))}</div></div>
        <div class="card"><h3>Produtos</h3><div class="mt">${tabela([["Produto", "1.6fr"], ["Qtd", ".5fr"], ["Valor", "1fr"]],
          r.por_produto.map(x => [esc(x.nome), `<span class="mono">${x.qtd}</span>`, `<span class="mono">${dinheiro(x.valor)}</span>`]))}</div></div>
      </div>`;
    graficoDias($("#graf"), r.por_dia);
  }

  // Colunas por dia (uma série: sem legenda; dica ao passar o mouse; tabela acima tem os números)
  function graficoDias(box, dias) {
    const max = Math.max(...dias.map(d => Number(d.valor)), 1);
    const passo = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000].find(p => max / p <= 4) || 20000;
    const topo = Math.ceil(max / passo) * passo;
    const fmtDia = d => new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit" }).format(new Date(d + "T12:00:00Z"));
    const rotulo = Math.max(1, Math.ceil(dias.length / 10));
    box.innerHTML = `<div class="graf-area">
        ${Array.from({ length: topo / passo + 1 }, (_, i) => `<div class="graf-linha" style="bottom:${i * passo / topo * 100}%"><span>${dinheiro(i * passo).replace(",00", "")}</span></div>`).join("")}
        <div class="graf-barras">${dias.map((d, i) => `<div class="graf-col" tabindex="0" data-tip="${fmtDia(d.dia)} · ${dinheiro(d.valor)} · ${d.atendimentos} atend.">
          <i style="height:${Number(d.valor) / topo * 100}%"></i><small>${i % rotulo === 0 ? fmtDia(d.dia) : ""}</small></div>`).join("")}</div>
      </div><div class="graf-tip hidden"></div>`;
    const tip = $(".graf-tip", box);
    $$(".graf-col", box).forEach(col => {
      const mostra = () => { tip.textContent = col.dataset.tip; tip.classList.remove("hidden"); const r = col.getBoundingClientRect(), b = box.getBoundingClientRect();
        tip.style.left = Math.min(b.width - 170, Math.max(0, r.left - b.left + r.width / 2 - 85)) + "px"; };
      col.onmouseenter = mostra; col.onfocus = mostra;
      col.onmouseleave = col.onblur = () => tip.classList.add("hidden");
    });
  }

  // =================== Marketing ===================
  let diasSumido = 45;
  async function telaMarketing() {
    const c = $("#conteudo");
    c.innerHTML = `<p class="carregando">Carregando…</p>`;
    let promos, cupons, pacotes, mk;
    try {
      [promos, cupons, pacotes, mk] = await Promise.all([
        exec(sb.from("promocoes").select("*").eq("barbearia_id", barb.id).order("criado_em")),
        exec(sb.from("cupons").select("*").eq("barbearia_id", barb.id).order("criado_em")),
        exec(sb.from("pacotes").select("*").eq("barbearia_id", barb.id).order("nome")),
        exec(sb.rpc("marketing_clientes", { p_barbearia: barb.id, p_dias_sumido: diasSumido })),
      ]);
    } catch { return; }
    if (aba !== "marketing") return;
    const DS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const fmtData = d => d ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(String(d).slice(0, 10) + "T12:00:00Z")) : "—";
    const contatado = x => x.ultimo_contato && (Date.now() - new Date(x.ultimo_contato)) < 14 * 86400000;
    const cupomVolta = cupons.find(x => x.ativo);
    c.innerHTML = `
      <div class="mk-grid">
        <div class="card"><div class="row space"><h3>Clientes sumidos</h3>
            <select id="mk-dias" style="width:auto">${[30, 45, 60, 90].map(d => `<option value="${d}" ${d === diasSumido ? "selected" : ""}>sem vir há ${d}+ dias</option>`).join("")}</select></div>
          <p class="muted small" style="margin:6px 0 10px">Quem vinha e parou, sem horário marcado.${cupomVolta ? ` A mensagem já leva o cupom <b class="mono">${esc(cupomVolta.codigo)}</b>.` : " Crie um cupom para oferecer na mensagem."}</p>
          ${mk.sumidos.length ? mk.sumidos.map(x => `<div class="espera-item ${contatado(x) ? "feito" : ""}"><div><b>${esc(x.nome)}</b> <span class="muted small">última visita ${fmtData(x.ultima)} · ${x.visitas} visita${x.visitas > 1 ? "s" : ""}${contatado(x) ? " · chamado há pouco" : ""}</span></div>
            <a class="btn btn-green btn-sm" data-contato="${x.id}" target="_blank" rel="noopener" href="${linkWhats(x.telefone, `Fala, ${x.nome.split(" ")[0]}! Sentimos sua falta aqui na ${barb.nome} 💈${cupomVolta ? ` Use o cupom ${cupomVolta.codigo} e ganhe ${cupomVolta.tipo === "pct" ? Number(cupomVolta.valor) + "%" : dinheiro(cupomVolta.valor)} de desconto.` : ""} Agende: ${linkPublico()}`)}">Chamar</a></div>`).join("")
            : `<p class="muted small">Ninguém sumido. 👏</p>`}
        </div>
        <div class="card"><h3>Aniversariantes da semana</h3>
          <p class="muted small" style="margin:6px 0 10px">Cadastre o aniversário na ficha do cliente.</p>
          ${mk.aniversariantes.length ? mk.aniversariantes.map(x => `<div class="espera-item ${contatado(x) ? "feito" : ""}"><div><b>${esc(x.nome)}</b> <span class="muted small">${x.dias === 0 ? "🎂 hoje" : `em ${x.dias} dia${x.dias > 1 ? "s" : ""}`} · ${fmtData(x.nascimento).slice(0, 5)}</span></div>
            <a class="btn btn-green btn-sm" data-contato="${x.id}" target="_blank" rel="noopener" href="${linkWhats(x.telefone, `Parabéns, ${x.nome.split(" ")[0]}! 🎉 A ${barb.nome} deseja um ótimo aniversário.${cupomVolta ? ` De presente: cupom ${cupomVolta.codigo} no seu próximo corte.` : ""} ${linkPublico()}`)}">Parabenizar</a></div>`).join("")
            : `<p class="muted small">Nenhum aniversário nos próximos 7 dias.</p>`}
        </div>
      </div>

      <div class="card mt"><div class="row space"><div><h3>Promoções por horário</h3><p class="muted small">Desconto automático nos horários vazios (ex.: terça de manhã). Aparece no site e no preço do horário.</p></div>
        <button class="btn btn-blue btn-sm" id="nova-promo">+ Promoção</button></div>
        <div class="mt">${promos.length ? promos.map(x => `<div class="espera-item"><div><b>${esc(x.nome)}</b> <span class="tag ${x.ativa ? "concluido" : "cancelado"}">${x.ativa ? "Ativa" : "Pausada"}</span>
            <div class="muted small">${String(Number(x.desconto_pct)).replace(".", ",")}% · ${x.dias_semana.slice().sort().map(d => DS[d]).join(", ")} · ${x.hora_inicio.slice(0, 5)}–${x.hora_fim.slice(0, 5)}${x.servico_ids?.length ? " · " + esc(servicos.filter(sv => x.servico_ids.includes(sv.id)).map(sv => sv.nome).join(", ")) : " · todos os serviços"}${x.validade_ate ? " · até " + fmtData(x.validade_ate) : ""}</div></div>
            <div class="acoes"><button class="btn btn-ghost btn-sm" data-pausa="${x.id}" data-ativa="${x.ativa}">${x.ativa ? "Pausar" : "Ativar"}</button><button class="btn btn-ghost btn-sm" data-edpromo="${x.id}">Editar</button></div></div>`).join("")
          : `<p class="muted small">Nenhuma promoção.</p>`}</div></div>

      <div class="card mt"><div class="row space"><div><h3>Cupons</h3><p class="muted small">O cliente digita o código ao agendar. Não aparecem no site.</p></div>
        <button class="btn btn-blue btn-sm" id="novo-cupom">+ Cupom</button></div>
        <div class="mt">${cupons.length ? cupons.map(x => `<div class="espera-item"><div><b class="mono">${esc(x.codigo)}</b> <span class="tag ${x.ativo ? "concluido" : "cancelado"}">${x.ativo ? "Ativo" : "Pausado"}</span>
            <div class="muted small">${x.tipo === "pct" ? Number(x.valor) + "%" : dinheiro(x.valor)} · usado ${x.usos}${x.usos_max ? "/" + x.usos_max : ""}× · ${x.uso_por_cliente}× por cliente${x.validade_ate ? " · até " + fmtData(x.validade_ate) : ""}</div></div>
            <div class="acoes"><button class="btn btn-ghost btn-sm" data-pausacup="${x.id}" data-ativo="${x.ativo}">${x.ativo ? "Pausar" : "Ativar"}</button></div></div>`).join("")
          : `<p class="muted small">Nenhum cupom.</p>`}</div></div>

      <div class="card mt"><div class="row space"><div><h3>Pacotes e assinaturas</h3><p class="muted small">Venda no Caixa (o cliente precisa estar vinculado). Cada uso abate 1 do saldo. Para assinatura mensal, use validade de 30 dias.</p></div>
        <button class="btn btn-blue btn-sm" id="novo-pacote">+ Pacote</button></div>
        <div class="mt">${pacotes.length ? pacotes.map(x => `<div class="espera-item"><div><b>${esc(x.nome)}</b> <span class="tag ${x.ativo ? "concluido" : "cancelado"}">${x.ativo ? "À venda" : "Pausado"}</span>
            <div class="muted small">${x.quantidade}× ${esc(servicos.find(sv => sv.id === x.servico_id)?.nome || "")} · ${dinheiro(x.preco)} (${dinheiro(x.preco / x.quantidade)} cada) · válido ${x.validade_dias} dias</div></div>
            <div class="acoes"><button class="btn btn-ghost btn-sm" data-pausapac="${x.id}" data-ativo="${x.ativo}">${x.ativo ? "Pausar" : "Ativar"}</button></div></div>`).join("")
          : `<p class="muted small">Nenhum pacote.</p>`}</div></div>`;

    $("#mk-dias").onchange = e => { diasSumido = Number(e.target.value); telaMarketing(); };
    $$("[data-contato]").forEach(a => a.addEventListener("click", () => sb.from("clientes").update({ ultimo_contato: new Date().toISOString() }).eq("id", a.dataset.contato).then(() => a.closest(".espera-item")?.classList.add("feito"))));
    const alternar = (tab, campo) => async b => { try { await exec(sb.from(tab).update({ [campo]: b.dataset[campo === "ativa" ? "ativa" : "ativo"] !== "true" }).eq("id", b.dataset.id)); telaMarketing(); } catch {} };
    $$("[data-pausa]").forEach(b => { b.dataset.id = b.dataset.pausa; b.onclick = () => alternar("promocoes", "ativa")(b); });
    $$("[data-pausacup]").forEach(b => { b.dataset.id = b.dataset.pausacup; b.onclick = () => alternar("cupons", "ativo")(b); });
    $$("[data-pausapac]").forEach(b => { b.dataset.id = b.dataset.pausapac; b.onclick = () => alternar("pacotes", "ativo")(b); });
    $("#nova-promo").onclick = () => modalPromo(null);
    $$("[data-edpromo]").forEach(b => b.onclick = () => modalPromo(promos.find(x => x.id === b.dataset.edpromo)));
    $("#novo-cupom").onclick = modalCupom;
    $("#novo-pacote").onclick = modalPacote;
  }

  function modalPromo(pr) {
    const DS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    modal(`<h2>${pr ? "Editar promoção" : "Nova promoção"}</h2>
      <div class="grid2">
        <div class="campo"><label>Nome</label><input id="pm-nome" required maxlength="60" value="${esc(pr?.nome || "")}" placeholder="Manhã do corte"></div>
        <div class="campo"><label>Desconto (%)</label><input id="pm-pct" type="number" min="1" max="90" step="1" required value="${pr ? Number(pr.desconto_pct) : 20}"></div>
      </div>
      <div class="campo"><label>Dias</label><div class="checks" id="pm-dias">${DS.map((d, i) => `<label class="chk"><input type="checkbox" value="${i}" ${pr?.dias_semana.includes(i) ? "checked" : ""}> ${d}</label>`).join("")}</div></div>
      <div class="grid2">
        <div class="campo"><label>Das</label><input id="pm-ini" type="time" required value="${pr?.hora_inicio.slice(0, 5) || "09:00"}"></div>
        <div class="campo"><label>Até</label><input id="pm-fim" type="time" required value="${pr?.hora_fim.slice(0, 5) || "12:00"}"></div>
      </div>
      <div class="campo"><label>Serviços (nenhum marcado = todos)</label><div class="checks" id="pm-servs">${servicos.filter(x => x.ativo).map(x => `<label class="chk"><input type="checkbox" value="${x.id}" ${pr?.servico_ids?.includes(x.id) ? "checked" : ""}> ${esc(x.nome)}</label>`).join("")}</div></div>
      <div class="campo"><label>Válida até (opcional)</label><input id="pm-ate" type="date" value="${pr?.validade_ate || ""}"></div>`,
    async m => {
      const dias = $$("#pm-dias input:checked", m).map(i => Number(i.value));
      if (!dias.length) throw new Error("Marque pelo menos um dia.");
      if ($("#pm-fim", m).value <= $("#pm-ini", m).value) throw new Error("O horário final precisa ser depois do inicial.");
      const servs = $$("#pm-servs input:checked", m).map(i => i.value);
      const reg = { nome: $("#pm-nome", m).value.trim(), desconto_pct: Number($("#pm-pct", m).value), dias_semana: dias,
        hora_inicio: $("#pm-ini", m).value, hora_fim: $("#pm-fim", m).value, servico_ids: servs.length ? servs : null, validade_ate: $("#pm-ate", m).value || null };
      if (pr) await exec(sb.from("promocoes").update(reg).eq("id", pr.id), "Promoção salva.");
      else await exec(sb.from("promocoes").insert({ ...reg, barbearia_id: barb.id }), "Promoção criada.");
      telaMarketing();
    });
  }

  function modalCupom() {
    modal(`<h2>Novo cupom</h2>
      <div class="grid2">
        <div class="campo"><label>Código</label><input id="cu-cod" required maxlength="20" pattern="[A-Za-z0-9]{3,20}" placeholder="VOLTA10" style="text-transform:uppercase"></div>
        <div class="campo"><label>Desconto</label><div class="row" style="flex-wrap:nowrap"><input id="cu-val" type="number" min="1" step="0.01" required value="10"><select id="cu-tipo" style="width:auto"><option value="pct">%</option><option value="valor">R$</option></select></div></div>
      </div>
      <div class="grid2">
        <div class="campo"><label>Usos no total (vazio = sem limite)</label><input id="cu-max" type="number" min="1"></div>
        <div class="campo"><label>Usos por cliente</label><input id="cu-cli" type="number" min="1" max="100" value="1"></div>
      </div>
      <div class="campo"><label>Válido até (opcional)</label><input id="cu-ate" type="date"></div>`,
    async m => {
      const tipo = $("#cu-tipo", m).value, valor = Number($("#cu-val", m).value);
      if (tipo === "pct" && valor > 100) throw new Error("Percentual máximo é 100%.");
      await exec(sb.from("cupons").insert({ barbearia_id: barb.id, codigo: $("#cu-cod", m).value.trim().toUpperCase(), tipo, valor,
        usos_max: Number($("#cu-max", m).value) || null, uso_por_cliente: Number($("#cu-cli", m).value) || 1, validade_ate: $("#cu-ate", m).value || null }), "Cupom criado.");
      telaMarketing();
    });
  }

  function modalPacote() {
    const ativos = servicos.filter(x => x.ativo);
    if (!ativos.length) return toast("Cadastre um serviço primeiro.", "erro");
    const m = modal(`<h2>Novo pacote</h2>
      <div class="campo"><label>Nome</label><input id="pk-nome" required maxlength="60" placeholder="Clube do corte — 4 por mês"></div>
      <div class="grid2">
        <div class="campo"><label>Serviço</label><select id="pk-serv">${ativos.map(x => `<option value="${x.id}">${esc(x.nome)} (${dinheiro(x.preco)})</option>`).join("")}</select></div>
        <div class="campo"><label>Quantidade</label><input id="pk-q" type="number" min="1" max="100" value="4" required></div>
      </div>
      <div class="grid2">
        <div class="campo"><label>Preço do pacote (R$)</label><input id="pk-preco" type="number" min="0" step="0.01" required></div>
        <div class="campo"><label>Validade (dias)</label><input id="pk-val" type="number" min="1" max="730" value="30" required></div>
      </div>
      <p class="muted small" id="pk-info"></p>`,
    async m => {
      await exec(sb.from("pacotes").insert({ barbearia_id: barb.id, nome: $("#pk-nome", m).value.trim(), servico_id: $("#pk-serv", m).value,
        quantidade: Number($("#pk-q", m).value), preco: Number($("#pk-preco", m).value), validade_dias: Number($("#pk-val", m).value) }), "Pacote criado.");
      telaMarketing();
    });
    const info = () => {
      const sv = ativos.find(x => x.id === $("#pk-serv", m).value), q = Number($("#pk-q", m).value) || 1, pr = Number($("#pk-preco", m).value);
      $("#pk-info", m).textContent = pr ? `${dinheiro(pr / q)} por sessão · avulso sairia ${dinheiro(sv.preco * q)} (economia de ${dinheiro(Math.max(0, sv.preco * q - pr))})` : "";
    };
    m.addEventListener("input", info);
  }

  // =================== Equipe (logins dos barbeiros) ===================
  async function telaEquipe() {
    const c = $("#conteudo");
    c.innerHTML = `<p class="carregando">Carregando…</p>`;
    let membros, convites;
    try {
      [membros, convites] = await Promise.all([
        exec(sb.from("membros").select("*").eq("barbearia_id", barb.id)),
        exec(sb.from("convites").select("*").eq("barbearia_id", barb.id).is("aceito_em", null).order("criado_em", { ascending: false })),
      ]);
    } catch { return; }
    const nomeProf = id => profs.find(p => p.id === id)?.nome || "—";
    const comLogin = new Set(membros.filter(m => m.papel === "barbeiro").map(m => m.profissional_id));
    const linkConvite = t => new URL(`painel.html?convite=${t}`, location.href).href;
    const pendentes = convites.filter(x => new Date(x.expira_em) > new Date());
    c.innerHTML = `<div class="row space"><div><h2>Equipe</h2><p class="muted small">Cada barbeiro entra com o próprio e-mail e vê só a agenda e o caixa dele.</p></div></div>
      <div class="card mt"><h3>Quem tem acesso</h3>
        ${membros.map(m => `<div class="espera-item"><div><b>${m.papel === "dono" ? "Você (dono)" : esc(nomeProf(m.profissional_id))}</b> <span class="tag ${m.papel === "dono" ? "confirmado" : "concluido"}">${m.papel === "dono" ? "Dono" : "Barbeiro"}</span></div>
          ${m.papel === "barbeiro" ? `<button class="btn btn-red btn-sm" data-tirar="${m.user_id}">Remover acesso</button>` : ""}</div>`).join("")}</div>
      <form class="card mt" id="fc"><h3>Convidar barbeiro</h3>
        <p class="muted small" style="margin:6px 0 12px">Ele recebe um link, cria a conta com este e-mail e já cai na própria agenda. O convite vale 7 dias.</p>
        <div class="grid2">
          <div class="campo"><label>E-mail do barbeiro</label><input type="email" id="cv-email" required placeholder="barbeiro@email.com"></div>
          <div class="campo"><label>É qual profissional?</label><select id="cv-prof">${profs.filter(p => p.ativo && !comLogin.has(p.id)).map(p => `<option value="${p.id}">${esc(p.nome)}</option>`).join("") || '<option value="">Todos já têm acesso</option>'}</select></div>
        </div>
        <button class="btn btn-blue">Gerar convite</button></form>
      ${pendentes.length ? `<div class="card mt"><h3>Convites pendentes</h3>${pendentes.map(x => `<div class="espera-item"><div><b>${esc(x.email)}</b> <span class="muted small">${esc(nomeProf(x.profissional_id))} · vence ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(x.expira_em))}</span></div>
          <div class="acoes"><button class="btn btn-ghost btn-sm" data-copiar="${x.token}">Copiar link</button>
          <a class="btn btn-green btn-sm" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(`Bora usar a agenda da ${barb.nome}! Crie sua conta com o e-mail ${x.email} por aqui: ${linkConvite(x.token)}`)}">Enviar no WhatsApp</a>
          <button class="btn btn-ghost btn-sm" data-cancelar="${x.id}">Cancelar</button></div></div>`).join("")}</div>` : ""}`;
    $("#fc").onsubmit = async ev => {
      ev.preventDefault();
      if (!$("#cv-prof").value) return toast("Todos os profissionais já têm acesso.", "erro");
      try {
        const [cv] = await exec(sb.from("convites").insert({ barbearia_id: barb.id, email: $("#cv-email").value.trim().toLowerCase(), profissional_id: $("#cv-prof").value }).select());
        try { await navigator.clipboard.writeText(linkConvite(cv.token)); toast("Convite criado e link copiado."); } catch { toast("Convite criado."); }
        telaEquipe();
      } catch {}
    };
    $$("[data-copiar]").forEach(b => b.onclick = async () => { try { await navigator.clipboard.writeText(linkConvite(b.dataset.copiar)); toast("Link copiado."); } catch { prompt("Copie o link:", linkConvite(b.dataset.copiar)); } });
    $$("[data-cancelar]").forEach(b => b.onclick = async () => { try { await exec(sb.from("convites").delete().eq("id", b.dataset.cancelar), "Convite cancelado."); telaEquipe(); } catch {} });
    $$("[data-tirar]").forEach(b => b.onclick = async () => {
      if (!confirm("Remover o acesso deste barbeiro? Os atendimentos dele continuam na agenda.")) return;
      try { await exec(sb.from("membros").delete().eq("barbearia_id", barb.id).eq("user_id", b.dataset.tirar), "Acesso removido."); telaEquipe(); } catch {}
    });
  }

  // =================== Recursos do plano ===================
  function bloqueio(recurso, texto) {
    const pl = planoMinimo(recurso);
    const msg = `Olá! Quero mudar a ${barb.nome} para o plano ${pl} (para usar ${RECURSO[recurso]}).`;
    return `<div class="card mt bloqueio-plano"><h3>🔒 ${RECURSO[recurso]} · plano ${esc(pl)}</h3>
      <p class="muted" style="margin:6px 0 14px">${texto}</p>
      <div class="row"><a class="btn btn-blue" href="${linkWhats(SUPORTE_WHATS, msg)}" target="_blank" rel="noopener">Quero o plano ${esc(pl)}</a>
      <span class="muted small">Seu plano: ${esc(assinatura?.planos?.nome || "sem plano")}</span></div></div>`;
  }
  function telaBloqueada(recurso) {
    const TXT = {
      marketing: "Promoções automáticas nos horários vazios, cupons de desconto, pacotes e assinaturas de corte, e a lista de clientes sumidos e aniversariantes com mensagem pronta no WhatsApp.",
      estoque: "Cadastro de produtos com custo e preço, entrada de mercadoria, baixa automática na venda e alerta quando o estoque acaba.",
      site: "Um site com a sua cara e o seu domínio .com.br: fotos, preços, horários, equipe, avaliações e o botão de agendar. A gente monta e faz os ajustes para você todo mês.",
    };
    $("#conteudo").innerHTML = bloqueio(recurso, TXT[recurso]);
  }

  // =================== Meu site: a equipe faz as mudanças; o dono pede (cota por mês) ===================
  async function telaAjustes() {
    const c = $("#conteudo");
    c.innerHTML = `<p class="carregando">Carregando…</p>`;
    let cota, lista;
    try {
      [cota, lista] = await Promise.all([
        exec(sb.rpc("cota_ajustes", { p_barbearia: barb.id })),
        exec(sb.from("pedidos_ajuste").select("*").eq("barbearia_id", barb.id).order("criado_em", { ascending: false }).limit(50)),
      ]);
    } catch { return; }
    const resta = Math.max(0, cota.limite - cota.usados);
    const ST = { aberto: ["Recebido", "confirmado"], em_andamento: ["Em andamento", "faltou"], feito: ["Feito", "concluido"], recusado: ["Recusado", "cancelado"] };
    const linkSite = new URL(`site.html?b=${barb.slug}`, location.href).href;
    c.innerHTML = `<div class="row space"><div><h2>Meu site</h2><p class="muted small">Seu site é montado e mantido pela nossa equipe. Preços, horários, equipe e avaliações atualizam sozinhos; para trocar fotos, textos ou banners, é só pedir aqui.</p></div>
        <a class="btn btn-ghost btn-sm" href="${linkSite}" target="_blank" rel="noopener">Ver meu site ↗</a></div>
      <div class="card cota mt"><span class="muted small">Ajustes deste mês</span><b>${resta} de ${cota.limite}</b><span class="muted small">pedido${cota.limite === 1 ? "" : "s"} restante${resta === 1 ? "" : "s"}</span></div>
      ${resta ? `<form class="card mt" id="fa"><h3>Novo pedido</h3>
          <div class="campo mt"><label>O que você quer mudar?</label><input id="aj-t" required minlength="3" maxlength="80" placeholder="Ex.: trocar a foto da capa"></div>
          <div class="campo"><label>Detalhes</label><textarea id="aj-d" required minlength="3" maxlength="2000" rows="4" placeholder="Explique o que deve mudar. Fotos novas: mande pelo WhatsApp do suporte e diga aqui."></textarea></div>
          <button class="btn btn-blue">Enviar pedido</button></form>`
        : `<div class="card mt"><p>Você já usou os pedidos deste mês. Eles renovam no dia 1º${cota.limite < 6 ? " — ou mude de plano para ter mais ajustes por mês" : ""}.</p></div>`}
      <h3 class="mt2">Seus pedidos</h3>
      ${lista.length ? lista.map(x => `<div class="card mt"><div class="row space"><b>${esc(x.titulo)}</b><span class="tag ${ST[x.status][1]}">${ST[x.status][0]}</span></div>
          <p class="muted small" style="margin-top:4px">${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(x.criado_em))}</p>
          <p style="margin-top:8px;white-space:pre-line">${esc(x.descricao)}</p>
          ${x.resposta ? `<div class="resposta-aj"><b>Suporte:</b> ${esc(x.resposta)}</div>` : ""}</div>`).join("") : `<p class="muted small mt">Nenhum pedido ainda.</p>`}`;
    $("#fa")?.addEventListener("submit", async ev => {
      ev.preventDefault();
      try { await exec(sb.rpc("pedir_ajuste", { p_barbearia: barb.id, p_titulo: $("#aj-t").value, p_descricao: $("#aj-d").value }), "Pedido enviado. Avisamos por aqui quando estiver pronto."); telaAjustes(); } catch {}
    });
  }

  // Plano atual e quanto custa com a equipe de hoje (R$ extra por profissional além dos inclusos)
  function cardPlano() {
    const pl = assinatura?.planos;
    if (!pl) return emTeste() ? `<div class="card"><h2>Seu plano</h2><p class="muted small">Teste grátis com tudo liberado. Escolha o plano até o fim do teste.</p></div>` : "";
    const ativos = profs.filter(p => p.ativo).length, extras = Math.max(0, ativos - (pl.profissionais_inclusos || 1));
    const total = Number(pl.preco_mensal) + extras * Number(pl.preco_extra ?? 20);
    return `<div class="card"><h2>Plano ${esc(pl.nome)}</h2>
      <p class="muted small">${pl.profissionais_inclusos} profissiona${pl.profissionais_inclusos > 1 ? "is" : "l"} incluso${pl.profissionais_inclusos > 1 ? "s" : ""} · ${dinheiro(pl.preco_extra ?? 20)}/mês por profissional a mais${pl.fidelidade_meses ? ` · fidelidade de ${pl.fidelidade_meses} meses${assinatura.fidelidade_ate ? ` (até ${assinatura.fidelidade_ate.split("-").reverse().join("/")})` : ""}` : ""}</p>
      <div class="resumo-dia mt" style="margin-bottom:0">
        <div class="card"><span class="muted small">Plano</span><b>${dinheiro(pl.preco_mensal)}</b></div>
        <div class="card"><span class="muted small">Profissionais extras</span><b>${extras} <small>× ${dinheiro(pl.preco_extra ?? 20)}</small></b></div>
        <div class="card"><span class="muted small">Mensalidade</span><b>${dinheiro(total)}</b></div>
      </div></div>`;
  }

  // =================== Configurações da barbearia ===================
  function telaConfig() {
    const c = $("#conteudo");
    c.innerHTML = `
      ${cardPlano()}
      <div class="card mt"><h2>Link de agendamento</h2>
        <p class="muted small" style="margin-bottom:10px">Coloque no Instagram, no Google e no seu site.</p>
        <div class="link-publico"><input readonly value="${esc(linkPublico())}" id="lnk"><button class="btn btn-blue btn-sm" id="copiar">Copiar</button></div></div>
      <form class="card mt" id="f"><h2>Dados da barbearia</h2>
        <div class="grid2">
          <div class="campo"><label>Nome</label><input name="nome" required maxlength="80" value="${esc(barb.nome)}"></div>
          <div class="campo"><label>WhatsApp</label><input name="whatsapp" inputmode="tel" value="${esc(fmtTelefone(barb.whatsapp || ""))}"></div>
        </div>
        <div class="campo"><label>Endereço</label><input name="endereco" maxlength="200" value="${esc(barb.endereco || "")}"></div>
        <div class="grid2">
          <div class="campo"><label>Logo</label><div class="row" style="flex-wrap:nowrap"><input name="logo_url" maxlength="500" value="${esc(barb.logo_url || "")}" placeholder="https://…">
            <label class="btn btn-ghost btn-sm" style="margin:0">Enviar<input type="file" accept="image/*" id="logo-arq" hidden></label></div></div>
          <div class="campo"><label>Site (botão “voltar ao site”)</label><input name="site_url" maxlength="500" value="${esc(barb.site_url || "")}" placeholder="https://…"></div>
        </div>
        <h3 class="mt">Regras da agenda</h3>
        <div class="grid2 mt">
          <div class="campo"><label>Intervalo entre horários</label><select name="intervalo_min">${[10, 15, 20, 30, 40, 45, 60].map(v => `<option value="${v}" ${v === barb.intervalo_min ? "selected" : ""}>${v} min</option>`).join("")}</select></div>
          <div class="campo"><label>Antecedência mínima</label><select name="antecedencia_min">${[[0, "Nenhuma"], [30, "30 min"], [60, "1 hora"], [120, "2 horas"], [240, "4 horas"], [720, "12 horas"], [1440, "1 dia"]].map(([v, t]) => `<option value="${v}" ${v === barb.antecedencia_min ? "selected" : ""}>${t}</option>`).join("")}</select></div>
        </div>
        <div class="grid2">
          <div class="campo"><label>Agendar até quantos dias à frente</label><input name="dias_abertos" type="number" min="1" max="180" value="${barb.dias_abertos}"></div>
          <div class="campo"><label>Cliente cancela/troca até</label><select name="cancelamento_horas">${[[0, "Até a hora"], [1, "1 hora antes"], [2, "2 horas antes"], [4, "4 horas antes"], [12, "12 horas antes"], [24, "1 dia antes"], [48, "2 dias antes"]].map(([v, t]) => `<option value="${v}" ${v === barb.cancelamento_horas ? "selected" : ""}>${t}</option>`).join("")}</select></div>
        </div>
        <div class="grid2">
          <div class="campo"><label>Horários futuros por cliente</label><input name="max_futuros" type="number" min="1" max="20" value="${barb.max_futuros}"></div>
          <div class="campo"><label>Cor de destaque</label><input name="cor_destaque" type="color" value="${esc(barb.cor_destaque || "#2e6bff")}" style="height:46px;padding:4px"></div>
        </div>
        <div class="row" style="justify-content:flex-end"><button class="btn btn-blue">Salvar</button></div>
      </form>`;
    mascaraTelefone($("[name=whatsapp]"));
    $("#logo-arq").onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      try { toast("Enviando…"); $("[name=logo_url]").value = await enviarImagem(f, 600); toast("Logo enviada. Clique em Salvar."); }
      catch (er) { toast(msgErro(er), "erro"); }
    };
    $("#copiar").onclick = async () => {
      try { await navigator.clipboard.writeText($("#lnk").value); toast("Link copiado!"); }
      catch { $("#lnk").select(); }
    };
    $("#f").onsubmit = async ev => {
      ev.preventDefault();
      const d = Object.fromEntries(new FormData(ev.target));
      const reg = {
        nome: d.nome.trim(), whatsapp: soDigitos(d.whatsapp) || null, endereco: d.endereco.trim() || null,
        logo_url: d.logo_url.trim() || null, site_url: d.site_url.trim() || null,
        intervalo_min: Number(d.intervalo_min), antecedencia_min: Number(d.antecedencia_min), dias_abertos: Number(d.dias_abertos),
        cancelamento_horas: Number(d.cancelamento_horas), max_futuros: Number(d.max_futuros), cor_destaque: d.cor_destaque,
      };
      try {
        barb = await exec(sb.from("barbearias").update(reg).eq("id", barb.id).select().single(), "Dados salvos.");
        iniciar();
      } catch {}
    };
  }

  // =================== Início ===================
  sb.auth.onAuthStateChange(evento => { if (evento === "PASSWORD_RECOVERY") setTimeout(telaNovaSenha, 0); });
  if (/type=recovery/.test(location.hash)) return; // o evento acima cuida da tela
  iniciar();
})();
