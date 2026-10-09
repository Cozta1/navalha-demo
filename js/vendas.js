// Página de vendas do Marcaí: animações, tema, planos (do banco, com reserva fixa) e links da demonstração.
(async () => {
  // domínio próprio de uma barbearia → abre o site dela
  if (configurado) {
    const { data: slug } = await sb.rpc("barbearia_por_dominio", { p_host: location.hostname });
    if (slug) return location.replace(`site.html?b=${encodeURIComponent(slug)}`);
  }

  $("#tema").replaceWith(botaoTema());
  $("#ano").textContent = new Date().getFullYear();

  // ---------- versões por área: textos, cores/fontes, prints e exemplo da demonstração ----------
  const SEG = {
    "": { nome: "geral", ex: "barbearia",
      faixa: ["Barbearias", "Salões", "Esmalterias", "Sobrancelhas e cílios", "Agenda 24h", "Lembrete no WhatsApp", "Caixa e comissões", "Site próprio", "Promoções e cupons", "Relatórios"] },
    barbearia: { ex: "barbearia", fonte: null,
      rotulo: "Agenda + gestão + site pra barbearia",
      titulo: `Chega de agenda no <em class="cobre">papel</em> e cliente sumido.`,
      lead: "Sua barbearia com agenda online 24h, caixa e comissões num lugar só, e site próprio se quiser. O cliente marca sozinho pelo celular, você só se preocupa com o corte.",
      bolha: "João · Disfarçado · 15:30",
      passo2: "Escolhe o serviço, o barbeiro e o horário livre, de madrugada ou no domingo. Troca e cancela pelo link, sem te chamar no WhatsApp.",
      siteTitulo: `Sua barbearia com <em>cara de marca</em>, não de perfil genérico.`,
      demo: "Uma barbearia de exemplo funcionando: o site, o agendamento do cliente e o painel do dono. O que você fizer fica salvo só no seu navegador.",
      faq: "Perguntas que todo<br>barbeiro faz.",
      faixa: ["Disfarçado", "Barba", "Pigmentação", "Agenda 24h", "Lembrete no WhatsApp", "Clube do corte", "Comissão por barbeiro", "Site próprio", "Promoções", "Relatórios"] },
    salao: { ex: "salao", fonte: "Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Jost:wght@300;400;500;600",
      rotulo: "Agenda + gestão + site pra salão de beleza",
      titulo: `Agenda cheia, <em class="cobre">cliente fiel</em> e salão organizado.`,
      lead: "Corte, cor e tratamento com hora marcada: suas clientes agendam pelo celular, escolhem a profissional e recebem lembrete. Você acompanha caixa, comissões e equipe sem planilha.",
      bolha: "Mariana · Coloração · 14:00",
      passo2: "Escolhe o serviço, a profissional e o horário livre, a qualquer hora. Troca e cancela pelo link, sem te chamar no WhatsApp.",
      siteTitulo: `Seu salão com <em>a elegância</em> que ele tem por dentro.`,
      demo: "O Studio Bella Donna, um salão de exemplo funcionando: site, agendamento da cliente e painel da dona. O que você fizer fica salvo só no seu navegador.",
      faq: "Perguntas que todo<br>salão faz.",
      faixa: ["Corte", "Escova", "Coloração", "Mechas", "Hidratação", "Progressiva", "Pacote de escova", "Comissão por profissional", "Site próprio", "Lembrete no WhatsApp"] },
    unhas: { ex: "unhas", fonte: "DM+Serif+Display:ital@0;1&family=Nunito:wght@400;600;700;800",
      rotulo: "Agenda + gestão + site pra esmalteria",
      titulo: `Sua esmalteria <em class="cobre">lotada</em>, sem viver no WhatsApp.`,
      lead: "As clientes escolhem o serviço, a manicure e o horário sozinhas. Pacote de mãos, promoção na quarta e lembrete de manutenção com um toque.",
      bolha: "Bia · Gel + nail art · 16:30",
      passo2: "Escolhe mão, pé, gel ou fibra, a manicure e o horário livre. Troca e cancela pelo link, sem te chamar no WhatsApp.",
      siteTitulo: `Sua esmalteria com <em>a cara</em> que suas clientes amam.`,
      demo: "A Esmalteria Lua, um exemplo funcionando: site, agendamento da cliente e painel da dona. O que você fizer fica salvo só no seu navegador.",
      faq: "Perguntas de quem<br>vive de unha.",
      faixa: ["Mão", "Pé", "Gel", "Fibra", "Nail art", "Blindagem", "Pacote de mãos", "Promoção na quarta", "Site próprio", "Lembrete de manutenção"] },
    cilios: { ex: "cilios", fonte: "Italiana&family=Manrope:wght@300;400;600;700",
      rotulo: "Agenda + gestão + site pra sobrancelhas e cílios",
      titulo: `Mais olhares marcados, <em class="cobre">menos mensagens</em> respondidas.`,
      lead: "Design, henna, brow e lash com hora marcada e o intervalo certo de manutenção. Suas clientes agendam sozinhas e voltam no tempo certo.",
      bolha: "Alice · Lash lifting · 11:00",
      passo2: "Escolhe o procedimento, a especialista e o horário livre. Troca e cancela pelo link, dentro do prazo que você define.",
      siteTitulo: `Seu estúdio com <em>a delicadeza</em> do seu trabalho.`,
      demo: "O Atelier Olhar, um estúdio de exemplo funcionando: site, agendamento da cliente e painel da dona. O que você fizer fica salvo só no seu navegador.",
      faq: "Perguntas de quem<br>cuida do olhar.",
      faixa: ["Design", "Henna", "Brow lamination", "Lash lifting", "Fio a fio", "Manutenção", "Pacote de manutenção", "Lembrete no WhatsApp", "Site próprio", "Relatórios"] },
  };
  const EXEMPLO = { barbearia: ["os-barbeiros-jf", "dono"], salao: ["studio-bella-donna", "salao"], unhas: ["esmalteria-lua", "unhas"], cilios: ["atelier-olhar", "cilios"] };
  const PRINTS = { "": { painel: "salao", agendar: "unhas", site: "cilios", caixa: "salao", marketing: "unhas", relatorios: "barbearia" } };
  const original = {};
  $$("[data-k]").forEach(el => { original[el.dataset.k] = el.innerHTML; });
  $$("img[data-img]").forEach(el => { el.dataset.padrao = el.getAttribute("src"); el.onerror = () => { el.onerror = null; el.src = el.dataset.padrao; }; });
  const fontes = {};

  // título entra palavra por palavra
  const h1 = $("#titulo");
  let i = 0;
  const quebra = no => [...no.childNodes].forEach(n => {
    if (n.nodeType === 3) {
      const frag = document.createDocumentFragment();
      n.textContent.split(/(\s+)/).forEach(p => {
        if (!p.trim()) return frag.append(p);
        const s = document.createElement("span"); s.className = "p"; s.textContent = p;
        s.style.animationDelay = `${.15 + i++ * .07}s`; frag.append(s);
      });
      n.replaceWith(frag);
    } else if (n.nodeType === 1) { n.classList.add("p"); n.style.animationDelay = `${.15 + i++ * .07}s`; }
  });

  function aplicarSegmento(seg) {
    if (!SEG[seg]) seg = "";
    const cfg = SEG[seg];
    document.documentElement.dataset.seg = seg;
    if (cfg.fonte && !fontes[seg]) { fontes[seg] = true; document.head.insertAdjacentHTML("beforeend", `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${cfg.fonte}&display=swap">`); }
    $$("[data-k]").forEach(el => { el.innerHTML = cfg[el.dataset.k] ?? original[el.dataset.k]; });
    i = 0; quebra(h1);
    const exemplo = seg || "barbearia"; // a versão geral mostra a barbearia no celular
    $$(".seletor-area [data-seg]").forEach(b => b.setAttribute("aria-selected", b.dataset.seg === seg));
    $("#faixa").innerHTML = [...cfg.faixa, ...cfg.faixa].map(t => `<span>${t}</span>`).join("");
    const prints = PRINTS[seg];
    $$("img[data-img]").forEach(el => { const de = prints ? prints[el.dataset.img] : seg; el.onerror = () => { el.onerror = null; el.src = el.dataset.padrao; }; el.src = de ? `img/seg/${de}-${el.dataset.img}.webp` : el.dataset.padrao; });
    const [slug, conta] = EXEMPLO[cfg.ex];
    $("#demo-site").href = `${demo}site.html?b=${slug}`;
    const [slugVivo] = EXEMPLO[exemplo], vivo = $("#site-vivo"), urlVivo = `${demo}site.html?b=${slugVivo}`;
    if (vivo && vivo.dataset.url !== urlVivo) { vivo.dataset.url = urlVivo; vivo.src = `${urlVivo}&limpo=1`; }
    $("#site-vivo-abrir").href = urlVivo;
    $("#demo-agendar").href = `${demo}agendar.html?b=${slug}`;
    $("#demo-painel").href = `${demo}painel.html?como=${conta}`;
    const url = new URL(location.href);
    if (seg) url.searchParams.set("seg", seg); else url.searchParams.delete("seg");
    history.replaceState(null, "", url);
  }

  // topo ganha fundo ao rolar
  const topo = $("#topo");
  const marca = () => topo.classList.toggle("rolou", scrollY > 20);
  addEventListener("scroll", marca, { passive: true }); marca();


  // telas do topo acompanham o mouse (profundidade)
  const palco = $("#palco");
  if (palco && matchMedia("(hover: hover)").matches && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    palco.addEventListener("mousemove", e => {
      const r = palco.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
      $(".note", palco).style.transform = `rotateY(${-8 + x * 8}deg) rotateX(${4 - y * 6}deg)`;
      $(".cel", palco).style.transform = `rotate(-3deg) translate(${x * -14}px, ${y * -10}px)`;
    });
    palco.addEventListener("mouseleave", () => { $(".note", palco).style.transform = ""; $(".cel", palco).style.transform = ""; });
  }

  // revelar ao rolar
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("on"); io.unobserve(e.target); } }), { threshold: .15 });
  $$(".revela").forEach(el => io.observe(el));

  // demonstração e contato
  const demo = (cfg.demoUrl || "demo/").replace(/\/?$/, "/");
  aplicarSegmento(new URLSearchParams(location.search).get("seg") || "");
  $$(".seletor-area [data-seg], [data-ir-seg]").forEach(b => b.addEventListener("click", e => {
    e.preventDefault();
    aplicarSegmento(b.dataset.seg ?? b.dataset.irSeg);
    if (b.dataset.irSeg) scrollTo({ top: 0, behavior: "smooth" });
  }));
  $("#falar").href = SUPORTE_WHATS ? linkWhats(SUPORTE_WHATS, "Olá! Quero saber mais sobre o Marcaí para o meu negócio.") : "#planos";

  // planos: do banco quando configurado; senão, a tabela padrão
  let planos = [
    { nome: "Básico", preco_mensal: 89, profissionais_inclusos: 1, preco_extra: 20, fidelidade_meses: 0, ajustes_mes: 0, recursos: [], descricao: "Agenda online 24h, página de agendamento, conta do cliente, avaliações e caixa." },
    { nome: "Profissional", preco_mensal: 249, profissionais_inclusos: 2, preco_extra: 20, fidelidade_meses: 12, ajustes_mes: 2, recursos: ["site", "relatorios_completos", "comissoes", "emails"], descricao: "Tudo do Básico + site próprio com domínio, relatórios completos e comissões." },
    { nome: "Premium", preco_mensal: 349, profissionais_inclusos: 4, preco_extra: 20, fidelidade_meses: 12, ajustes_mes: 5, recursos: ["site", "relatorios_completos", "comissoes", "emails", "marketing", "estoque"], descricao: "Tudo do Profissional + promoções por horário, cupons, pacotes, marketing e estoque." },
  ];
  if (configurado) {
    const { data } = await sb.from("planos").select("*").eq("ativo", true).order("ordem").order("preco_mensal");
    if (data?.length) planos = data;
  }
  const destaque = planos.length >= 3 ? planos[Math.floor(planos.length / 2)].nome : null;
  const BASE = ["Agenda online 24h", "Página de agendamento com seu link", "Conta do cliente e avaliações", "Caixa e comandas"];
  const EXTRAS = [["site", "Site próprio + domínio .com.br"], ["relatorios_completos", "Relatórios completos"], ["comissoes", "Comissão por profissional"], ["marketing", "Promoções, cupons e pacotes"], ["estoque", "Estoque de produtos"]];
  const inclusos = n => `${n} profissiona${n > 1 ? "is" : "l"} incluso${n > 1 ? "s" : ""}`;
  $("#lista-planos").innerHTML = planos.map((p, k) => `<div class="plano revela atraso-${k + 1} ${p.nome === destaque ? "destaque" : ""}">
      ${p.nome === destaque ? `<span class="selo">Mais escolhido</span>` : ""}
      <h3>${esc(p.nome)}</h3><p class="desc">${esc(p.descricao || "")}</p>
      <div class="preco">${dinheiro(p.preco_mensal).replace(",00", "")}<small> /mês</small></div>
      <p class="extra">+ ${dinheiro(p.preco_extra ?? 20).replace(",00", "")}/mês por profissional a mais${p.fidelidade_meses ? ` · fidelidade de ${p.fidelidade_meses} meses, pago mês a mês` : " · sem fidelidade"}</p>
      <ul><li>${inclusos(p.profissionais_inclusos || 1)}</li>
        ${p.ajustes_mes ? `<li>${p.ajustes_mes} ajuste${p.ajustes_mes === 1 ? "" : "s"} no site por mês</li>` : ""}
        ${BASE.map(t => `<li>${t}</li>`).join("")}
        ${EXTRAS.map(([r, t]) => `<li class="${(p.recursos || []).includes(r) ? "" : "nao"}">${t}</li>`).join("")}</ul>
      <a class="btn ${p.nome === destaque ? "btn-cobre" : ""}" href="painel.html">Testar grátis</a></div>`).join("");
  $$("#lista-planos .revela").forEach(el => io.observe(el));
})();
