// Conta do cliente: entra com código no e-mail (sem senha), vê próximos horários e histórico,
// repete um agendamento com 1 toque e avalia atendimentos concluídos.
(async () => {
  if (!configurado) return avisoNaoConfigurado();

  const app = $("#app");
  const slug = new URLSearchParams(location.search).get("b");
  let barb = null;

  if (slug) {
    const { data } = await sb.from("barbearias").select("id,nome,slug,logo_url,fuso,cor_destaque,site_url").eq("slug", slug).maybeSingle();
    barb = data;
    aplicarTema(barb);
  }
  const linkAgendar = s => `agendar.html?b=${encodeURIComponent(s)}`;
  const cabecalho = (direita = "") => `<div class="topo-b" data-tema-aqui>
      <div class="marca-b">${barb?.logo_url ? `<img src="${esc(barb.logo_url)}" alt="">` : ""}
        <div><p class="sub">${barb ? esc(barb.nome) : "Navalha"}</p><h1>Minha conta</h1></div></div><div class="row"><span class="tema-aqui"></span>${direita}</div></div>`;
  // depois de cada render, coloca o botão de tema no cabeçalho
  new MutationObserver(() => { const t = $(".tema-aqui"); if (t) t.replaceWith(botaoTema()); }).observe(document.body, { childList: true, subtree: true });

  // ---------- login por código no e-mail ----------
  function telaEmail(erroMsg = "") {
    const salvo = guarda.ler("navalha_cliente", {});
    app.innerHTML = cabecalho() + `
      <div class="card mt2">
        <h3>Entrar</h3>
        <p class="muted small" style="margin:6px 0 16px">Sem senha: mandamos um código de 6 dígitos para o seu e-mail.</p>
        <form id="f">
          <div class="campo"><label>E-mail</label><input type="email" id="email" required autocomplete="email" placeholder="voce@email.com" value="${esc(salvo.email || "")}"></div>
          <button class="btn btn-blue btn-block" id="go">Receber código</button>
          <p class="erro ${erroMsg ? "" : "hidden"}" id="err">${esc(erroMsg)}</p>
        </form>
      </div>
      ${barb ? `<p class="small mt"><a href="${linkAgendar(barb.slug)}">← voltar para o agendamento</a></p>` : ""}`;
    $("#f").onsubmit = async ev => {
      ev.preventDefault();
      const email = $("#email").value.trim().toLowerCase(), btn = $("#go");
      btn.disabled = true; btn.textContent = "Enviando…";
      const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: location.href.split("#")[0] } });
      if (error) { btn.disabled = false; btn.textContent = "Receber código"; return telaEmail(msgErro(error)); }
      guarda.gravar("navalha_cliente", { ...guarda.ler("navalha_cliente", {}), email });
      telaCodigo(email);
    };
  }

  function telaCodigo(email) {
    app.innerHTML = cabecalho() + `
      <div class="card mt2">
        <h3>Digite o código</h3>
        <p class="muted small" style="margin:6px 0 16px">Enviamos para <b style="color:var(--text)">${esc(email)}</b>. Pode levar 1 minuto; confira o spam.</p>
        <form id="f">
          <div class="campo"><input id="cod" class="codigo-otp" required inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" placeholder="••••••"></div>
          <button class="btn btn-blue btn-block" id="go">Entrar</button>
          <p class="erro hidden" id="err"></p>
        </form>
        <p class="small muted mt"><button class="link-btn" id="outro">Usar outro e-mail</button></p>
      </div>`;
    $("#cod").focus();
    $("#outro").onclick = () => telaEmail();
    $("#f").onsubmit = async ev => {
      ev.preventDefault();
      const btn = $("#go"), err = $("#err");
      btn.disabled = true;
      const { error } = await sb.auth.verifyOtp({ email, token: $("#cod").value.trim(), type: "email" });
      btn.disabled = false;
      if (error) { err.textContent = /expired|invalid/i.test(error.message) ? "Código errado ou vencido. Peça um novo." : msgErro(error); err.classList.remove("hidden"); return; }
      telaConta();
    };
  }

  // ---------- conta ----------
  async function telaConta() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return telaEmail();
    app.innerHTML = cabecalho(`<button class="btn btn-ghost btn-sm" id="sair">Sair</button>`) + `<p class="carregando">Carregando…</p>`;
    $("#sair").onclick = async () => { await sb.auth.signOut(); telaEmail(); };

    // horários feitos neste aparelho antes de entrar passam a ser da conta
    const codigos = guarda.ler("navalha_codigos", []);
    if (codigos.length) await sb.rpc("vincular_agendamentos", { p_codigos: codigos });

    const { data, error } = await sb.rpc("meus_agendamentos", { p_barbearia: barb?.id ?? null });
    if (error) { app.insertAdjacentHTML("beforeend", `<div class="vazio">${esc(msgErro(error))}</div>`); return; }
    $(".carregando", app)?.remove();

    const agora = new Date();
    const futuros = data.filter(a => a.status === "confirmado" && new Date(a.inicio) > agora).reverse();
    const passados = data.filter(a => !futuros.includes(a));
    const quando = a => `${fmtDataLonga(a.inicio, a.barbearia.fuso)}, ${fmtHora(a.inicio, a.barbearia.fuso)}`;
    const ROT = { confirmado: "Confirmado", concluido: "Concluído", cancelado: "Cancelado", faltou: "Não compareceu" };

    const card = (a, futuro) => `<div class="ag ${futuro ? "futuro" : ""}">
      <div><p class="sub">${esc(a.barbearia.nome)}</p><div class="quando">${esc(quando(a))}</div>
        <p class="small" style="margin-top:4px">${esc(a.servico)} · ${esc(a.profissional)} · <span class="mono">${dinheiro(a.preco)}</span></p></div>
      <div style="text-align:right"><span class="tag ${a.status}">${ROT[a.status]}</span>
        ${a.nota ? `<div class="estrelas small" style="margin-top:6px">${"★".repeat(a.nota)}</div>` : ""}</div>
      <div class="acoes">
        <a class="btn btn-ghost btn-sm" href="agendamento.html?c=${a.codigo}">${futuro && a.pode_alterar ? "Ver, trocar ou cancelar" : "Detalhes"}</a>
        ${a.pode_avaliar ? `<a class="btn btn-blue btn-sm" href="agendamento.html?c=${a.codigo}#avaliar">Avaliar ★</a>` : ""}
        ${!futuro && a.servicos.length ? `<a class="btn btn-ghost btn-sm" href="${linkAgendar(a.barbearia.slug)}&repetir=${a.codigo}">Repetir</a>` : ""}
      </div></div>`;

    app.insertAdjacentHTML("beforeend", `
      <p class="muted small mt">Conectado como <b style="color:var(--text)">${esc(session.user.email)}</b></p>
      <h3 class="secao">Próximos</h3>
      ${futuros.length ? futuros.map(a => card(a, true)).join("") : `<div class="vazio mt">Nenhum horário marcado.</div>`}
      ${barb ? `<a class="btn btn-blue btn-block mt" href="${linkAgendar(barb.slug)}">Agendar horário</a>` : ""}
      <h3 class="secao">Histórico</h3>
      ${passados.length ? passados.map(a => card(a, false)).join("") : `<p class="muted small mt">Seus atendimentos anteriores aparecem aqui.</p>`}`);
  }

  // Se o e-mail trouxer link em vez de código, o supabase-js lê a sessão da URL antes do getSession().
  telaConta();
})();
