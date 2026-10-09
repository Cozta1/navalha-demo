// Página de vendas do Navalha: animações, tema, planos (do banco, com reserva fixa) e links da demonstração.
(async () => {
  // domínio próprio de uma barbearia → abre o site dela
  if (configurado) {
    const { data: slug } = await sb.rpc("barbearia_por_dominio", { p_host: location.hostname });
    if (slug) return location.replace(`site.html?b=${encodeURIComponent(slug)}`);
  }

  $("#tema").replaceWith(botaoTema());
  $("#ano").textContent = new Date().getFullYear();

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
  quebra(h1);

  // topo ganha fundo ao rolar
  const topo = $("#topo");
  const marca = () => topo.classList.toggle("rolou", scrollY > 20);
  addEventListener("scroll", marca, { passive: true }); marca();

  // faixa de recursos (duplicada para o loop não ter emenda)
  const itens = ["Site próprio", "Domínio .com.br", "Agenda 24h", "Lembrete no WhatsApp", "Lista de espera", "Caixa e comissões", "Promoções e cupons", "Pacotes de corte", "Avaliações", "Relatórios"];
  $("#faixa").innerHTML = [...itens, ...itens].map(t => `<span>${t}</span>`).join("");

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
  $("#demo-site").href = `${demo}site.html?b=os-barbeiros-jf`;
  $("#demo-agendar").href = `${demo}agendar.html?b=os-barbeiros-jf`;
  $("#demo-painel").href = `${demo}painel.html`;
  $("#falar").href = SUPORTE_WHATS ? linkWhats(SUPORTE_WHATS, "Olá! Quero saber mais sobre o Navalha para a minha barbearia.") : "#planos";

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
