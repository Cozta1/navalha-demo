// Site do estabelecimento montado a partir dos dados do sistema. Estilo (tema) e textos mudam conforme a área.
// Endereço: site.html?b=<slug>  — ou um domínio próprio cadastrado no painel.
(async () => {
  const raiz = $("#site");
  const falha = msg => { raiz.innerHTML = `<div class="carregando-site">${esc(msg)}</div>`; };
  if (!configurado) return falha("Site em configuração.");

  let slug = new URLSearchParams(location.search).get("b");
  if (!slug) {
    const { data } = await sb.rpc("barbearia_por_dominio", { p_host: location.hostname });
    slug = data;
  }
  if (!slug) return falha("Página não encontrada.");

  const { data: b, error } = await sb.from("barbearias").select("*").eq("slug", slug).maybeSingle();
  if (error || !b) return falha("Página não encontrada.");
  const { data: temSite } = await sb.rpc("plano_tem", { p_barbearia: b.id, p_recurso: "site" });
  if (temSite === false) { location.replace(`agendar.html?b=${encodeURIComponent(b.slug)}`); return; }
  const [sv, pf, jo, pm, av, rs] = await Promise.all([
    sb.from("servicos").select("*").eq("barbearia_id", b.id).eq("ativo", true).order("ordem").order("nome"),
    sb.from("profissionais").select("*").eq("barbearia_id", b.id).eq("ativo", true).order("ordem").order("nome"),
    sb.from("jornadas").select("dia_semana,inicio,fim").eq("barbearia_id", b.id),
    sb.from("promocoes").select("*").eq("barbearia_id", b.id).eq("ativa", true),
    sb.from("avaliacoes").select("nota,comentario,nome_exibicao,resposta,criado_em").eq("barbearia_id", b.id).order("criado_em", { ascending: false }).limit(40),
    sb.rpc("resumo_avaliacoes", { p_barbearia: b.id }),
  ]);
  const servicos = sv.data || [], profs = pf.data || [], jornadas = jo.data || [];
  const hoje = hojeNoFuso(b.fuso);
  const promos = (pm.data || []).filter(x => !x.validade_ate || x.validade_ate >= hoje);
  const resumo = rs.data || { total: 0, profissionais: {} };
  const depoimentos = (av.data || []).filter(x => x.comentario && x.nota >= 4);

  // dentro do celular da página inicial (iframe): rola sem mostrar a barra de rolagem
  if (window.self !== window.top) document.head.insertAdjacentHTML("beforeend", "<style>html{scrollbar-width:none}html::-webkit-scrollbar{display:none}</style>");

  // ---------- tema e textos da área ----------
  const TEXTOS = {
    barbearia: { rotulo: "Barbearia", titulo: "Corte\nna régua,\nsem fila.", precos: `Preço<br><span class="fino">na parede.</span>`, precosLead: "Sem surpresa no fim. Escolha o serviço, marque online e pague no salão.",
      trabalhos: `Saiu da<br><span class="azul">cadeira.</span>`, equipe: `Quem<br><span class="fino">corta.</span>`, final: `Bora pra<br><span class="azul">cadeira?</span>`, icone: "✂" },
    salao: { rotulo: "Salão de beleza", titulo: "Seu cabelo\ndo jeito\nque você ama.", precos: `Serviços<br><span class="fino">e valores.</span>`, precosLead: "Escolha o serviço, marque online e venha se cuidar. Sem fila, sem espera.",
      trabalhos: `Antes, durante<br><span class="azul">e depois.</span>`, equipe: `Nossas<br><span class="fino">profissionais.</span>`, final: `Seu momento<br><span class="azul">de cuidar.</span>`, icone: "✦" },
    unhas: { rotulo: "Esmalteria", titulo: "Unhas\nimpecáveis,\nsem espera.", precos: `Menu<br><span class="fino">de cores.</span>`, precosLead: "Escolha o serviço, a profissional e o horário. A cor do dia você escolhe aqui.",
      trabalhos: `Feito<br><span class="azul">à mão.</span>`, equipe: `Quem<br><span class="fino">faz.</span>`, final: `Bora fazer<br><span class="azul">as unhas?</span>`, icone: "✿" },
    cilios: { rotulo: "Sobrancelhas e cílios", titulo: "Olhar\nmarcante,\nnatural.", precos: `Procedimentos<br><span class="fino">e valores.</span>`, precosLead: "Valores claros e horário marcado. Você chega e já é atendida.",
      trabalhos: `Resultados<br><span class="azul">reais.</span>`, equipe: `Nossas<br><span class="fino">especialistas.</span>`, final: `Realce<br><span class="azul">seu olhar.</span>`, icone: "·" },
    outro: { rotulo: "Agende online", titulo: "Seu horário\nem poucos\ncliques.", precos: `Serviços<br><span class="fino">e valores.</span>`, precosLead: "Escolha o serviço, marque online e venha no seu horário.",
      trabalhos: `Nosso<br><span class="azul">trabalho.</span>`, equipe: `Nossa<br><span class="fino">equipe.</span>`, final: `Vamos<br><span class="azul">agendar?</span>`, icone: "•" },
  };
  const tx = TEXTOS[b.segmento] || TEXTOS.barbearia;
  const FONTES = {
    elegante: "Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Jost:wght@300;400;500",
    doce: "DM+Serif+Display:ital@0;1&family=Nunito:wght@400;600;700",
    minimal: "Italiana&family=Manrope:wght@300;400;600",
  };
  if (FONTES[b.tema]) document.head.insertAdjacentHTML("beforeend", `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${FONTES[b.tema]}&display=swap">`);
  if (b.tema && b.tema !== "urbano") document.body.classList.add(b.tema);
  document.documentElement.style.setProperty("--azul", b.cor_destaque || "#2e6bff");
  document.documentElement.style.setProperty("--icone", `"${tx.icone}"`);
  document.title = `${b.nome}${b.endereco ? " · " + b.endereco.split(",").slice(-2).join(",").trim() : ""}`;
  $('meta[name="description"]').content = (b.site_texto || `${b.nome}: agende seu horário online.`).slice(0, 160);
  $('meta[name="theme-color"]').content = { classico: "#f2ece0", elegante: "#f7f0ec", doce: "#fff4f7", minimal: "#f3eee8" }[b.tema] || "#0b0b0c";
  if (b.logo_url) document.head.insertAdjacentHTML("beforeend", `<link rel="icon" href="${esc(b.logo_url)}">`);

  // ---------- dados derivados ----------
  const agendar = `agendar.html?b=${encodeURIComponent(b.slug)}`;
  const whats = b.whatsapp ? linkWhats(b.whatsapp, "Olá! Vim pelo site e gostaria de agendar um horário.") : null;
  const insta = b.instagram ? `https://www.instagram.com/${b.instagram}/` : null;
  const mapsLink = b.maps_url || (b.endereco ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.nome + ", " + b.endereco)}` : null);
  const mapsEmbed = b.endereco ? `https://www.google.com/maps?q=${encodeURIComponent(b.nome + ", " + b.endereco)}&output=embed` : null;
  const menorPreco = servicos.length ? Math.min(...servicos.map(x => Number(x.preco))) : null;
  const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  const DC = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const horarioDia = d => {
    const fx = jornadas.filter(j => j.dia_semana === d);
    if (!fx.length) return null;
    return [fx.map(j => j.inicio).sort()[0].slice(0, 5), fx.map(j => j.fim).sort().at(-1).slice(0, 5)];
  };
  const agoraLocal = new Date(new Date().toLocaleString("en-US", { timeZone: b.fuso }));
  const hojeDow = agoraLocal.getDay(), minAgora = agoraLocal.getHours() * 60 + agoraLocal.getMinutes();
  const mins = h => +h.slice(0, 2) * 60 + +h.slice(3, 5);
  const hh = horarioDia(hojeDow);
  const aberto = hh && minAgora >= mins(hh[0]) && minAgora < mins(hh[1]);
  const semana = [1, 2, 3, 4, 5].map(horarioDia);
  const resumoHorario = semana[0] && semana.every(h => h && h[0] === semana[0][0] && h[1] === semana[0][1])
    ? `${semana[0][0].replace(":00", "h")}–${semana[0][1].replace(":00", "h")}` : (hh ? `${hh[0]}–${hh[1]}` : "—");
  const linhasTitulo = (b.site_titulo || tx.titulo).split(/\n/).map(x => x.trim()).filter(Boolean).slice(0, 4);
  const fotos = Array.isArray(b.fotos) ? b.fotos.filter(f => f?.url) : [];
  const capa = b.hero_url || fotos[0]?.url || null;
  const nota = resumo.total ? String(resumo.media).replace(".", ",") : null;
  const iniciais = n => n.split(/\s+/).map(p => p[0]).slice(0, 2).join("").toUpperCase();
  const reais = v => dinheiro(v).replace(",00", "");

  // ---------- HTML ----------
  raiz.innerHTML = `
  ${promos.length ? `<div class="promo-faixa">${promos.map(x => `🔥 <b>${esc(x.nome)}</b>: ${String(Number(x.desconto_pct)).replace(".", ",")}% off · ${x.dias_semana.slice().sort().map(d => DC[d]).join(", ")} ${x.hora_inicio.slice(0, 5)}–${x.hora_fim.slice(0, 5)}`).join(" &nbsp;·&nbsp; ")} · <a href="${agendar}"><u>agendar</u></a></div>` : ""}
  <header><div class="wrap">
    <a href="#" class="marca">${b.logo_url ? `<img src="${esc(b.logo_url)}" alt="">` : ""}<b>${esc(b.nome)}</b></a>
    <nav>
      ${servicos.length ? `<a class="link" href="#precos">Preços</a>` : ""}
      ${fotos.length ? `<a class="link" href="#trabalhos">Trabalhos</a>` : ""}
      ${depoimentos.length ? `<a class="link" href="#avaliacoes">Avaliações</a>` : ""}
      <a class="link" href="#local">Local</a>
      <a class="btn btn-azul" href="${agendar}">Agendar</a>
    </nav></div></header>

  <main>
    <section class="hero">
      <div class="letreiro" aria-hidden="true">${esc((b.endereco || b.nome).split(/[,–-]/).map(x => x.trim()).filter(Boolean).at(-2) || b.nome)}</div>
      <div class="wrap grade">
        <div style="padding-bottom:56px">
          <div class="rotulo linha-entra" style="animation-delay:.05s">${esc(b.endereco ? b.endereco.split(",").slice(-2).join(" · ") : tx.rotulo)}</div>
          <h1 class="titulo" style="margin-top:18px">${linhasTitulo.map((l, i) =>
            `<span class="linha-entra ${i === linhasTitulo.length - 1 && i > 0 ? "azul" : i > 0 ? "fino" : ""}" style="animation-delay:${.15 + i * .12}s">${esc(l)}</span>`).join("")}</h1>
          <div class="assinatura rotulo linha-entra" style="animation-delay:.55s">${esc(b.nome)}</div>
          <p class="lead linha-entra" style="animation-delay:.62s">${esc(b.site_texto || "Escolha o serviço e o melhor horário pra você em poucos cliques.")}</p>
          <div class="ctas linha-entra" style="animation-delay:.72s">
            <a class="btn btn-azul" href="${agendar}">Agendar agora <span class="seta">→</span></a>
            ${whats ? `<a class="btn btn-vazado" href="${whats}" target="_blank" rel="noopener">WhatsApp</a>` : ""}
          </div>
          <div class="fatos linha-entra" style="animation-delay:.85s">
            ${nota ? `<div><b>${nota} <span class="estrelas" style="font-size:1rem">★★★★★</span></b><small>${resumo.total} avaliações</small></div>` : ""}
            ${menorPreco != null ? `<div><b>${reais(menorPreco)}</b><small>valores a partir de</small></div>` : ""}
            <div><b>${esc(resumoHorario)}</b><small>${aberto ? "aberto agora" : "seg a sex"}</small></div>
          </div>
        </div>
        <div class="hero-foto linha-entra" style="animation-delay:.3s">
          ${capa ? `<div class="foto"><img src="${esc(capa)}" alt=""></div>`
            : `<div class="arte" aria-hidden="true"><i></i><i></i><i></i><span>${esc(iniciais(b.nome))}</span></div>`}
          ${b.logo_url ? `<img class="selo" src="${esc(b.logo_url)}" alt="">` : ""}
        </div>
      </div>
    </section>

    ${servicos.length ? `<div class="faixa" aria-hidden="true"><div>${Array(4).fill(servicos.map(x => `<span>${esc(x.nome)}</span>`).join("")).join("")}</div></div>

    <section id="precos" class="precos"><div class="wrap grade revela">
      <div>
        <div class="rotulo">Tabela</div>
        <h2 class="titulo">${tx.precos}</h2>
        <p class="lead">${tx.precosLead}</p>
        <div class="ctas"><a class="btn btn-claro" href="${agendar}">Ver horários livres <span class="seta">→</span></a></div>
      </div>
      <div class="cartaz">
        <h3>${esc(b.nome)} <small>${new Date().getFullYear()}</small></h3>
        ${servicos.map(x => `<div class="item-preco"><div><b>${esc(x.nome)}</b>${x.descricao ? `<small>${esc(x.descricao)}</small>` : ""}</div><i></i><span>${dinheiro(x.preco)}</span></div>`).join("")}
        <div class="rodape">${[1, 6, 0].map(d => { const h = horarioDia(d); return `<span>${d === 1 ? "Seg–Sex" : DIAS[d].slice(0, 3)} ${h ? h.join("–") : "fechado"}</span>`; }).join("")}</div>
      </div>
    </div></section>` : ""}

    ${fotos.length ? `<section id="trabalhos"><div class="wrap revela">
      <div class="cab"><div><div class="rotulo">Trabalhos &amp; espaço</div><h2 class="titulo">${tx.trabalhos}</h2></div>
        ${insta ? `<a class="btn btn-vazado" href="${insta}" target="_blank" rel="noopener">@${esc(b.instagram)} <span class="seta">↗</span></a>` : ""}</div>
      <div class="mosaico">${fotos.map(f => `<figure><img src="${esc(f.url)}" alt="${esc(f.legenda || "")}" loading="lazy">${f.legenda ? `<figcaption>${esc(f.legenda)}</figcaption>` : ""}</figure>`).join("")}</div>
    </div></section>` : ""}

    ${profs.length > 1 ? `<section id="equipe"><div class="wrap revela">
      <div class="rotulo">Equipe</div><h2 class="titulo">${tx.equipe}</h2>
      <div class="equipe">${profs.map(p => { const n = resumo.profissionais?.[p.id]; return `<div><div class="av">${p.foto_url ? `<img src="${esc(p.foto_url)}" alt="">` : esc(iniciais(p.nome))}</div>
        <b>${esc(p.nome)}</b><small>${n ? `★ ${String(n.media).replace(".", ",")} · ${n.total} avaliações` : "&nbsp;"}</small></div>`; }).join("")}</div>
    </div></section>` : ""}

    ${depoimentos.length ? `<section id="avaliacoes" class="avaliacoes"><div class="wrap aval-grade revela">
      <div>
        <div class="rotulo">Avaliações</div>
        <div class="nota" style="margin-top:12px">${nota}<small>/5</small></div>
        <p class="qtd"><span class="estrelas">★★★★★</span>${resumo.total > 10 ? `Mais de <b>${Math.floor(resumo.total / 10) * 10}</b>` : `<b>${resumo.total}</b>`} avaliações</p>
      </div>
      <div><div class="citacao" id="citacao" aria-live="polite"></div>
        <div class="controles"><button id="ant" aria-label="Avaliação anterior">←</button><button id="prox" aria-label="Próxima avaliação">→</button><span class="cont" id="cont"></span></div></div>
    </div></section>` : ""}

    <section id="local" class="local"><div class="wrap revela">
      <div class="cab"><div><div class="rotulo">Onde fica</div><h2 class="titulo">Vem<br><span class="fino">pra cá.</span></h2></div></div>
      <div class="grade">
        <div class="info">
          ${b.endereco ? `<div><h4>Endereço</h4><p class="end">${esc(b.endereco)}</p></div>` : ""}
          <div><h4>Horário <span class="status ${aberto ? "aberto" : ""}" style="margin-left:10px">${aberto ? `Aberto · fecha ${hh[1]}` : "Fechado agora"}</span></h4>
            <div class="horarios">${[1, 2, 3, 4, 5, 6, 0].map(d => { const h = horarioDia(d); return `<div class="${d === hojeDow ? "hoje" : ""}"><span>${DIAS[d]}${d === hojeDow ? " · hoje" : ""}</span><span>${h ? h.join(" – ") : "Fechado"}</span></div>`; }).join("")}</div></div>
          <div class="ctas" style="margin-top:0">
            ${mapsLink ? `<a class="btn btn-claro" href="${esc(mapsLink)}" target="_blank" rel="noopener">Como chegar</a>` : ""}
            ${whats ? `<a class="btn btn-vazado" href="${whats}" target="_blank" rel="noopener">${esc(fmtTelefone(b.whatsapp))}</a>` : ""}
          </div>
        </div>
        <div class="mapa">${mapsEmbed ? `<iframe loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="Mapa" src="${esc(mapsEmbed)}"></iframe>` : ""}</div>
      </div>
    </div></section>

    <section class="final"><div class="wrap revela">
      <div class="rotulo">Horários livres em tempo real</div>
      <h2 class="titulo" style="margin:18px 0 36px">${tx.final}</h2>
      <div class="ctas"><a class="btn btn-azul" href="${agendar}">Agendar agora <span class="seta">→</span></a>
        ${whats ? `<a class="btn btn-vazado" href="${whats}" target="_blank" rel="noopener">Chamar no WhatsApp</a>` : ""}</div>
    </div></section>
  </main>

  <footer><div class="wrap">
    <span>© ${new Date().getFullYear()} ${esc(b.nome)}</span>
    <span>${insta ? `<a href="${insta}" target="_blank" rel="noopener">Instagram</a> · ` : ""}${whats ? `<a href="${whats}" target="_blank" rel="noopener">WhatsApp</a> · ` : ""}<a href="conta.html?b=${encodeURIComponent(b.slug)}">Minha conta</a> · <a href="./">Site e agenda por Marcaí</a> · <a href="privacidade.html">Privacidade</a></span>
  </div></footer>
  <div class="barra-cel"><a class="ag" href="${agendar}">Agendar →</a>${whats ? `<a class="wa" href="${whats}" target="_blank" rel="noopener">WhatsApp</a>` : `<a class="wa" href="#local">Local</a>`}</div>`;

  // ---------- depoimentos girando ----------
  if (depoimentos.length) {
    let i = 0, timer;
    const mostra = n => {
      i = (n + depoimentos.length) % depoimentos.length;
      const r = depoimentos[i];
      $("#citacao").innerHTML = `<div class="troca"><blockquote>${esc(r.comentario)}</blockquote><cite>${"★".repeat(r.nota)} · ${esc(r.nome_exibicao)}</cite></div>`;
      $("#cont").textContent = `${String(i + 1).padStart(2, "0")} / ${String(depoimentos.length).padStart(2, "0")}`;
    };
    const auto = () => { clearInterval(timer); timer = setInterval(() => mostra(i + 1), 7000); };
    $("#ant").onclick = () => { mostra(i - 1); auto(); };
    $("#prox").onclick = () => { mostra(i + 1); auto(); };
    mostra(0); auto();
  }

  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("on"); io.unobserve(e.target); } }), { threshold: .12 });
  $$(".revela").forEach(el => io.observe(el));
})();
