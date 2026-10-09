// Banco local da demonstração: imita o Supabase dentro do navegador e guarda tudo no
// localStorage deste aparelho. As regras (horários livres, conflito de horário, caixa,
// estoque, comissões, relatórios, planos) são as mesmas de supabase/schema.sql.
// Usado só na demo publicada (scripts/gerar-demo.py troca o supabase-js por este arquivo).
(() => {
  const CHAVE = "marcai_demo_db";
  const VERSAO = 2; // muda quando os dados de exemplo mudam (recria a demo de quem já abriu)
  const FUSO = "America/Sao_Paulo";
  const Q = new URLSearchParams(location.search);

  // ---------------------------------------------------------------- utilidades
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 3 | 8)).toString(16); }));
  const agoraIso = () => new Date().toISOString();
  const clone = v => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
  const r2 = n => Math.round(Number(n) * 100) / 100;
  const dig = v => String(v ?? "").replace(/\D/g, "");
  const erro = msg => { const e = new Error(msg); e.local = true; throw e; };

  const fmtPartes = {};
  function partes(instante, fuso = FUSO) {
    const f = fmtPartes[fuso] ??= new Intl.DateTimeFormat("en-CA", { timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    const p = Object.fromEntries(f.formatToParts(new Date(instante)).map(x => [x.type, x.value]));
    return { data: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` };
  }
  const dataLocal = (instante, fuso) => partes(instante, fuso).data;
  const minutosLocal = (instante, fuso) => { const h = partes(instante, fuso).hora; return +h.slice(0, 2) * 60 + +h.slice(3, 5); };
  const dow = data => new Date(`${data}T12:00:00Z`).getUTCDay();
  const somaDias = (data, n) => new Date(Date.parse(`${data}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
  const minT = t => +String(t).slice(0, 2) * 60 + +String(t).slice(3, 5);
  // data + hora no fuso -> instante (Date)
  function instante(data, hora, fuso = FUSO) {
    const alvo = Date.parse(`${data}T${String(hora).slice(0, 5)}:00Z`);
    let t = alvo;
    for (let i = 0; i < 3; i++) {
      const p = partes(t, fuso), visto = Date.parse(`${p.data}T${p.hora}:00Z`);
      t += alvo - visto;
    }
    return new Date(t);
  }
  const hojeEm = fuso => dataLocal(Date.now(), fuso);

  // gerador previsível para os dados de exemplo
  function aleatorio(semente) {
    let s = semente >>> 0;
    return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // ---------------------------------------------------------------- armazenamento
  const TABELAS = ["barbearias", "membros", "profissionais", "servicos", "profissional_servicos", "jornadas", "bloqueios", "clientes",
    "agendamentos", "agendamento_itens", "lista_espera", "promocoes", "cupons", "pacotes", "pacotes_clientes", "avaliacoes",
    "produtos", "movimentos_estoque", "comandas", "comanda_itens", "comanda_pagamentos", "plataforma_admins", "planos",
    "assinaturas", "pagamentos_assinatura", "convites", "pedidos_ajuste"];
  const CHAVES = { membros: ["barbearia_id", "user_id"], profissional_servicos: ["profissional_id", "servico_id"], assinaturas: ["barbearia_id"], plataforma_admins: ["user_id"] };
  const chaveDe = t => CHAVES[t] || ["id"];

  let db;
  function carregar() {
    try { db = JSON.parse(localStorage.getItem(CHAVE)); } catch { db = null; }
    // dados de exemplo novos a cada dia, enquanto ninguém mexeu em nada (assim o "hoje" da demo está sempre cheio)
    if (!db || db.versao !== VERSAO || (!db.mexeu && db.semeado_em !== hojeEm(FUSO))) {
      const sessao = db?.sessao ?? null;
      db = semear();
      db.sessao = sessao && db.usuarios.some(u => u.id === sessao) ? sessao : null;
      salvar();
    }
  }
  function salvar() {
    try { localStorage.setItem(CHAVE, JSON.stringify(db)); }
    catch { alert("O espaço da demonstração neste navegador acabou (fotos grandes ocupam muito). Use \"Restaurar dados de exemplo\" no menu DEMO."); }
  }
  const T = nome => (db.t[nome] ||= []);
  const mexeu = () => { db.mexeu = true; };

  // ---------------------------------------------------------------- sessão e permissões
  const usuario = () => db.usuarios.find(u => u.id === db.sessao) || null;
  const uid = () => usuario()?.id ?? null;
  const emailSessao = () => usuario()?.email ?? null;
  const membro = b => T("membros").find(m => m.barbearia_id === b && m.user_id === uid());
  const isMembro = b => !!membro(b);
  const isDono = b => membro(b)?.papel === "dono";
  const meuProf = b => (membro(b)?.papel === "barbeiro" ? membro(b).profissional_id : null);
  const podeProf = (b, p) => isDono(b) || (p != null && p === meuProf(b));
  const isAdmin = () => T("plataforma_admins").some(a => a.user_id === uid());
  const barbearia = id => T("barbearias").find(b => b.id === id);
  function assinaturaAtiva(b) {
    const a = T("assinaturas").find(x => x.barbearia_id === b), bb = barbearia(b);
    if (!a || !bb) return false;
    if (a.status === "teste") return !a.teste_ate || a.teste_ate >= hojeEm(bb.fuso);
    return a.status === "ativa" || a.status === "atrasada";
  }
  function planoTem(b, recurso) {
    const a = T("assinaturas").find(x => x.barbearia_id === b), bb = barbearia(b);
    if (!a || !bb) return false;
    if (a.status === "teste" && (!a.teste_ate || a.teste_ate >= hojeEm(bb.fuso))) return true;
    const pl = T("planos").find(p => p.id === a.plano_id);
    return !!pl?.recursos?.includes(recurso);
  }

  // plano + profissionais ativos além dos inclusos
  function mensalidade(b) {
    const a = T("assinaturas").find(x => x.barbearia_id === b), pl = a && T("planos").find(p => p.id === a.plano_id);
    if (!pl) return null;
    const ativos = T("profissionais").filter(p => p.barbearia_id === b && p.ativo).length;
    return r2(Number(pl.preco_mensal) + Math.max(0, ativos - pl.profissionais_inclusos) * Number(pl.preco_extra));
  }

  // ---------------------------------------------------------------- linhas novas: padrões e gatilhos
  function padrao(t) {
    const agora = agoraIso();
    return ({
      barbearias: { whatsapp: null, endereco: null, logo_url: null, site_url: null, cor_destaque: "#2e6bff", fuso: FUSO, intervalo_min: 30, antecedencia_min: 60, dias_abertos: 30,
        cancelamento_horas: 2, max_futuros: 3, tema: "urbano", site_titulo: null, site_texto: null, instagram: null, maps_url: null, hero_url: null, fotos: [], dominio: null, criado_em: agora },
      membros: { papel: "dono", profissional_id: null },
      profissionais: { foto_url: null, ativo: true, ordem: 0, comissao_servico_pct: 40, comissao_produto_pct: 10 },
      servicos: { descricao: null, ativo: true, ordem: 0 },
      profissional_servicos: { preco: null, duracao_min: null },
      bloqueios: { motivo: null },
      clientes: { email: null, nascimento: null, observacoes: null, ultimo_contato: null, criado_em: agora },
      agendamentos: { cliente_id: null, status: "confirmado", origem: "online", observacao: null, codigo: uuid(), user_id: null, cancelado_por: null, reagendado_em: null,
        cupom_id: null, desconto_cupom: 0, criado_em: agora },
      agendamento_itens: { preco_cheio: null, promocao: null, ordem: 0 },
      lista_espera: { cliente_id: null, servico_id: null, profissional_id: null, periodo: "qualquer", status: "aguardando", criado_em: agora },
      promocoes: { servico_ids: null, validade_de: null, validade_ate: null, ativa: true, criado_em: agora },
      cupons: { validade_ate: null, usos_max: null, usos: 0, uso_por_cliente: 1, ativo: true, criado_em: agora },
      pacotes: { validade_dias: 30, ativo: true },
      pacotes_clientes: { pacote_id: null, usados: 0, valor_sessao: 0, comanda_id: null, status: "ativo", criado_em: agora },
      avaliacoes: { profissional_id: null, comentario: null, servico_nome: null, resposta: null, respondido_em: null, publicada: true, criado_em: agora },
      produtos: { custo: null, estoque: 0, estoque_minimo: 0, ativo: true, criado_em: agora },
      movimentos_estoque: { custo_unit: null, comanda_id: null, observacao: null, user_id: uid(), criado_em: agora },
      comandas: { agendamento_id: null, cliente_id: null, cliente_nome: null, profissional_id: null, status: "aberta", subtotal: 0, desconto: 0, total: 0, observacao: null,
        motivo_cancelamento: null, aberta_em: agora, fechada_em: null, cancelada_em: null },
      comanda_itens: { servico_id: null, produto_id: null, pacote_id: null, pacote_cliente_id: null, profissional_id: null, quantidade: 1, total: 0, comissao_pct: null, comissao_valor: null },
      comanda_pagamentos: { criado_em: agora },
      planos: { max_profissionais: null, ativo: true, ordem: 0, recursos: [], ajustes_mes: 1, descricao: null, profissionais_inclusos: 1, preco_extra: 20, fidelidade_meses: 0 },
      assinaturas: { plano_id: null, status: "teste", teste_ate: null, vencimento: null, fidelidade_ate: null, observacao: null, atualizado_em: agora },
      pagamentos_assinatura: { forma: "pix", pago_em: hojeEm(FUSO), criado_em: agora },
      convites: { token: uuid(), expira_em: new Date(Date.now() + 7 * 86400000).toISOString(), aceito_em: null, criado_em: agora },
      pedidos_ajuste: { status: "aberto", resposta: null, criado_em: agora, atualizado_em: agora },
    })[t] || {};
  }

  const ativoNaAgenda = a => a.status === "confirmado" || a.status === "concluido";
  function conferirConflito(a) {
    if (!ativoNaAgenda(a)) return;
    const ini = Date.parse(a.inicio), fim = Date.parse(a.fim);
    if (!(fim > ini)) erro("O horário final precisa ser depois do inicial.");
    if (T("agendamentos").some(x => x.id !== a.id && x.profissional_id === a.profissional_id && ativoNaAgenda(x) && Date.parse(x.inicio) < fim && Date.parse(x.fim) > ini))
      erro("conflicting key value violates exclusion constraint \"agendamento_sem_conflito\"");
  }
  function limiteProfissionais(p) {
    const a = T("assinaturas").find(x => x.barbearia_id === p.barbearia_id), pl = a && T("planos").find(x => x.id === a.plano_id);
    const lim = pl?.max_profissionais;
    if (lim != null && p.ativo && T("profissionais").filter(x => x.barbearia_id === p.barbearia_id && x.ativo && x.id !== p.id).length >= lim)
      erro(`Seu plano permite até ${lim} profissionais ativos. Fale com a gente para mudar de plano.`);
  }
  function itemComanda(i) {
    if (i.pacote_cliente_id) i.preco_unit = 0;
    i.total = r2(Number(i.quantidade) * Number(i.preco_unit));
    if (i.tipo === "pacote") i.comissao_pct = 0;
    if (i.comissao_pct == null && i.profissional_id) {
      const p = T("profissionais").find(x => x.id === i.profissional_id);
      if (p) i.comissao_pct = i.tipo === "servico" ? p.comissao_servico_pct : p.comissao_produto_pct;
    }
  }
  function unico(t, linha) {
    const regras = { clientes: [["barbearia_id", "telefone"]], cupons: [["barbearia_id", "codigo"]], barbearias: [["slug"], ["dominio"]], avaliacoes: [["agendamento_id"]] }[t] || [];
    for (const cols of regras) {
      if (cols.some(c => linha[c] == null)) continue;
      if (T(t).some(x => x !== linha && cols.every(c => x[c] === linha[c]))) erro(`duplicate key value violates unique constraint "${t}_${cols.join("_")}_key"`);
    }
  }

  function inserir(t, valores) {
    const linha = { ...padrao(t), ...clone(valores) };
    if (chaveDe(t)[0] === "id" && !linha.id) linha.id = uuid();
    if (t === "agendamentos" && !valores.codigo) linha.codigo = uuid();
    if (t === "convites" && !valores.token) linha.token = uuid();
    if (t === "produtos") linha.estoque = 0;
    if (t === "profissionais") limiteProfissionais(linha);
    if (t === "comanda_itens") itemComanda(linha);
    if (t === "agendamentos") conferirConflito(linha);
    if (chaveDe(t)[0] !== "id" && T(t).some(x => chaveDe(t).every(c => x[c] === linha[c]))) erro(`duplicate key value violates unique constraint "${t}_pkey"`);
    unico(t, linha);
    T(t).push(linha);
    // gatilhos depois de inserir
    if (t === "servicos") for (const p of T("profissionais").filter(x => x.barbearia_id === linha.barbearia_id))
      if (!T("profissional_servicos").some(x => x.profissional_id === p.id && x.servico_id === linha.id)) inserir("profissional_servicos", { barbearia_id: linha.barbearia_id, profissional_id: p.id, servico_id: linha.id });
    if (t === "profissionais") for (const s of T("servicos").filter(x => x.barbearia_id === linha.barbearia_id))
      if (!T("profissional_servicos").some(x => x.profissional_id === linha.id && x.servico_id === s.id)) inserir("profissional_servicos", { barbearia_id: linha.barbearia_id, profissional_id: linha.id, servico_id: s.id });
    if (t === "movimentos_estoque") {
      const p = T("produtos").find(x => x.id === linha.produto_id);
      if (p) { p.estoque += Number(linha.quantidade); if (linha.tipo === "entrada" && linha.custo_unit != null) p.custo = linha.custo_unit; }
    }
    return linha;
  }

  function atualizar(t, linha, mudancas) {
    const antes = clone(linha), novo = { ...linha, ...clone(mudancas) };
    if (t === "produtos" && "estoque" in mudancas && Number(mudancas.estoque) !== antes.estoque) erro("Use uma entrada ou ajuste de estoque para mudar a quantidade.");
    if (t === "avaliacoes") {
      if (novo.nota !== antes.nota || novo.comentario !== antes.comentario) erro("A nota e o comentário do cliente não podem ser alterados.");
      if (novo.resposta !== antes.resposta) novo.respondido_em = agoraIso();
    }
    if (t === "pedidos_ajuste") novo.atualizado_em = agoraIso();
    if (t === "comanda_itens") itemComanda(novo);
    if (t === "profissionais" && "ativo" in mudancas && novo.ativo && !antes.ativo) limiteProfissionais(novo);
    if (t === "agendamentos") conferirConflito(novo);
    unico(t, novo);
    Object.assign(linha, novo);
    if (t === "agendamentos" && linha.cupom_id && antes.status !== linha.status) {
      const c = T("cupons").find(x => x.id === linha.cupom_id);
      if (c && linha.status === "cancelado") c.usos = Math.max(0, c.usos - 1);
      else if (c && antes.status === "cancelado") c.usos += 1;
    }
    return linha;
  }

  function apagar(t, linhas) {
    const ids = new Set(linhas.map(l => l.id));
    db.t[t] = T(t).filter(l => !linhas.includes(l));
    const tira = (tab, cond) => { db.t[tab] = T(tab).filter(x => !cond(x)); };
    const anula = (tab, col) => T(tab).forEach(x => { if (ids.has(x[col])) x[col] = null; });
    if (t === "profissionais") { ["jornadas", "profissional_servicos", "bloqueios", "membros", "convites"].forEach(tab => tira(tab, x => ids.has(x.profissional_id))); }
    if (t === "servicos") { tira("profissional_servicos", x => ids.has(x.servico_id)); tira("pacotes", x => ids.has(x.servico_id)); anula("agendamento_itens", "servico_id"); }
    if (t === "produtos") tira("movimentos_estoque", x => ids.has(x.produto_id));
    if (t === "comandas") { tira("comanda_itens", x => ids.has(x.comanda_id)); tira("comanda_pagamentos", x => ids.has(x.comanda_id)); }
    if (t === "agendamentos") { tira("agendamento_itens", x => ids.has(x.agendamento_id)); tira("avaliacoes", x => ids.has(x.agendamento_id)); anula("comandas", "agendamento_id"); }
    if (t === "clientes") { tira("pacotes_clientes", x => ids.has(x.cliente_id)); anula("agendamentos", "cliente_id"); anula("comandas", "cliente_id"); anula("lista_espera", "cliente_id"); }
    if (t === "pacotes") anula("pacotes_clientes", "pacote_id");
  }

  // ---------------------------------------------------------------- consultas (from)
  const singular = n => n.replace(/s$/, "");
  function projetar(t, linha, colunas) {
    const cols = [], embeds = [];
    let nivel = 0, atual = "";
    for (const ch of colunas.replace(/\s+/g, "")) {
      if (ch === "(") nivel++;
      if (ch === ")") nivel--;
      if (ch === "," && nivel === 0) { cols.push(atual); atual = ""; } else atual += ch;
    }
    if (atual) cols.push(atual);
    const out = cols.includes("*") || !cols.length ? clone(linha) : {};
    for (const c of cols) {
      const m = c.match(/^(\w+)\((.*)\)$/);
      if (m) embeds.push(m);
      else if (c !== "*") out[c] = clone(linha[c]);
    }
    for (const [, tab, sub] of embeds) {
      const fk = linha[`${singular(tab)}_id`];
      const alvo = T(tab).find(x => x.id === fk);
      out[tab] = alvo ? projetar(tab, alvo, sub || "*") : null;
    }
    return out;
  }
  const cmp = (a, b) => {
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    if (typeof a === "number" && typeof b === "number") return a - b;
    return String(a).localeCompare(String(b), "pt-BR");
  };
  const igual = (a, b) => (typeof a === "number" || typeof b === "number" ? Number(a) === Number(b) : a === b);
  const compara = (a, b) => (typeof a === "number" || typeof b === "number" ? Number(a) - Number(b) : String(a).localeCompare(String(b)));

  function consulta(t) {
    const filtros = [], ordens = [];
    let op = "select", valores = null, colunas = "*", devolver = false, limite = null, unicoModo = null, conflito = null;
    const q = {
      select(c = "*") { colunas = c; if (op !== "select") devolver = true; return q; },
      insert(v) { op = "insert"; valores = v; return q; },
      upsert(v, o = {}) { op = "upsert"; valores = v; conflito = o.onConflict ? o.onConflict.split(",") : null; return q; },
      update(v) { op = "update"; valores = v; return q; },
      delete() { op = "delete"; return q; },
      eq(c, v) { filtros.push(l => l[c] != null && igual(l[c], v)); return q; },
      neq(c, v) { filtros.push(l => l[c] == null || !igual(l[c], v)); return q; },
      gt(c, v) { filtros.push(l => l[c] != null && compara(l[c], v) > 0); return q; },
      gte(c, v) { filtros.push(l => l[c] != null && compara(l[c], v) >= 0); return q; },
      lt(c, v) { filtros.push(l => l[c] != null && compara(l[c], v) < 0); return q; },
      lte(c, v) { filtros.push(l => l[c] != null && compara(l[c], v) <= 0); return q; },
      in(c, v) { filtros.push(l => v.some(x => igual(l[c], x))); return q; },
      is(c, v) { filtros.push(l => (l[c] ?? null) === v); return q; },
      contains(c, v) { filtros.push(l => [].concat(v).every(x => (l[c] || []).includes(x))); return q; },
      ilike(c, v) { const re = new RegExp("^" + String(v).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*") + "$", "i"); filtros.push(l => re.test(l[c] ?? "")); return q; },
      order(c, o = {}) { ordens.push([c, o.ascending !== false]); return q; },
      limit(n) { limite = n; return q; },
      single() { unicoModo = "single"; return q; },
      maybeSingle() { unicoModo = "maybe"; return q; },
      then(ok, falha) { return Promise.resolve().then(executar).then(ok, falha); },
    };
    const casa = l => filtros.every(f => f(l));
    function executar() {
      try {
        let linhas;
        if (op === "select") linhas = T(t).filter(casa);
        else {
          mexeu();
          if (op === "insert") linhas = [].concat(valores).map(v => inserir(t, v));
          if (op === "upsert") linhas = [].concat(valores).map(v => {
            const ch = conflito || chaveDe(t), achada = T(t).find(x => ch.every(c => x[c] === v[c]));
            return achada ? atualizar(t, achada, v) : inserir(t, v);
          });
          if (op === "update") linhas = T(t).filter(casa).map(l => atualizar(t, l, valores));
          if (op === "delete") { linhas = T(t).filter(casa); apagar(t, linhas); }
          salvar();
          if (!devolver) return { data: null, error: null };
        }
        if (ordens.length) linhas = [...linhas].sort((a, b) => { for (const [c, asc] of ordens) { const r = cmp(a[c], b[c]); if (r) return asc ? r : -r; } return 0; });
        if (limite != null) linhas = linhas.slice(0, limite);
        const data = linhas.map(l => projetar(t, l, colunas));
        if (unicoModo === "single" && data.length !== 1) return { data: null, error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" } };
        if (unicoModo) return { data: data[0] ?? null, error: null };
        return { data, error: null };
      } catch (e) {
        carregar(); // desfaz a operação que falhou no meio
        return { data: null, error: { message: e.message } };
      }
    }
    return q;
  }

  // ---------------------------------------------------------------- funções (rpc)
  function combo(b, servs) {
    const res = [];
    for (const p of T("profissionais").filter(x => x.barbearia_id === b && x.ativo)) {
      let dur = 0, preco = 0, ok = true;
      for (const s of servs) {
        const sv = T("servicos").find(x => x.id === s && x.ativo), ps = T("profissional_servicos").find(x => x.profissional_id === p.id && x.servico_id === s);
        if (!sv || !ps) { ok = false; break; }
        dur += Number(ps.duracao_min ?? sv.duracao_min); preco += Number(ps.preco ?? sv.preco);
      }
      if (ok) res.push({ profissional_id: p.id, duracao_min: dur, preco: r2(preco), prof: p });
    }
    return res;
  }
  function promocaoDoHorario(b, servico, ini) {
    if (!planoTem(b, "marketing")) return null;
    const bb = barbearia(b), p = partes(ini, bb.fuso), m = minT(p.hora), d = dow(p.data);
    return T("promocoes").filter(pr => pr.barbearia_id === b && pr.ativa && pr.dias_semana.includes(d)
      && m >= minT(pr.hora_inicio) && m < minT(pr.hora_fim)
      && (!pr.validade_de || p.data >= pr.validade_de) && (!pr.validade_ate || p.data <= pr.validade_ate)
      && (!pr.servico_ids?.length || pr.servico_ids.includes(servico)))
      .sort((x, y) => y.desconto_pct - x.desconto_pct)[0] || null;
  }
  const precoItem = (b, profId, servId, ini) => {
    const sv = T("servicos").find(x => x.id === servId), ps = T("profissional_servicos").find(x => x.profissional_id === profId && x.servico_id === servId);
    const cheio = Number(ps?.preco ?? sv.preco), pm = promocaoDoHorario(b, servId, ini);
    return { servico_id: servId, nome: sv.nome, preco_cheio: cheio, preco: r2(cheio * (1 - (pm ? pm.desconto_pct : 0) / 100)), promocao: pm?.nome ?? null, duracao_min: Number(ps?.duracao_min ?? sv.duracao_min) };
  };
  const semRepetir = l => [...new Set(l || [])];

  function horariosDisponiveis({ p_barbearia, p_servicos, p_data, p_profissional = null, p_ignorar = null }) {
    const b = barbearia(p_barbearia), servs = semRepetir(p_servicos);
    if (!b || !servs.length || !assinaturaAtiva(b.id)) return [];
    const hoje = hojeEm(b.fuso);
    if (p_data < hoje || p_data > somaDias(hoje, b.dias_abertos)) return [];
    const minimo = Date.now() + b.antecedencia_min * 60000, out = [];
    for (const c of combo(b.id, servs)) {
      if (p_profissional && c.profissional_id !== p_profissional) continue;
      const ocupados = [
        ...T("agendamentos").filter(a => a.profissional_id === c.profissional_id && ativoNaAgenda(a) && a.id !== p_ignorar),
        ...T("bloqueios").filter(k => k.profissional_id === c.profissional_id),
      ].map(x => [Date.parse(x.inicio), Date.parse(x.fim)]);
      for (const j of T("jornadas").filter(j => j.profissional_id === c.profissional_id && j.dia_semana === dow(p_data))) {
        const fimJ = instante(p_data, j.fim, b.fuso).getTime() - c.duracao_min * 60000;
        for (let t = instante(p_data, j.inicio, b.fuso).getTime(); t <= fimJ; t += b.intervalo_min * 60000) {
          const f = t + c.duracao_min * 60000;
          if (t < minimo || ocupados.some(([i, e]) => i < f && e > t)) continue;
          const itens = servs.map(s => precoItem(b.id, c.profissional_id, s, t));
          out.push({ profissional_id: c.profissional_id, inicio: new Date(t).toISOString(), duracao_min: c.duracao_min,
            preco: r2(itens.reduce((x, i) => x + i.preco, 0)), preco_cheio: c.preco, promocao: itens.find(i => i.promocao)?.promocao ?? null, _ordem: c.prof.ordem, _nome: c.prof.nome });
        }
      }
    }
    return out.sort((x, y) => x.inicio.localeCompare(y.inicio) || x._ordem - y._ordem || x._nome.localeCompare(y._nome))
      .map(({ _ordem, _nome, ...h }) => h);
  }

  function salvarCliente(b, nome, tel, email) {
    const e = (email || "").trim().toLowerCase() || null;
    const c = T("clientes").find(x => x.barbearia_id === b && x.telefone === tel);
    if (c) { c.nome = nome; c.email = e ?? c.email; return c.id; }
    return inserir("clientes", { barbearia_id: b, nome, telefone: tel, email: e }).id;
  }

  function calcularCupom(b, codigo, tel, subtotal) {
    const bb = barbearia(b), c = T("cupons").find(x => x.barbearia_id === b && x.codigo === String(codigo || "").trim().toUpperCase());
    if (!c || !c.ativo || !planoTem(b, "marketing")) erro("Cupom inválido.");
    if (c.validade_ate && c.validade_ate < hojeEm(bb.fuso)) erro("Este cupom venceu.");
    if (c.usos_max != null && c.usos >= c.usos_max) erro("Este cupom já foi todo usado.");
    const t = dig(tel);
    if (t && T("agendamentos").filter(a => a.cupom_id === c.id && a.cliente_telefone === t && a.status !== "cancelado").length >= c.uso_por_cliente) erro("Você já usou este cupom.");
    const sub = Number(subtotal || 0);
    return { cupom_id: c.id, desconto: Math.min(sub, r2(c.tipo === "pct" ? sub * c.valor / 100 : c.valor)),
      descricao: c.tipo === "pct" ? `${String(Number(c.valor)).replace(".", ",")}% de desconto` : `R$ ${Number(c.valor).toFixed(2)} de desconto` };
  }

  function criarItens(agId, b, profId, servs, ini, comPromo) {
    servs.forEach((s, k) => {
      const it = precoItem(b, profId, s, ini);
      inserir("agendamento_itens", { agendamento_id: agId, servico_id: s, nome: it.nome, preco: comPromo ? it.preco : it.preco_cheio,
        preco_cheio: comPromo ? it.preco_cheio : null, promocao: comPromo ? it.promocao : null, duracao_min: it.duracao_min, ordem: k + 1 });
    });
  }
  const somaItens = agId => r2(T("agendamento_itens").filter(i => i.agendamento_id === agId).reduce((x, i) => x + Number(i.preco), 0));
  const nomeServicos = (servs) => servs.map(s => T("servicos").find(x => x.id === s).nome).join(" + ");

  const RPC = {
    horarios_disponiveis: horariosDisponiveis,

    criar_agendamento({ p_barbearia, p_servicos, p_profissional, p_inicio, p_nome, p_telefone, p_email = null, p_observacao = null, p_cupom = null }) {
      const b = barbearia(p_barbearia), servs = semRepetir(p_servicos);
      if (!b) erro("Barbearia não encontrada.");
      if (!assinaturaAtiva(b.id)) erro("A agenda online deste estabelecimento está indisponível no momento. Fale com ele pelo WhatsApp.");
      if (!servs.length) erro("Escolha pelo menos um serviço.");
      if (servs.length > 5) erro("Escolha no máximo 5 serviços por visita.");
      const nome = String(p_nome || "").trim();
      if (nome.length < 2 || nome.length > 80) erro("Informe seu nome.");
      const tel = dig(p_telefone);
      if (tel.length < 10 || tel.length > 13) erro("Telefone inválido. Use DDD + número.");
      if (p_email && String(p_email).trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p_email)) erro("E-mail inválido.");
      if (T("agendamentos").filter(a => a.barbearia_id === b.id && a.cliente_telefone === tel && a.status === "confirmado" && Date.parse(a.inicio) > Date.now()).length >= b.max_futuros)
        erro(`Este telefone já tem ${b.max_futuros} horários marcados. Fale com o estabelecimento pelo WhatsApp.`);
      const alvo = Date.parse(p_inicio);
      const h = horariosDisponiveis({ p_barbearia: b.id, p_servicos: servs, p_data: dataLocal(alvo, b.fuso), p_profissional })
        .find(x => Date.parse(x.inicio) === alvo);
      if (!h) erro("Esse horário acabou de ser ocupado. Escolha outro.");
      const cid = salvarCliente(b.id, nome, tel, (p_email || "").trim() || emailSessao());
      const novo = inserir("agendamentos", { barbearia_id: b.id, profissional_id: h.profissional_id, cliente_id: cid, servico_nome: nomeServicos(servs), preco: h.preco,
        cliente_nome: nome, cliente_telefone: tel, inicio: new Date(alvo).toISOString(), fim: new Date(alvo + h.duracao_min * 60000).toISOString(), origem: "online",
        observacao: String(p_observacao || "").trim().slice(0, 300) || null, user_id: uid() });
      criarItens(novo.id, b.id, h.profissional_id, servs, alvo, true);
      let total = somaItens(novo.id);
      if (String(p_cupom || "").trim()) {
        const cp = calcularCupom(b.id, p_cupom, tel, total);
        T("cupons").find(x => x.id === cp.cupom_id).usos += 1;
        Object.assign(novo, { cupom_id: cp.cupom_id, desconto_cupom: cp.desconto });
        total = r2(total - cp.desconto);
      }
      novo.preco = total;
      T("lista_espera").forEach(e => { if (e.barbearia_id === b.id && e.telefone === tel && e.data === dataLocal(alvo, b.fuso) && ["aguardando", "avisado"].includes(e.status)) e.status = "agendado"; });
      return { codigo: novo.codigo };
    },

    consultar_agendamento({ p_codigo }) {
      const a = T("agendamentos").find(x => x.codigo === p_codigo);
      if (!a) return null;
      const b = barbearia(a.barbearia_id), p = T("profissionais").find(x => x.id === a.profissional_id), v = T("avaliacoes").find(x => x.agendamento_id === a.id);
      const prazo = Date.parse(a.inicio) - b.cancelamento_horas * 3600000;
      return {
        barbearia: { id: b.id, nome: b.nome, slug: b.slug, whatsapp: b.whatsapp, endereco: b.endereco, fuso: b.fuso, logo_url: b.logo_url, site_url: b.site_url, cor_destaque: b.cor_destaque, cancelamento_horas: b.cancelamento_horas },
        id: a.id, servico: a.servico_nome, preco: a.preco, desconto_cupom: a.desconto_cupom,
        servicos: T("agendamento_itens").filter(i => i.agendamento_id === a.id).sort((x, y) => x.ordem - y.ordem)
          .map(i => ({ id: i.servico_id, nome: i.nome, preco: i.preco, preco_cheio: i.preco_cheio, promocao: i.promocao, duracao_min: i.duracao_min })),
        profissional: p?.nome, profissional_id: p?.id, cliente: a.cliente_nome, inicio: a.inicio, fim: a.fim, status: a.status,
        pode_alterar: a.status === "confirmado" && Date.now() < prazo,
        pode_avaliar: a.status === "concluido" && Date.parse(a.inicio) > Date.now() - 30 * 86400000 && !v,
        avaliacao: v ? { nota: v.nota, comentario: v.comentario, resposta: v.resposta } : null,
        prazo_alteracao: new Date(prazo).toISOString(),
      };
    },

    cancelar_agendamento({ p_codigo }) {
      const a = T("agendamentos").find(x => x.codigo === p_codigo);
      if (!a || a.status !== "confirmado" || Date.parse(a.inicio) <= Date.now() + barbearia(a.barbearia_id).cancelamento_horas * 3600000) return false;
      atualizar("agendamentos", a, { status: "cancelado", cancelado_por: "cliente" });
      return true;
    },

    reagendar_agendamento({ p_codigo, p_inicio, p_profissional = null }) {
      const a = T("agendamentos").find(x => x.codigo === p_codigo);
      if (!a) erro("Agendamento não encontrado.");
      const b = barbearia(a.barbearia_id);
      if (a.status !== "confirmado" || Date.parse(a.inicio) <= Date.now() + b.cancelamento_horas * 3600000) erro("Este horário não pode mais ser alterado pelo site. Fale com o estabelecimento.");
      const itens = T("agendamento_itens").filter(i => i.agendamento_id === a.id && i.servico_id).sort((x, y) => x.ordem - y.ordem);
      const servs = itens.map(i => i.servico_id), alvo = Date.parse(p_inicio);
      const h = horariosDisponiveis({ p_barbearia: b.id, p_servicos: servs, p_data: dataLocal(alvo, b.fuso), p_profissional, p_ignorar: a.id })
        .filter(x => Date.parse(x.inicio) === alvo).sort((x, y) => (y.profissional_id === a.profissional_id) - (x.profissional_id === a.profissional_id))[0];
      if (!h) erro("Esse horário não está mais livre. Escolha outro.");
      for (const i of itens) Object.assign(i, (({ preco, preco_cheio, promocao, duracao_min }) => ({ preco, preco_cheio, promocao, duracao_min }))(precoItem(b.id, h.profissional_id, i.servico_id, alvo)));
      atualizar("agendamentos", a, { inicio: new Date(alvo).toISOString(), fim: new Date(alvo + h.duracao_min * 60000).toISOString(), profissional_id: h.profissional_id,
        reagendado_em: agoraIso(), preco: Math.max(0, r2(somaItens(a.id) - a.desconto_cupom)) });
      return true;
    },

    entrar_lista_espera({ p_barbearia, p_servico, p_profissional, p_data, p_periodo, p_nome, p_telefone }) {
      const b = barbearia(p_barbearia);
      if (!b) erro("Estabelecimento não encontrado.");
      const s = T("servicos").find(x => x.id === p_servico && x.barbearia_id === b.id && x.ativo);
      if (!s) erro("Serviço indisponível.");
      const nome = String(p_nome || "").trim(), tel = dig(p_telefone);
      if (nome.length < 2 || nome.length > 80) erro("Informe seu nome.");
      if (tel.length < 10 || tel.length > 13) erro("Telefone inválido. Use DDD + número.");
      const hoje = hojeEm(b.fuso);
      if (p_data < hoje || p_data > somaDias(hoje, b.dias_abertos)) erro("Data fora do período de agendamento.");
      if (T("lista_espera").filter(e => e.barbearia_id === b.id && e.telefone === tel && e.status === "aguardando").length >= 3) erro("Você já está em 3 listas de espera.");
      inserir("lista_espera", { barbearia_id: b.id, cliente_id: salvarCliente(b.id, nome, tel, null), nome, telefone: tel, servico_id: s.id, servico_nome: s.nome,
        profissional_id: p_profissional || null, data: p_data, periodo: p_periodo || "qualquer" });
      return true;
    },

    painel_criar_agendamento({ p_barbearia, p_profissional, p_servicos, p_inicio, p_nome, p_telefone, p_observacao = null }) {
      if (!podeProf(p_barbearia, p_profissional)) erro("Sem permissão.");
      const servs = semRepetir(p_servicos), nome = String(p_nome || "").trim(), tel = dig(p_telefone);
      if (!servs.length) erro("Escolha pelo menos um serviço.");
      if (nome.length < 2 || nome.length > 80) erro("Informe o nome do cliente.");
      if (tel.length < 10 || tel.length > 13) erro("Telefone inválido. Use DDD + número.");
      const c = combo(p_barbearia, servs).find(x => x.profissional_id === p_profissional);
      if (!c) erro("Esse profissional não faz todos os serviços escolhidos.");
      const ini = Date.parse(p_inicio);
      const novo = inserir("agendamentos", { barbearia_id: p_barbearia, profissional_id: p_profissional, cliente_id: salvarCliente(p_barbearia, nome, tel, null),
        servico_nome: nomeServicos(servs), preco: c.preco, cliente_nome: nome, cliente_telefone: tel, inicio: new Date(ini).toISOString(),
        fim: new Date(ini + c.duracao_min * 60000).toISOString(), origem: "painel", observacao: String(p_observacao || "").trim().slice(0, 300) || null });
      criarItens(novo.id, p_barbearia, p_profissional, servs, ini, false);
      return novo.id;
    },

    criar_barbearia({ p_nome, p_slug, p_whatsapp, p_profissional }) {
      if (!uid()) erro("Faça login primeiro.");
      if (T("membros").some(m => m.user_id === uid())) erro("Sua conta já tem um estabelecimento.");
      const slug = String(p_slug || "").trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug)) erro("Endereço inválido: use letras minúsculas, números e hífen.");
      if (T("barbearias").some(b => b.slug === slug)) erro("Esse endereço já está em uso. Escolha outro.");
      const b = inserir("barbearias", { nome: String(p_nome || "").trim(), slug, whatsapp: dig(p_whatsapp) || null });
      inserir("membros", { barbearia_id: b.id, user_id: uid(), papel: "dono" });
      inserir("assinaturas", { barbearia_id: b.id, status: "teste", teste_ate: somaDias(hojeEm(FUSO), 14) });
      const p = inserir("profissionais", { barbearia_id: b.id, nome: String(p_profissional || "").trim() || "Profissional" });
      for (let d = 1; d <= 5; d++) inserir("jornadas", { barbearia_id: b.id, profissional_id: p.id, dia_semana: d, inicio: "08:00:00", fim: "20:00:00" });
      inserir("jornadas", { barbearia_id: b.id, profissional_id: p.id, dia_semana: 6, inicio: "08:00:00", fim: "16:00:00" });
      return b.id;
    },

    vincular_agendamentos({ p_codigos }) {
      if (!uid()) erro("Faça login primeiro.");
      let n = 0;
      for (const a of T("agendamentos")) if ((p_codigos || []).slice(0, 50).includes(a.codigo) && !a.user_id) { a.user_id = uid(); n++; }
      return n;
    },

    meus_agendamentos({ p_barbearia = null } = {}) {
      if (!uid()) return [];
      return T("agendamentos").filter(a => a.user_id === uid() && (!p_barbearia || a.barbearia_id === p_barbearia))
        .sort((x, y) => y.inicio.localeCompare(x.inicio)).slice(0, 200).map(a => {
          const b = barbearia(a.barbearia_id), v = T("avaliacoes").find(x => x.agendamento_id === a.id);
          return { codigo: a.codigo, inicio: a.inicio, fim: a.fim, status: a.status, preco: a.preco, servico: a.servico_nome, profissional_id: a.profissional_id,
            profissional: T("profissionais").find(p => p.id === a.profissional_id)?.nome,
            barbearia: { id: b.id, nome: b.nome, slug: b.slug, fuso: b.fuso, logo_url: b.logo_url },
            servicos: T("agendamento_itens").filter(i => i.agendamento_id === a.id && i.servico_id).sort((x, y) => x.ordem - y.ordem).map(i => i.servico_id),
            nota: v?.nota ?? null,
            pode_avaliar: a.status === "concluido" && Date.parse(a.inicio) > Date.now() - 30 * 86400000 && !v,
            pode_alterar: a.status === "confirmado" && Date.parse(a.inicio) > Date.now() + b.cancelamento_horas * 3600000 };
        });
    },

    avaliar({ p_codigo, p_nota, p_comentario = null }) {
      const a = T("agendamentos").find(x => x.codigo === p_codigo);
      if (!a) erro("Agendamento não encontrado.");
      if (a.status !== "concluido") erro("Só dá para avaliar depois do atendimento.");
      if (Date.parse(a.inicio) < Date.now() - 30 * 86400000) erro("O prazo para avaliar este atendimento já passou.");
      if (!(p_nota >= 1 && p_nota <= 5)) erro("Escolha de 1 a 5 estrelas.");
      if (T("avaliacoes").some(v => v.agendamento_id === a.id)) erro("Este atendimento já foi avaliado.");
      const nomes = a.cliente_nome.trim().split(/\s+/);
      inserir("avaliacoes", { barbearia_id: a.barbearia_id, agendamento_id: a.id, profissional_id: a.profissional_id, nota: p_nota,
        comentario: String(p_comentario || "").trim().slice(0, 500) || null, nome_exibicao: nomes[0] + (nomes.length > 1 ? ` ${nomes[nomes.length - 1][0]}.` : ""), servico_nome: a.servico_nome });
      return true;
    },

    resumo_avaliacoes({ p_barbearia }) {
      const vs = T("avaliacoes").filter(v => v.barbearia_id === p_barbearia && v.publicada);
      const media = l => (l.length ? Math.round(l.reduce((x, v) => x + v.nota, 0) / l.length * 10) / 10 : null);
      const profissionais = {};
      for (const v of vs) if (v.profissional_id) (profissionais[v.profissional_id] ||= []).push(v);
      return { media: media(vs), total: vs.length, profissionais: Object.fromEntries(Object.entries(profissionais).map(([k, l]) => [k, { media: media(l), total: l.length }])) };
    },

    abrir_comanda({ p_barbearia, p_agendamento = null, p_cliente = null }) {
      if (!isMembro(p_barbearia)) erro("Sem permissão.");
      if (p_agendamento) {
        const a = T("agendamentos").find(x => x.id === p_agendamento && x.barbearia_id === p_barbearia);
        if (!a || !podeProf(p_barbearia, a.profissional_id)) erro("Agendamento não encontrado.");
        const ja = T("comandas").find(c => c.agendamento_id === a.id && c.status !== "cancelada");
        if (ja) return ja.id;
        const c = inserir("comandas", { barbearia_id: p_barbearia, agendamento_id: a.id, cliente_id: a.cliente_id, cliente_nome: a.cliente_nome, profissional_id: a.profissional_id, desconto: a.desconto_cupom });
        for (const i of T("agendamento_itens").filter(i => i.agendamento_id === a.id).sort((x, y) => x.ordem - y.ordem))
          inserir("comanda_itens", { comanda_id: c.id, tipo: "servico", servico_id: i.servico_id, profissional_id: a.profissional_id, descricao: i.nome, quantidade: 1, preco_unit: i.preco });
        return c.id;
      }
      const cl = p_cliente && T("clientes").find(x => x.id === p_cliente && x.barbearia_id === p_barbearia);
      return inserir("comandas", { barbearia_id: p_barbearia, cliente_id: cl?.id ?? null, cliente_nome: cl?.nome ?? null, profissional_id: meuProf(p_barbearia) }).id;
    },

    fechar_comanda({ p_comanda, p_desconto, p_pagamentos }) {
      const c = T("comandas").find(x => x.id === p_comanda);
      if (!c || !podeProf(c.barbearia_id, c.profissional_id)) erro("Comanda não encontrada.");
      if (c.status !== "aberta") erro(`Esta comanda já foi ${c.status === "fechada" ? "fechada" : "cancelada"}.`);
      const itens = T("comanda_itens").filter(i => i.comanda_id === c.id);
      if (!itens.length) erro("Adicione pelo menos um item.");
      const sub = r2(itens.reduce((x, i) => x + Number(i.total), 0)), desc = r2(p_desconto || 0);
      if (desc < 0 || desc > sub) erro("Desconto inválido.");
      const tot = r2(sub - desc), pags = Array.isArray(p_pagamentos) ? p_pagamentos : erro("Pagamentos inválidos.");
      if (pags.some(p => !["dinheiro", "pix", "credito", "debito", "outro"].includes(p.forma) || !(Number(p.valor) > 0))) erro("Forma de pagamento ou valor inválido.");
      const pago = r2(pags.reduce((x, p) => x + r2(p.valor), 0));
      if (pago !== tot) erro(`Os pagamentos (R$ ${pago.toFixed(2)}) não fecham com o total (R$ ${tot.toFixed(2)}).`);
      const comissoes = planoTem(c.barbearia_id, "comissoes"), fator = sub > 0 ? tot / sub : 0, hoje = hojeEm(barbearia(c.barbearia_id).fuso);
      // pacotes usados: confere saldo antes de mexer em qualquer coisa
      const usos = {};
      for (const i of itens.filter(i => i.pacote_cliente_id)) {
        const pc = T("pacotes_clientes").find(x => x.id === i.pacote_cliente_id);
        if (!pc || pc.cliente_id !== c.cliente_id || pc.status !== "ativo" || pc.servico_id !== i.servico_id || pc.valido_ate < hoje) erro("Pacote inválido para este cliente/serviço ou vencido.");
        usos[pc.id] = (usos[pc.id] || 0) + i.quantidade;
        if (pc.usados + usos[pc.id] > pc.quantidade) erro("O pacote não tem saldo suficiente.");
      }
      if (itens.some(i => i.tipo === "pacote") && !c.cliente_id) erro("Para vender pacote, a comanda precisa ter um cliente.");
      for (const p of pags) inserir("comanda_pagamentos", { comanda_id: c.id, forma: p.forma, valor: r2(p.valor) });
      for (const i of itens) i.comissao_valor = comissoes ? r2(Number(i.total) * fator * Number(i.comissao_pct || 0) / 100) : null;
      for (const i of itens.filter(i => i.tipo === "pacote")) {
        const pk = T("pacotes").find(x => x.id === i.pacote_id);
        for (let n = 0; n < i.quantidade; n++)
          inserir("pacotes_clientes", { barbearia_id: c.barbearia_id, pacote_id: pk.id, cliente_id: c.cliente_id, nome: pk.nome, servico_id: pk.servico_id, quantidade: pk.quantidade,
            valor_sessao: r2(i.preco_unit * fator / pk.quantidade), valido_ate: somaDias(hoje, pk.validade_dias), comanda_id: c.id });
      }
      for (const [id, q] of Object.entries(usos)) T("pacotes_clientes").find(x => x.id === id).usados += q;
      for (const i of itens.filter(i => i.pacote_cliente_id)) {
        const pc = T("pacotes_clientes").find(x => x.id === i.pacote_cliente_id);
        i.comissao_valor = comissoes ? r2(pc.valor_sessao * i.quantidade * Number(i.comissao_pct || 0) / 100) : null;
      }
      const porProduto = {};
      for (const i of itens.filter(i => i.tipo === "produto")) porProduto[i.produto_id] = (porProduto[i.produto_id] || 0) + i.quantidade;
      for (const [pid, q] of Object.entries(porProduto)) if (T("produtos").some(p => p.id === pid))
        inserir("movimentos_estoque", { barbearia_id: c.barbearia_id, produto_id: pid, tipo: "venda", quantidade: -q, comanda_id: c.id, observacao: "Venda" });
      Object.assign(c, { status: "fechada", subtotal: sub, desconto: desc, total: tot, fechada_em: agoraIso() });
      const ag = c.agendamento_id && T("agendamentos").find(a => a.id === c.agendamento_id);
      if (ag && ["confirmado", "faltou"].includes(ag.status)) ag.status = "concluido";
      return { subtotal: sub, desconto: desc, total: tot };
    },

    cancelar_comanda({ p_comanda, p_motivo = null }) {
      const c = T("comandas").find(x => x.id === p_comanda);
      if (!c || !podeProf(c.barbearia_id, c.profissional_id)) erro("Comanda não encontrada.");
      if (c.status === "cancelada") return false;
      if (c.status === "fechada") {
        if (T("pacotes_clientes").some(p => p.comanda_id === c.id && p.usados > 0 && p.status === "ativo")) erro("Um pacote vendido nesta comanda já foi usado. Não dá para cancelar a venda.");
        T("pacotes_clientes").forEach(p => { if (p.comanda_id === c.id) p.status = "cancelado"; });
        const itens = T("comanda_itens").filter(i => i.comanda_id === c.id);
        for (const i of itens.filter(i => i.pacote_cliente_id)) { const pc = T("pacotes_clientes").find(x => x.id === i.pacote_cliente_id); if (pc) pc.usados = Math.max(0, pc.usados - i.quantidade); }
        const porProduto = {};
        for (const i of itens.filter(i => i.tipo === "produto")) porProduto[i.produto_id] = (porProduto[i.produto_id] || 0) + i.quantidade;
        for (const [pid, q] of Object.entries(porProduto)) if (T("produtos").some(p => p.id === pid))
          inserir("movimentos_estoque", { barbearia_id: c.barbearia_id, produto_id: pid, tipo: "estorno", quantidade: q, comanda_id: c.id, observacao: "Estorno de venda cancelada" });
      }
      Object.assign(c, { status: "cancelada", cancelada_em: agoraIso(), motivo_cancelamento: String(p_motivo || "").trim().slice(0, 200) || null });
      return true;
    },

    relatorio({ p_barbearia, p_de, p_ate }) {
      if (!isDono(p_barbearia)) erro("Sem permissão.");
      const b = barbearia(p_barbearia);
      const ini = instante(p_de, "00:00", b.fuso).getTime(), fim = instante(somaDias(p_ate, 1), "00:00", b.fuso).getTime();
      const dentro = iso => iso && Date.parse(iso) >= ini && Date.parse(iso) < fim;
      const cmd = T("comandas").filter(c => c.barbearia_id === b.id && c.status === "fechada" && dentro(c.fechada_em));
      const cmdIds = new Set(cmd.map(c => c.id));
      const itn = T("comanda_itens").filter(i => cmdIds.has(i.comanda_id));
      const liq = itn.map(i => { const c = cmd.find(x => x.id === i.comanda_id); return { ...i, liquido: r2(Number(i.total) * (c.subtotal > 0 ? c.total / c.subtotal : 0)) }; });
      const ags = T("agendamentos").filter(a => a.barbearia_id === b.id && dentro(a.inicio));
      const soma = (l, f) => r2(l.reduce((x, y) => x + Number(f(y) || 0), 0));
      const dias = []; for (let d = p_de; d <= p_ate; d = somaDias(d, 1)) dias.push(d);
      const conta = st => ags.filter(a => a.status === st).length;
      const base = conta("concluido") + conta("faltou"), naoCanc = ags.filter(a => a.status !== "cancelado");
      const agrupa = (l, chave) => Object.values(l.reduce((m, i) => { const k = i[chave]; (m[k] ||= { nome: k, qtd: 0, valor: 0 }); m[k].qtd += i.quantidade; m[k].valor = r2(m[k].valor + i.liquido); return m; }, {})).sort((x, y) => y.valor - x.valor);
      const porPag = {};
      for (const pg of T("comanda_pagamentos").filter(p => cmdIds.has(p.comanda_id))) porPag[pg.forma] = r2((porPag[pg.forma] || 0) + Number(pg.valor));
      const res = {
        faturamento: soma(cmd, c => c.total), descontos: soma(cmd, c => c.desconto), comandas: cmd.length,
        ticket_medio: cmd.length ? r2(soma(cmd, c => c.total) / cmd.length) : 0,
        servicos_valor: soma(liq.filter(i => i.tipo === "servico"), i => i.liquido), produtos_valor: soma(liq.filter(i => i.tipo === "produto"), i => i.liquido),
        comissoes: soma(itn, i => i.comissao_valor),
        agendamentos: ags.filter(a => ["confirmado", "concluido", "faltou"].includes(a.status)).length,
        concluidos: conta("concluido"), faltas: conta("faltou"), cancelados: conta("cancelado"),
        taxa_falta: base ? Math.round(1000 * conta("faltou") / base) / 10 : 0,
        online_pct: naoCanc.length ? Math.round(1000 * naoCanc.filter(a => a.origem === "online").length / naoCanc.length) / 10 : 0,
        clientes_atendidos: new Set(ags.filter(a => a.status === "concluido").map(a => a.cliente_id)).size,
        clientes_novos: T("clientes").filter(c => c.barbearia_id === b.id && dentro(c.criado_em)).length,
        por_pagamento: porPag,
        por_profissional: T("profissionais").filter(p => p.barbearia_id === b.id).map(p => {
          const meus = liq.filter(i => i.profissional_id === p.id);
          const disp = dias.reduce((x, d) => x + T("jornadas").filter(j => j.profissional_id === p.id && j.dia_semana === dow(d)).reduce((y, j) => y + minT(j.fim) - minT(j.inicio), 0), 0);
          const ocup = ags.filter(a => a.profissional_id === p.id && ativoNaAgenda(a)).reduce((x, a) => x + (Date.parse(a.fim) - Date.parse(a.inicio)) / 60000, 0);
          return { id: p.id, nome: p.nome, faturamento: soma(meus, i => i.liquido), servicos: soma(meus.filter(i => i.tipo === "servico"), i => i.liquido),
            produtos: soma(meus.filter(i => i.tipo === "produto"), i => i.liquido), comissao: soma(itn.filter(i => i.profissional_id === p.id), i => i.comissao_valor),
            atendimentos: ags.filter(a => a.profissional_id === p.id && a.status === "concluido").length, faltas: ags.filter(a => a.profissional_id === p.id && a.status === "faltou").length,
            ocupacao: p.ativo && disp ? Math.round(1000 * ocup / disp) / 10 : 0 };
        }).sort((x, y) => y.faturamento - x.faturamento),
        por_servico: agrupa(liq.filter(i => i.tipo === "servico"), "descricao"),
        por_produto: agrupa(liq.filter(i => i.tipo === "produto"), "descricao"),
        por_dia: dias.map(d => ({ dia: d, valor: soma(cmd.filter(c => dataLocal(c.fechada_em, b.fuso) === d), c => c.total),
          atendimentos: ags.filter(a => a.status === "concluido" && dataLocal(a.inicio, b.fuso) === d).length })),
      };
      if (!planoTem(b.id, "relatorios_completos"))
        return { basico: true, faturamento: res.faturamento, descontos: res.descontos, comandas: res.comandas, ticket_medio: res.ticket_medio, concluidos: res.concluidos, por_pagamento: res.por_pagamento, por_dia: res.por_dia };
      return res;
    },

    validar_cupom({ p_barbearia, p_codigo, p_telefone, p_subtotal }) {
      const r = calcularCupom(p_barbearia, p_codigo, p_telefone, p_subtotal);
      return { desconto: r.desconto, descricao: r.descricao };
    },

    marketing_clientes({ p_barbearia, p_dias_sumido = 45 }) {
      if (!isDono(p_barbearia)) erro("Sem permissão.");
      if (!planoTem(p_barbearia, "marketing")) erro("Recurso disponível no plano Premium.");
      const b = barbearia(p_barbearia), hoje = hojeEm(b.fuso), corte = Date.now() - Math.max(p_dias_sumido, 7) * 86400000;
      const cls = T("clientes").filter(c => c.barbearia_id === b.id);
      const sumidos = cls.map(c => {
        const vis = T("agendamentos").filter(a => a.cliente_id === c.id && a.status === "concluido");
        if (!vis.length) return null;
        const ultima = vis.map(a => a.inicio).sort().pop();
        if (Date.parse(ultima) >= corte || T("agendamentos").some(a => a.cliente_id === c.id && a.status === "confirmado" && Date.parse(a.inicio) > Date.now())) return null;
        return { id: c.id, nome: c.nome, telefone: c.telefone, ultimo_contato: c.ultimo_contato, ultima, visitas: vis.length };
      }).filter(Boolean).sort((x, y) => x.ultima.localeCompare(y.ultima)).slice(0, 300);
      const ano = +hoje.slice(0, 4);
      const aniversariantes = cls.filter(c => c.nascimento).map(c => {
        const md = c.nascimento.slice(5, 10) === "02-29" ? "02-28" : c.nascimento.slice(5, 10);
        let prox = `${ano}-${md}`; if (prox < hoje) prox = `${ano + 1}-${md}`;
        return { id: c.id, nome: c.nome, telefone: c.telefone, nascimento: c.nascimento, ultimo_contato: c.ultimo_contato, dias: Math.round((Date.parse(prox) - Date.parse(hoje)) / 86400000) };
      }).filter(x => x.dias >= 0 && x.dias <= 7).sort((x, y) => x.dias - y.dias);
      return { sumidos, aniversariantes };
    },

    aceitar_convite({ p_token }) {
      if (!uid()) erro("Faça login primeiro.");
      const c = T("convites").find(x => x.token === p_token);
      if (!c || c.aceito_em || Date.parse(c.expira_em) < Date.now()) erro("Convite inválido ou vencido. Peça um novo ao dono do estabelecimento.");
      if (c.email.toLowerCase() !== (emailSessao() || "")) erro(`Este convite é para ${c.email}. Entre com esse e-mail.`);
      if (T("membros").some(m => m.user_id === uid() && m.barbearia_id !== c.barbearia_id)) erro("Sua conta já faz parte de outro estabelecimento.");
      const m = T("membros").find(x => x.barbearia_id === c.barbearia_id && x.user_id === uid());
      if (m) { if (m.papel === "barbeiro") m.profissional_id = c.profissional_id; }
      else inserir("membros", { barbearia_id: c.barbearia_id, user_id: uid(), papel: "barbeiro", profissional_id: c.profissional_id });
      c.aceito_em = agoraIso();
      return c.barbearia_id;
    },

    admin_barbearias() {
      if (!isAdmin()) erro("Sem permissão.");
      return T("barbearias").map(b => {
        const a = T("assinaturas").find(x => x.barbearia_id === b.id) || {}, pl = T("planos").find(p => p.id === a.plano_id);
        const dono = T("membros").find(m => m.barbearia_id === b.id && m.papel === "dono");
        return { id: b.id, nome: b.nome, slug: b.slug, whatsapp: b.whatsapp, criado_em: b.criado_em, dominio: b.dominio,
          status: a.status ?? null, teste_ate: a.teste_ate ?? null, vencimento: a.vencimento ?? null, plano_id: a.plano_id ?? null, plano: pl?.nome ?? null, preco_mensal: pl?.preco_mensal ?? null,
          fidelidade_ate: a.fidelidade_ate ?? null, mensalidade: mensalidade(b.id),
          agenda_ligada: assinaturaAtiva(b.id), profissionais: T("profissionais").filter(p => p.barbearia_id === b.id && p.ativo).length,
          agendamentos_30d: T("agendamentos").filter(g => g.barbearia_id === b.id && Date.parse(g.criado_em) > Date.now() - 30 * 86400000).length,
          ultimo_pagamento: T("pagamentos_assinatura").filter(p => p.barbearia_id === b.id).map(p => p.pago_em).sort().pop() ?? null,
          email_dono: db.usuarios.find(u => u.id === dono?.user_id)?.email ?? null };
      }).sort((x, y) => String(y.criado_em).localeCompare(String(x.criado_em)));
    },

    admin_registrar_pagamento({ p_barbearia, p_valor, p_referencia, p_forma = "pix" }) {
      if (!isAdmin()) erro("Sem permissão.");
      inserir("pagamentos_assinatura", { barbearia_id: p_barbearia, valor: Number(p_valor), referencia: p_referencia, forma: p_forma });
      let a = T("assinaturas").find(x => x.barbearia_id === p_barbearia);
      if (!a) a = inserir("assinaturas", { barbearia_id: p_barbearia, status: "ativa" });
      const hoje = hojeEm(FUSO), base = a.vencimento && a.vencimento > hoje ? a.vencimento : hoje;
      const d = new Date(`${base}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1);
      Object.assign(a, { status: "ativa", vencimento: d.toISOString().slice(0, 10), atualizado_em: agoraIso() });
      return a.vencimento;
    },

    barbearia_por_dominio() { return null; },
    plano_tem({ p_barbearia, p_recurso }) { return planoTem(p_barbearia, p_recurso); },
    mensalidade({ p_barbearia }) { return mensalidade(p_barbearia); },

    cota_ajustes({ p_barbearia }) {
      const a = T("assinaturas").find(x => x.barbearia_id === p_barbearia), pl = a && T("planos").find(p => p.id === a.plano_id), b = barbearia(p_barbearia);
      const mes = hojeEm(b.fuso).slice(0, 7);
      return { limite: !a ? 0 : a.status === "teste" ? 1 : pl?.ajustes_mes ?? 0,
        usados: T("pedidos_ajuste").filter(p => p.barbearia_id === p_barbearia && p.status !== "recusado" && dataLocal(p.criado_em, b.fuso).slice(0, 7) === mes).length };
    },

    pedir_ajuste({ p_barbearia, p_titulo, p_descricao }) {
      if (!isDono(p_barbearia)) erro("Sem permissão.");
      const cota = RPC.cota_ajustes({ p_barbearia });
      if (cota.usados >= cota.limite) erro(`Você já usou os ${cota.limite} ajuste(s) do mês no seu plano. Novos pedidos liberam no próximo mês ou mudando de plano.`);
      return inserir("pedidos_ajuste", { barbearia_id: p_barbearia, titulo: String(p_titulo).trim(), descricao: String(p_descricao).trim() }).id;
    },
  };

  // funções que só leem: não contam como "a pessoa mexeu" (os dados de exemplo continuam se renovando)
  const LEITURA = new Set(["horarios_disponiveis", "consultar_agendamento", "meus_agendamentos", "resumo_avaliacoes", "relatorio", "validar_cupom",
    "marketing_clientes", "admin_barbearias", "barbearia_por_dominio", "cota_ajustes", "plano_tem", "mensalidade"]);

  // ---------------------------------------------------------------- autenticação
  const ouvintes = [];
  const sessaoObj = () => { const u = usuario(); return u ? { user: { id: u.id, email: u.email }, access_token: "local" } : null; };
  function entrar(u, evento = "SIGNED_IN") { db.sessao = u.id; salvar(); ouvintes.forEach(f => f(evento, sessaoObj())); }
  const auth = {
    getSession: async () => ({ data: { session: sessaoObj() }, error: null }),
    getUser: async () => ({ data: { user: sessaoObj()?.user ?? null }, error: null }),
    onAuthStateChange(f) { ouvintes.push(f); return { data: { subscription: { unsubscribe() { ouvintes.splice(ouvintes.indexOf(f), 1); } } } }; },
    async signUp({ email, password }) {
      email = String(email || "").trim().toLowerCase();
      if (String(password || "").length < 6) return { data: {}, error: { message: "Password should be at least 6 characters" } };
      if (db.usuarios.some(u => u.email === email)) return { data: {}, error: { message: "User already registered" } };
      const u = { id: uuid(), email, senha: password }; db.usuarios.push(u); mexeu(); entrar(u);
      return { data: { user: { id: u.id, email }, session: sessaoObj() }, error: null };
    },
    async signInWithPassword({ email, password }) {
      const u = db.usuarios.find(x => x.email === String(email || "").trim().toLowerCase() && x.senha === password);
      if (!u) return { data: {}, error: { message: "Invalid login credentials" } };
      entrar(u); return { data: { user: { id: u.id, email: u.email }, session: sessaoObj() }, error: null };
    },
    async signInWithOtp() { return { data: {}, error: null }; },
    async verifyOtp({ email, token }) {
      if (!/^\d{6}$/.test(String(token || "").trim())) return { data: {}, error: { message: "Token has expired or is invalid" } };
      email = String(email || "").trim().toLowerCase();
      let u = db.usuarios.find(x => x.email === email);
      if (!u) { u = { id: uuid(), email, senha: null }; db.usuarios.push(u); mexeu(); }
      entrar(u); return { data: { session: sessaoObj() }, error: null };
    },
    async resetPasswordForEmail() { return { data: {}, error: null }; },
    async updateUser({ password }) {
      const u = usuario(); if (!u) return { data: {}, error: { message: "Faça login primeiro." } };
      if (password) { if (password.length < 6) return { data: {}, error: { message: "Password should be at least 6 characters" } }; u.senha = password; salvar(); }
      return { data: { user: { id: u.id, email: u.email } }, error: null };
    },
    async signOut() { db.sessao = null; salvar(); ouvintes.forEach(f => f("SIGNED_OUT", null)); return { error: null }; },
  };

  // ---------------------------------------------------------------- fotos enviadas (ficam no próprio navegador)
  const storage = {
    from() {
      return {
        async upload(caminho, arquivo) {
          const url = await new Promise((ok, falha) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = falha; r.readAsDataURL(arquivo); });
          (db.midia ||= {})[caminho] = url; mexeu(); salvar();
          return { data: { path: caminho }, error: null };
        },
        getPublicUrl(caminho) { return { data: { publicUrl: db.midia?.[caminho] || "" } }; },
      };
    },
  };

  // ---------------------------------------------------------------- dados de exemplo
  function semear() {
    db = { versao: VERSAO, semeado_em: hojeEm(FUSO), mexeu: false, sessao: null, usuarios: [], t: {}, midia: {} };
    for (const t of TABELAS) db.t[t] = [];
    const rnd = aleatorio(20261009), sorteia = l => l[Math.floor(rnd() * l.length)];
    const hoje = hojeEm(FUSO);
    const dia = n => somaDias(hoje, n);
    const em = (data, hora) => instante(data, hora, FUSO).toISOString();

    // contas da demonstração
    const usuarios = { dono: { id: uuid(), email: "dono@demo.com", senha: "demo123" }, barbeiro: { id: uuid(), email: "barbeiro@demo.com", senha: "demo123" },
      admin: { id: uuid(), email: "admin@demo.com", senha: "demo123" } };
    db.usuarios.push(...Object.values(usuarios));
    inserir("plataforma_admins", { user_id: usuarios.admin.id });

    // planos (mesmos do schema)
    const planos = [
      inserir("planos", { nome: "Básico", preco_mensal: 89, profissionais_inclusos: 1, preco_extra: 20, fidelidade_meses: 0, recursos: [], ajustes_mes: 0, ordem: 1,
        descricao: "Agenda online 24h, página de agendamento, conta do cliente, avaliações e caixa." }),
      inserir("planos", { nome: "Profissional", preco_mensal: 249, profissionais_inclusos: 2, preco_extra: 20, fidelidade_meses: 12, recursos: ["site", "relatorios_completos", "comissoes", "emails"], ajustes_mes: 2, ordem: 2,
        descricao: "Tudo do Básico + site próprio com domínio, relatórios completos e comissões." }),
      inserir("planos", { nome: "Premium", preco_mensal: 349, profissionais_inclusos: 4, preco_extra: 20, fidelidade_meses: 12, recursos: ["site", "relatorios_completos", "comissoes", "emails", "marketing", "estoque"], ajustes_mes: 5, ordem: 3,
        descricao: "Tudo do Profissional + promoções por horário, cupons, pacotes, marketing e estoque." }),
    ];

    // ---------- Os Barbeiros JF ----------
    const b = inserir("barbearias", { slug: "os-barbeiros-jf", nome: "Os Barbeiros JF", whatsapp: "32991234073", endereco: "R. Diogo Álvares, 389 – Benfica, Juiz de Fora",
      logo_url: "logo.jpg", site_url: null, cor_destaque: "#2e6bff", tema: "urbano", site_titulo: "Corte\nna régua,\nsem fila.",
      site_texto: "Barbearia tradicional com estilo moderno. Escolha o serviço e o melhor horário pra você em poucos cliques.", instagram: "gabrielpires_barber01", hero_url: "cadeira.jpg",
      fotos: [{ url: "corte1.jpg", legenda: "Barba" }, { url: "salao2.jpg", legenda: "O salão" }, { url: "corte3.jpg", legenda: "Corte + barba" }, { url: "atendimento.jpg", legenda: "Na cadeira" },
        { url: "corte2.jpg", legenda: "Disfarçado" }, { url: "fachada.jpg", legenda: "Fachada" }], criado_em: em(dia(-120), "10:00") });
    inserir("assinaturas", { barbearia_id: b.id, plano_id: planos[2].id, status: "ativa", vencimento: dia(22), fidelidade_ate: dia(245) });
    inserir("pagamentos_assinatura", { barbearia_id: b.id, valor: 349, referencia: dia(-8).slice(0, 7), forma: "pix", pago_em: dia(-8) });
    const prof = inserir("profissionais", { barbearia_id: b.id, nome: "Gabriel Pires", ordem: 0 });
    inserir("membros", { barbearia_id: b.id, user_id: usuarios.dono.id, papel: "dono" });
    inserir("membros", { barbearia_id: b.id, user_id: usuarios.barbeiro.id, papel: "barbeiro", profissional_id: prof.id });
    for (let d = 1; d <= 5; d++) inserir("jornadas", { barbearia_id: b.id, profissional_id: prof.id, dia_semana: d, inicio: "08:00:00", fim: "20:00:00" });
    inserir("jornadas", { barbearia_id: b.id, profissional_id: prof.id, dia_semana: 6, inicio: "08:00:00", fim: "16:00:00" });
    const S = {};
    [["maquina", "Máquina geral", "Corte todo na máquina", 25, 30], ["disfarcado", "Disfarçado", "Degradê na régua", 35, 40], ["tesoura", "Tesoura", "Corte na tesoura", 35, 40],
     ["barba", "Barba", "Desenhada e alinhada", 25, 30], ["sobrancelha", "Sobrancelha", null, 10, 10], ["pigmentacao", "Pigmentação", "Barba ou cabelo", 30, 30]]
      .forEach(([k, nome, descricao, preco, duracao_min], ordem) => { S[k] = inserir("servicos", { barbearia_id: b.id, nome, descricao, preco, duracao_min, ordem }); });

    const produtos = [inserir("produtos", { barbearia_id: b.id, nome: "Pomada matte", preco_venda: 45, custo: 18, estoque_minimo: 3 }),
      inserir("produtos", { barbearia_id: b.id, nome: "Óleo para barba", preco_venda: 38, custo: 15, estoque_minimo: 3 }),
      inserir("produtos", { barbearia_id: b.id, nome: "Shampoo para barba", preco_venda: 32, custo: 12, estoque_minimo: 2 })];
    [[0, 40], [1, 20], [2, 18]].forEach(([i, q]) => inserir("movimentos_estoque", { barbearia_id: b.id, produto_id: produtos[i].id, tipo: "entrada", quantidade: q, custo_unit: produtos[i].custo, observacao: "Estoque inicial", criado_em: em(dia(-60), "09:00") }));

    inserir("promocoes", { barbearia_id: b.id, nome: "Manhã do corte", desconto_pct: 20, dias_semana: [2, 3], hora_inicio: "09:00:00", hora_fim: "12:00:00", servico_ids: [S.disfarcado.id] });
    inserir("cupons", { barbearia_id: b.id, codigo: "VOLTA10", tipo: "pct", valor: 10, usos_max: 50 });
    inserir("cupons", { barbearia_id: b.id, codigo: "NATAL", tipo: "valor", valor: 15, ativo: false, validade_ate: `${hoje.slice(0, 4)}-12-26` });
    const pacote = inserir("pacotes", { barbearia_id: b.id, nome: "Clube do corte — 4 por mês", servico_id: S.disfarcado.id, quantidade: 4, preco: 120, validade_dias: 30 });

    const nomes = ["João Silva", "Carlos Souza", "Pedro Lima", "Marcos Vale", "Tiago Melo", "Léo Dias", "Bruno Reis", "Rafael Costa", "André Gomes", "Lucas Martins", "Felipe Rocha", "Gustavo Alves",
      "Diego Moreira", "Mateus Ribeiro", "Vinícius Cardoso", "Rodrigo Barbosa", "Thiago Pinto", "Eduardo Teixeira", "Henrique Lopes", "Caio Fernandes", "Daniel Araújo", "Igor Nunes",
      "Samuel Freitas", "Paulo Mendes", "Renan Castro", "Otávio Ramos", "Murilo Duarte", "Fábio Correia"];
    const clientes = nomes.map((nome, i) => inserir("clientes", { barbearia_id: b.id, nome, telefone: `3299${String(1000000 + i * 37171).slice(0, 7)}`,
      email: i % 4 === 0 ? `${nome.split(" ")[0].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")}@email.com` : null,
      nascimento: i % 5 === 0 ? `19${85 + (i % 14)}-${dia(i === 0 ? 0 : i % 3 === 0 ? 2 : 40 + i).slice(5)}` : null,
      observacoes: i === 0 ? "Máquina 1 dos lados, gosta de café sem açúcar." : null, criado_em: em(dia(-100 + i * 3), "10:00") }));

    const combos = [[S.disfarcado], [S.disfarcado, S.barba], [S.maquina], [S.barba], [S.tesoura], [S.disfarcado, S.sobrancelha], [S.maquina, S.barba], [S.pigmentacao], [S.sobrancelha]];
    const formas = ["pix", "pix", "pix", "dinheiro", "credito", "debito"];
    // agenda de um dia: encaixa visitas sem sobrepor, dentro da jornada
    function diaDeAgenda(data, quantos, statusDe, pool = clientes) {
      const jor = T("jornadas").find(j => j.profissional_id === prof.id && j.dia_semana === dow(data));
      if (!jor) return;
      let t = minT(jor.inicio) + (rnd() < .5 ? 0 : 30);
      const fimJ = minT(jor.fim);
      for (let n = 0; n < quantos && t < fimJ - 30; n++) {
        const servs = sorteia(combos), dur = servs.reduce((x, s) => x + s.duracao_min, 0);
        if (t + dur > fimJ) break;
        if (t < 13 * 60 && t + dur > 12 * 60) t = 13 * 60; // almoço
        if (t + dur > fimJ) break;
        const hh = `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
        criarVisita(data, hh, servs, sorteia(pool), statusDe(hh));
        t += dur + sorteia([0, 0, 20, 30, 50, 60]);
        t = Math.ceil(t / 10) * 10;
      }
    }
    function criarVisita(data, hora, servs, cl, status, extra = {}) {
      const ini = Date.parse(em(data, hora)), dur = servs.reduce((x, s) => x + s.duracao_min, 0);
      const a = inserir("agendamentos", { barbearia_id: b.id, profissional_id: prof.id, cliente_id: cl.id, servico_nome: servs.map(s => s.nome).join(" + "),
        preco: servs.reduce((x, s) => x + s.preco, 0), cliente_nome: cl.nome, cliente_telefone: cl.telefone, inicio: new Date(ini).toISOString(),
        fim: new Date(ini + dur * 60000).toISOString(), status, origem: rnd() < .72 ? "online" : "painel", criado_em: new Date(ini - (1 + Math.floor(rnd() * 5)) * 86400000).toISOString(),
        cancelado_por: status === "cancelado" ? (rnd() < .7 ? "cliente" : "barbearia") : null, ...extra });
      servs.forEach((s, k) => inserir("agendamento_itens", { agendamento_id: a.id, servico_id: s.id, nome: s.nome, preco: s.preco, duracao_min: s.duracao_min, ordem: k + 1 }));
      if (status === "concluido") {
        const c = inserir("comandas", { barbearia_id: b.id, agendamento_id: a.id, cliente_id: cl.id, cliente_nome: cl.nome, profissional_id: prof.id, aberta_em: a.inicio });
        servs.forEach(s => inserir("comanda_itens", { comanda_id: c.id, tipo: "servico", servico_id: s.id, profissional_id: prof.id, descricao: s.nome, quantidade: 1, preco_unit: s.preco }));
        if (rnd() < .18) { const p = sorteia(produtos); if (p.estoque > 4) inserir("comanda_itens", { comanda_id: c.id, tipo: "produto", produto_id: p.id, profissional_id: prof.id, descricao: p.nome, quantidade: 1, preco_unit: p.preco_venda }); }
        const itens = T("comanda_itens").filter(i => i.comanda_id === c.id), sub = r2(itens.reduce((x, i) => x + i.total, 0));
        const desc = rnd() < .08 ? 5 : 0, tot = sub - desc;
        itens.forEach(i => { i.comissao_valor = r2(i.total * (tot / sub) * i.comissao_pct / 100); });
        if (rnd() < .12 && tot > 40) { inserir("comanda_pagamentos", { comanda_id: c.id, forma: "pix", valor: 30, criado_em: a.fim }); inserir("comanda_pagamentos", { comanda_id: c.id, forma: "dinheiro", valor: tot - 30, criado_em: a.fim }); }
        else inserir("comanda_pagamentos", { comanda_id: c.id, forma: sorteia(formas), valor: tot, criado_em: a.fim });
        itens.filter(i => i.tipo === "produto").forEach(i => inserir("movimentos_estoque", { barbearia_id: b.id, produto_id: i.produto_id, tipo: "venda", quantidade: -1, comanda_id: c.id, observacao: "Venda", criado_em: a.fim }));
        Object.assign(c, { status: "fechada", subtotal: sub, desconto: desc, total: tot, fechada_em: new Date(Date.parse(a.fim) + 2 * 60000).toISOString() });
      }
      return a;
    }

    // últimos 75 dias (os 6 últimos clientes pararam de vir há uns 50 dias: viram "sumidos" no marketing)
    const recentes = clientes.slice(0, 22);
    for (let n = -75; n <= -1; n++) diaDeAgenda(dia(n), (n < -45 ? 3 : 5) + Math.floor(rnd() * 5), () => { const r = rnd(); return r < .84 ? "concluido" : r < .9 ? "faltou" : "cancelado"; }, n < -50 ? clientes : recentes);
    // hoje: manhã já atendida, tarde marcada
    const agoraMin = minutosLocal(Date.now(), FUSO);
    if (T("jornadas").some(j => j.profissional_id === prof.id && j.dia_semana === dow(hoje)))
      diaDeAgenda(hoje, 9, hh => (minT(hh) + 40 < agoraMin ? (rnd() < .9 ? "concluido" : "faltou") : "confirmado"), recentes);
    // próximos dias
    for (let n = 1; n <= 12; n++) diaDeAgenda(dia(n), Math.max(1, 7 - Math.floor(n / 2) - Math.floor(rnd() * 3)), () => "confirmado", recentes);
    inserir("bloqueios", { barbearia_id: b.id, profissional_id: prof.id, inicio: em(hoje, "12:00"), fim: em(hoje, "13:00"), motivo: "Almoço" });
    // pacote vendido para um cliente fiel
    inserir("pacotes_clientes", { barbearia_id: b.id, pacote_id: pacote.id, cliente_id: clientes[2].id, nome: pacote.nome, servico_id: S.disfarcado.id, quantidade: 4, usados: 1, valor_sessao: 30, valido_ate: dia(20) });
    inserir("lista_espera", { barbearia_id: b.id, cliente_id: clientes[12].id, nome: clientes[12].nome, telefone: clientes[12].telefone, servico_id: S.disfarcado.id, servico_nome: "Disfarçado", data: hoje, periodo: "tarde" });

    // avaliações dos atendimentos concluídos
    const textos = ["Saí na régua. Atendimento top e café fresco!", "Melhor disfarçado da região.", "Pontual e caprichoso, recomendo.", null, "Ambiente massa e preço justo.", null,
      "Barba ficou perfeita.", "Atendimento nota 10.", null, "Sempre volto, nunca decepciona.", "Rápido e bem feito.", null];
    T("agendamentos").filter(a => a.status === "concluido").slice(-26).forEach((a, i) => {
      const nota = i === 5 ? 3 : i === 11 ? 4 : rnd() < .85 ? 5 : 4, ns = a.cliente_nome.split(" ");
      inserir("avaliacoes", { barbearia_id: b.id, agendamento_id: a.id, profissional_id: prof.id, nota, comentario: textos[i % textos.length], nome_exibicao: `${ns[0]} ${ns[1][0]}.`,
        servico_nome: a.servico_nome, resposta: i % 6 === 0 ? "Valeu demais! Volte sempre. ✂️" : null, publicada: nota >= 4, criado_em: new Date(Date.parse(a.fim) + 3 * 3600000).toISOString() });
    });
    // um produto acabando, para o aviso aparecer no Início
    const oleo = produtos[1];
    if (oleo.estoque !== 2) inserir("movimentos_estoque", { barbearia_id: b.id, produto_id: oleo.id, tipo: "ajuste", quantidade: 2 - oleo.estoque, observacao: "Contagem", criado_em: em(dia(-1), "19:00") });
    inserir("pedidos_ajuste", { barbearia_id: b.id, titulo: "Trocar foto da capa", descricao: "Usar a foto nova da fachada que mandei no WhatsApp.", status: "feito", resposta: "Pronto! Já está no ar.",
      criado_em: em(dia(-3), "10:00") });
    return db;
  }

  // ---------------------------------------------------------------- inicialização
  carregar();
  // ?como=dono|barbeiro|admin entra direto com a conta da demonstração (usado nos links e nos prints)
  const como = Q.get("como");
  if (como) { const u = db.usuarios.find(x => x.email === `${como}@demo.com`); if (u) { db.sessao = u.id; salvar(); } }
  if (Q.get("sair")) { db.sessao = null; salvar(); }
  if (como || Q.get("sair")) { // tira do endereço para não repetir ao recarregar
    Q.delete("como"); Q.delete("sair");
    history.replaceState(null, "", location.pathname + (Q.toString() ? `?${Q}` : "") + location.hash);
  }

  window.supabase = {
    createClient() {
      return {
        from: consulta,
        rpc(nome, args = {}) {
          return Promise.resolve().then(() => {
            const f = RPC[nome];
            if (!f) return { data: null, error: { message: `Função ${nome} não existe na demonstração.` } };
            try { const data = clone(f(args)); if (!LEITURA.has(nome)) { mexeu(); salvar(); } return { data: data ?? null, error: null }; }
            catch (e) { carregar(); return { data: null, error: { message: e.message } }; }
          });
        },
        auth,
        storage,
      };
    },
  };
  window.NAVALHA_CONFIG = { supabaseUrl: "https://demo-local.supabase.co", supabaseKey: "demo-local", suporteWhatsapp: "", demoUrl: "./" };
  window.BANCO_LOCAL = {
    restaurar() { const s = db.sessao; db = semear(); db.sessao = s && db.usuarios.some(u => u.id === s) ? s : null; salvar(); },
    entrarComo(papel) { const u = db.usuarios.find(x => x.email === `${papel}@demo.com`); if (u) { db.sessao = u.id; salvar(); } },
    sair() { db.sessao = null; salvar(); },
    get db() { return db; },
  };
})();

// ---------------------------------------------------------------- menu DEMO e dicas de login
(() => {
  const Q = new URLSearchParams(location.search);
  if (Q.get("tema_ui")) document.documentElement.dataset.tema = Q.get("tema_ui");
  if (Q.get("aba")) try { localStorage.setItem("navalha_aba", JSON.stringify(Q.get("aba"))); } catch {}
  const pagina = location.pathname.split("/").pop() || "index.html";
  const slug = "os-barbeiros-jf";

  document.addEventListener("DOMContentLoaded", () => {
    if (Q.get("clicar")) setTimeout(() => document.querySelector(Q.get("clicar"))?.click(), 1500);
    const estilo = document.createElement("style");
    estilo.textContent = `
      .demo-pill { position: fixed; left: 12px; bottom: 12px; z-index: 99990; font: 700 12px/1 system-ui, sans-serif; letter-spacing: .08em; background: #ffb020; color: #1a1205;
        border: 0; border-radius: 999px; padding: 10px 14px; box-shadow: 0 6px 20px rgba(0,0,0,.35); cursor: pointer; }
      body.painel.logado .demo-pill { bottom: 84px; }
      @media (min-width: 901px) { body.painel.logado .demo-pill { bottom: 12px; left: auto; right: 12px; } }
      .demo-menu { position: fixed; left: 12px; bottom: 58px; z-index: 99991; width: min(320px, calc(100vw - 24px)); max-height: 75vh; overflow: auto; background: #17140f; color: #f3ede4;
        border: 1px solid #3a3226; border-radius: 16px; padding: 14px; font: 14px/1.45 system-ui, sans-serif; box-shadow: 0 18px 50px rgba(0,0,0,.5); }
      body.painel.logado .demo-menu { bottom: 130px; }
      @media (min-width: 901px) { body.painel.logado .demo-menu { bottom: 58px; left: auto; right: 12px; } }
      .demo-menu h4 { margin: 10px 0 6px; font: 700 11px/1 system-ui, sans-serif; letter-spacing: .12em; text-transform: uppercase; color: #ffb020; }
      .demo-menu a, .demo-menu button { display: block; width: 100%; text-align: left; background: none; border: 0; color: inherit; font: inherit; padding: 7px 8px; border-radius: 8px; cursor: pointer; text-decoration: none; }
      .demo-menu a:hover, .demo-menu button:hover { background: rgba(255,255,255,.08); }
      .demo-menu p { margin: 0 0 4px; color: #b9ad9c; font-size: 12.5px; }
      .demo-dica { margin-top: 16px; padding: 14px 16px; border-radius: 14px; border: 1px dashed color-mix(in srgb, #ffb020 60%, transparent); background: color-mix(in srgb, #ffb020 8%, transparent); font-size: .9rem; }
      .demo-dica b { display: block; margin-bottom: 8px; }
      .demo-dica .row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }`;
    document.head.appendChild(estilo);

    if (!Q.get("limpo")) {
      const pill = Object.assign(document.createElement("button"), { className: "demo-pill", textContent: "DEMO ▾", type: "button" });
      const menu = document.createElement("div");
      menu.className = "demo-menu"; menu.hidden = true;
      menu.innerHTML = `<p>Demonstração: tudo o que você fizer fica salvo só neste navegador.</p>
        <h4>Ver como cliente</h4>
        <a href="site.html?b=${slug}">Site do estabelecimento</a>
        <a href="agendar.html?b=${slug}">Agendar um horário</a>
        <a href="conta.html?b=${slug}">Minha conta (cliente)</a>
        <h4>Ver como dono</h4>
        <a href="painel.html?como=dono">Painel do dono</a>
        <a href="painel.html?como=barbeiro">Painel do funcionário</a>
        <a href="painel.html?sair=1">Criar meu próprio negócio</a>
        <h4>Plataforma</h4>
        <a href="index.html">Página inicial</a>
        <a href="admin.html?como=admin">Administração</a>
        <button type="button" data-restaurar>↺ Restaurar dados de exemplo</button>`;
      pill.onclick = () => { menu.hidden = !menu.hidden; };
      document.addEventListener("click", e => { if (!menu.hidden && !menu.contains(e.target) && e.target !== pill) menu.hidden = true; });
      menu.querySelector("[data-restaurar]").onclick = () => {
        if (!confirm("Apagar tudo o que você fez na demonstração e voltar aos dados de exemplo?")) return;
        BANCO_LOCAL.restaurar(); location.reload();
      };
      document.body.append(pill, menu);
    }

    // dicas nas telas de login
    const dica = html => { const d = document.createElement("div"); d.className = "demo-dica"; d.id = "demo-dica"; d.innerHTML = html; return d; };
    const vigiar = alvo => new MutationObserver(colocarDicas).observe(alvo, { childList: true, subtree: true });
    function colocarDicas() {
      if (document.getElementById("demo-dica")) return;
      const auth = document.querySelector("#app .auth");
      if (auth && (pagina === "painel.html" || pagina === "admin.html") && auth.querySelector("#email")) {
        const d = dica(pagina === "admin.html"
          ? `<b>Demonstração</b>Entre com a conta de exemplo da plataforma.<div class="row"><button class="btn btn-blue btn-sm" data-como="admin">Entrar como administrador</button></div>`
          : `<b>Demonstração</b>Entre num negócio de exemplo já cheio de dados, ou crie sua conta acima para montar o seu do zero.
             <div class="row"><button class="btn btn-blue btn-sm" data-como="dono">Entrar como dono</button><button class="btn btn-ghost btn-sm" data-como="barbeiro">Entrar como funcionário</button></div>`);
        d.querySelectorAll("[data-como]").forEach(bt => bt.onclick = () => { BANCO_LOCAL.entrarComo(bt.dataset.como); location.reload(); });
        auth.appendChild(d);
      }
      const cod = document.getElementById("cod");
      if (cod) cod.closest("form").after(dica(`<b>Demonstração</b>Não enviamos e-mail de verdade: digite qualquer código de 6 números (ex.: 123456).`));
    }
    const app = document.getElementById("app");
    if (app) { vigiar(app); colocarDicas(); }
  });
})();
