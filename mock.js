if (new URLSearchParams(location.search).get("tema_ui")) document.documentElement.dataset.tema = new URLSearchParams(location.search).get("tema_ui");
if (new URLSearchParams(location.search).get("aba")) try { localStorage.setItem("navalha_aba", JSON.stringify(new URLSearchParams(location.search).get("aba"))); } catch {}
// MODO DEMONSTRAÇÃO: Supabase falso com dados de exemplo. Nada é salvo.
window.__erros = [];
window.addEventListener("error", e => { __erros.push(e.message); mostraErros(); });
window.addEventListener("unhandledrejection", e => { __erros.push("promise: " + (e.reason?.message || e.reason)); mostraErros(); });
function mostraErros() {
  let d = document.getElementById("__err");
  if (!d) { d = document.createElement("pre"); d.id = "__err"; d.style.cssText = "position:fixed;top:0;left:0;right:0;background:#b00;color:#fff;z-index:9999;padding:8px;font-size:12px;white-space:pre-wrap"; document.documentElement.appendChild(d); }
  d.textContent = "ERROS JS:\n" + __erros.join("\n");
}

const P = new URLSearchParams(location.search);
const off = "-03:00";
const hojeStr = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const B = { id: "b1", slug: "os-barbeiros-jf", nome: "Os Barbeiros JF", whatsapp: "32991234073", endereco: "R. Diogo Álvares, 389 – Benfica, Juiz de Fora", logo_url: "logo.jpg", site_url: "https://cozta1.github.io/os-barbeiros-jf/", cor_destaque: "#2e6bff", fuso: "America/Sao_Paulo", intervalo_min: 30, antecedencia_min: 60, dias_abertos: 30, cancelamento_horas: 2, max_futuros: 3, tema: P.get("tema") || "urbano", site_titulo: "Corte\nna régua,\nsem fila.", site_texto: "Barbearia tradicional com estilo moderno. Escolha o serviço e o melhor horário pra você em poucos cliques.", instagram: "gabrielpires_barber01", maps_url: null, hero_url: "cadeira.jpg", dominio: null,
  fotos: [{ url: "corte1.jpg", legenda: "Barba" }, { url: "salao2.jpg", legenda: "O salão" }, { url: "corte3.jpg", legenda: "Corte + barba" }, { url: "atendimento.jpg", legenda: "Na cadeira" }, { url: "corte2.jpg", legenda: "Disfarçado" }, { url: "fachada.jpg", legenda: "Fachada" }] };
const SERV = [
  { id: "s1", barbearia_id: "b1", nome: "Máquina geral", descricao: "Corte todo na máquina", preco: 25, duracao_min: 30, ativo: true, ordem: 0 },
  { id: "s2", barbearia_id: "b1", nome: "Disfarçado", descricao: "Degradê na régua", preco: 35, duracao_min: 40, ativo: true, ordem: 1 },
  { id: "s3", barbearia_id: "b1", nome: "Barba", descricao: "Desenhada e alinhada", preco: 25, duracao_min: 30, ativo: true, ordem: 2 },
  { id: "s4", barbearia_id: "b1", nome: "Sobrancelha", descricao: null, preco: 10, duracao_min: 10, ativo: true, ordem: 3 },
];
const PROF = [
  { id: "p1", barbearia_id: "b1", nome: "Gabriel Pires", foto_url: null, ativo: true, ordem: 0 },
];
const PS = [];
for (const p of PROF) for (const s of SERV) PS.push({ barbearia_id: "b1", profissional_id: p.id, servico_id: s.id, preco: null, duracao_min: null });
const JOR = [];
for (const p of PROF) { for (let d = 1; d <= 5; d++) JOR.push({ id: `j${p.id}${d}`, barbearia_id: "b1", profissional_id: p.id, dia_semana: d, inicio: "08:00:00", fim: "20:00:00" }); JOR.push({ id: `j${p.id}6`, barbearia_id: "b1", profissional_id: p.id, dia_semana: 6, inicio: "08:00:00", fim: "16:00:00" }); }
const t = (h) => new Date(`${hojeStr}T${h}:00${off}`).toISOString();
const AG = [
  { id: "a1", barbearia_id: "b1", profissional_id: "p1", cliente_id: "c1", servico_nome: "Disfarçado + Barba", preco: 60, cliente_nome: "João Silva", cliente_telefone: "32988887777", inicio: t("09:00"), fim: t("10:10"), status: "concluido", origem: "online", observacao: null },
  { id: "a2", barbearia_id: "b1", profissional_id: "p1", cliente_id: "c2", servico_nome: "Máquina geral", preco: 25, cliente_nome: "Carlos Souza", cliente_telefone: "32977776666", inicio: t("10:30"), fim: t("11:00"), status: "faltou", origem: "online", observacao: null },
  { id: "a3", barbearia_id: "b1", profissional_id: "p1", cliente_id: "c3", servico_nome: "Disfarçado", preco: 35, cliente_nome: "Pedro Lima", cliente_telefone: "32966665555", inicio: t("19:00"), fim: t("19:40"), status: "confirmado", origem: "online", observacao: "Quero baixinho dos lados", reagendado_em: t("08:00") },
  { id: "a5", barbearia_id: "b1", profissional_id: "p1", cliente_id: "c2", servico_nome: "Disfarçado + Barba", preco: 60, cliente_nome: "Marcos Vale", cliente_telefone: "32951515151", inicio: t("13:00"), fim: t("14:10"), status: "confirmado", origem: "online", observacao: null },
  { id: "a6", barbearia_id: "b1", profissional_id: "p1", cliente_id: "c3", servico_nome: "Máquina geral", preco: 25, cliente_nome: "Tiago Melo", cliente_telefone: "32921212121", inicio: t("14:30"), fim: t("15:00"), status: "confirmado", origem: "online", observacao: null },
  { id: "a7", barbearia_id: "b1", profissional_id: "p1", cliente_id: "c1", servico_nome: "Sobrancelha", preco: 10, cliente_nome: "Léo Dias", cliente_telefone: "32931313131", inicio: t("16:00"), fim: t("16:10"), status: "confirmado", origem: "painel", observacao: null },
  { id: "a8", barbearia_id: "b1", profissional_id: "p1", cliente_id: "c2", servico_nome: "Tesoura", preco: 35, cliente_nome: "Ana Paula", cliente_telefone: "32941414141", inicio: t("17:30"), fim: t("18:10"), status: "confirmado", origem: "online", observacao: null },
  { id: "a9", barbearia_id: "b1", profissional_id: "p1", cliente_id: "c1", servico_nome: "Barba", preco: 25, cliente_nome: "Bruno Reis", cliente_telefone: "32911112222", inicio: t("11:30"), fim: t("12:00"), status: "concluido", origem: "online", observacao: null },
  { id: "a4", barbearia_id: "b1", profissional_id: "p1", cliente_id: "c1", servico_nome: "Barba", preco: 25, cliente_nome: "Rafael Costa", cliente_telefone: "32955554444", inicio: t("15:00"), fim: t("15:30"), status: "cancelado", cancelado_por: "cliente", origem: "online", observacao: null },
];
const BL = [{ id: "k1", barbearia_id: "b1", profissional_id: "p1", inicio: t("12:00"), fim: t("13:00"), motivo: "Almoço" }];
const ESP = [{ id: "e1", barbearia_id: "b1", nome: "Carla Mendes", telefone: "32944443333", servico_nome: "Disfarçado", profissional_id: null, data: hojeStr, periodo: "tarde", status: "aguardando" }];
const CLI = [
  { id: "c1", barbearia_id: "b1", nome: "João Silva", telefone: "32988887777", email: "joao@email.com", nascimento: "1990-05-12", observacoes: "Máquina 1 dos lados" },
  { id: "c2", barbearia_id: "b1", nome: "Carlos Souza", telefone: "32977776666", email: null, nascimento: null, observacoes: null },
  { id: "c3", barbearia_id: "b1", nome: "Pedro Lima", telefone: "32966665555", email: null, nascimento: null, observacoes: null },
];
const AV = [
  { id: "v1", barbearia_id: "b1", agendamento_id: "a1", profissional_id: "p1", nota: 5, comentario: "Saí na régua. Atendimento top e café fresco!", nome_exibicao: "João S.", servico_nome: "Disfarçado + Barba", resposta: "Valeu, João! Volte sempre.", publicada: true, criado_em: t("10:30") },
  { id: "v2", barbearia_id: "b1", agendamento_id: "a2", profissional_id: "p1", nota: 4, comentario: null, nome_exibicao: "Carlos S.", servico_nome: "Máquina geral", resposta: null, publicada: true, criado_em: t("11:30") },
  { id: "v3", barbearia_id: "b1", agendamento_id: "a5", profissional_id: "p1", nota: 2, comentario: "Atrasou 20 minutos.", nome_exibicao: "Lia M.", servico_nome: "Barba", resposta: null, publicada: false, criado_em: t("12:30") },
];
const PROD = [
  { id: "x1", barbearia_id: "b1", nome: "Pomada matte", preco_venda: 45, custo: 18, estoque: 12, estoque_minimo: 3, ativo: true },
  { id: "x2", barbearia_id: "b1", nome: "Óleo para barba", preco_venda: 38, custo: 15, estoque: 2, estoque_minimo: 3, ativo: true },
  { id: "x3", barbearia_id: "b1", nome: "Shampoo", preco_venda: 29, custo: null, estoque: 0, estoque_minimo: 0, ativo: false },
];
const CMD = [
  { id: "m1", barbearia_id: "b1", agendamento_id: "a1", cliente_nome: "João Silva", profissional_id: "p1", status: "fechada", subtotal: 105, desconto: 5, total: 100, aberta_em: t("09:00"), fechada_em: t("10:12") },
  { id: "m2", barbearia_id: "b1", agendamento_id: "a3", cliente_id: "c3", cliente_nome: "Pedro Lima", profissional_id: "p1", status: "aberta", subtotal: 0, desconto: 0, total: 0, aberta_em: t("13:00") },
  { id: "m3", barbearia_id: "b1", agendamento_id: null, cliente_nome: null, profissional_id: null, status: "cancelada", motivo_cancelamento: "Cobrado em duplicidade", subtotal: 45, desconto: 0, total: 45, aberta_em: t("11:00") },
];
const CIT = [
  { id: "i1", comanda_id: "m2", tipo: "servico", servico_id: "s2", descricao: "Disfarçado", profissional_id: "p1", quantidade: 1, preco_unit: 35, total: 35 },
  { id: "i2", comanda_id: "m2", tipo: "produto", produto_id: "x1", descricao: "Pomada matte", profissional_id: "p1", quantidade: 1, preco_unit: 45, total: 45 },
];
const PAG = [{ id: "g1", comanda_id: "m1", forma: "pix", valor: 60 }, { id: "g2", comanda_id: "m1", forma: "dinheiro", valor: 40 }];
const MOV = [
  { id: "v1", produto_id: "x1", tipo: "entrada", quantidade: 20, observacao: "NF 1234", criado_em: t("08:00") },
  { id: "v2", produto_id: "x1", tipo: "venda", quantidade: -1, observacao: "Venda", criado_em: t("10:12") },
];
const PROMO = [{ id: "pr1", barbearia_id: "b1", nome: "Manhã do corte", desconto_pct: 20, dias_semana: [2, 3], hora_inicio: "09:00:00", hora_fim: "12:00:00", servico_ids: ["s2"], validade_ate: null, ativa: true }];
const CUP = [{ id: "cu1", barbearia_id: "b1", codigo: "VOLTA10", tipo: "pct", valor: 10, usos: 7, usos_max: 50, uso_por_cliente: 1, validade_ate: null, ativo: true },
             { id: "cu2", barbearia_id: "b1", codigo: "NATAL", tipo: "valor", valor: 15, usos: 0, usos_max: null, uso_por_cliente: 1, validade_ate: "2026-12-26", ativo: false }];
const PAC = [{ id: "k1", barbearia_id: "b1", nome: "Clube do corte — 4 por mês", servico_id: "s2", quantidade: 4, preco: 120, validade_dias: 30, ativo: true }];
const PACC = [{ id: "pc1", barbearia_id: "b1", pacote_id: "k1", cliente_id: "c3", nome: "Clube do corte — 4 por mês", servico_id: "s2", quantidade: 4, usados: 1, valor_sessao: 30, valido_ate: "2099-01-01", status: "ativo" }];
const TAB = { barbearias: [B], servicos: SERV, profissionais: PROF, profissional_servicos: PS, jornadas: JOR, agendamentos: AG, bloqueios: BL, membros: P.get("barbeiro") ? [{ barbearia_id: "b1", user_id: "u1", papel: "barbeiro", profissional_id: "p1" }] : [{ barbearia_id: "b1", user_id: "u1", papel: "dono", profissional_id: null }, { barbearia_id: "b1", user_id: "u2", papel: "barbeiro", profissional_id: "p1" }],
  assinaturas: [P.get("plano") === "essencial"
    ? { barbearia_id: "b1", status: "ativa", teste_ate: null, vencimento: "2026-11-01", planos: { nome: "Essencial", max_profissionais: 2, recursos: [], ajustes_mes: 1 } }
    : { barbearia_id: "b1", status: P.get("assin") || "teste", teste_ate: new Date(Date.now() + 9 * 86400000).toISOString().slice(0, 10), vencimento: null, planos: null }],
  pedidos_ajuste: [{ id: "pa1", barbearia_id: "b1", titulo: "Trocar foto da capa", descricao: "Usar a foto nova da fachada que mandei no WhatsApp.", status: "feito", resposta: "Pronto! Já está no ar.", criado_em: new Date(Date.now() - 3 * 86400000).toISOString(), barbearias: { nome: "Os Barbeiros JF", whatsapp: "32991234073" } },
                   { id: "pa2", barbearia_id: "b1", titulo: "Banner de Natal", descricao: "Colocar uma faixa de promoção de Natal no topo do site.", status: "aberto", resposta: null, criado_em: new Date(Date.now() - 3600000).toISOString(), barbearias: { nome: "Barbearia do Zé", whatsapp: null } }],
  convites: [{ id: "cv1", barbearia_id: "b1", email: "novo@email.com", profissional_id: "p1", token: "11111111-2222-3333-4444-555555555555", expira_em: new Date(Date.now() + 5 * 86400000).toISOString(), aceito_em: null }],
  planos: [{ id: "pl1", nome: "Essencial", preco_mensal: 149, max_profissionais: 2, ativo: true, ordem: 1, recursos: [], ajustes_mes: 1, descricao: "Site próprio com domínio, agenda online e caixa para até 2 profissionais." },
           { id: "pl2", nome: "Profissional", preco_mensal: 229, max_profissionais: 6, ativo: true, ordem: 2, recursos: ["relatorios_completos", "comissoes", "marketing", "emails"], ajustes_mes: 3, descricao: "Tudo do Essencial + comissões, marketing, e-mails automáticos e relatórios completos." },
           { id: "pl3", nome: "Premium", preco_mensal: 329, max_profissionais: null, ativo: true, ordem: 3, recursos: ["relatorios_completos", "comissoes", "estoque", "marketing", "emails"], ajustes_mes: 6, descricao: "Tudo do Profissional + estoque, equipe ilimitada e atendimento prioritário." }], avaliacoes: AV, produtos: PROD, comandas: CMD, comanda_itens: CIT, comanda_pagamentos: PAG, movimentos_estoque: MOV, promocoes: PROMO, cupons: CUP, pacotes: PAC, pacotes_clientes: PACC, lista_espera: ESP, clientes: CLI };

function builder(tabela) {
  let linhas = [...(TAB[tabela] || [])], unico = null, op = "select";
  const r = {
    select() { return r; }, order() { return r; }, limit(n) { linhas = linhas.slice(0, n); return r; },
    eq(c, v) { if (op === "select") linhas = linhas.filter(x => x[c] === v); return r; },
    in(c, v) { linhas = linhas.filter(x => v.includes(x[c])); return r; },
    is(c, v) { linhas = linhas.filter(x => (x[c] ?? null) === v); return r; },
    upsert(v) { op = "insert"; linhas = [].concat(v); return r; },
    gte(c, v) { linhas = linhas.filter(x => x[c] >= v); return r; }, lt(c, v) { linhas = linhas.filter(x => x[c] < v); return r; },
    gt(c, v) { linhas = linhas.filter(x => x[c] > v); return r; },
    single() { unico = "single"; return r; }, maybeSingle() { unico = "maybe"; return r; },
    insert(v) { op = "insert"; linhas = [].concat(v).map((x, i) => ({ id: "novo" + i, ...x })); return r; },
    update(v) { op = "update"; linhas = [{ ...(TAB[tabela]?.[0] || {}), ...v }]; return r; },
    delete() { op = "delete"; linhas = []; return r; },
    then(ok, falha) { return Promise.resolve({ data: unico ? (linhas[0] ?? null) : linhas, error: null }).then(ok, falha); },
  };
  return r;
}

window.supabase = {
  createClient() {
    return {
      from: builder,
      rpc(nome, a) {
        let data = null;
        if (nome === "horarios_disponiveis") {
          data = [];
          const cheio = P.get("cheio");
          for (const p of PROF) {
            if (a.p_profissional && a.p_profissional !== p.id) continue;
            if (!a.p_servicos.every(s => PS.some(x => x.profissional_id === p.id && x.servico_id === s))) continue;
            const itens = a.p_servicos.map(s => { const sv = SERV.find(x => x.id === s), ps = PS.find(x => x.profissional_id === p.id && x.servico_id === s); return { preco: ps.preco ?? sv.preco, dur: ps.duracao_min ?? sv.duracao_min }; });
            const dur = itens.reduce((t, x) => t + x.dur, 0), preco = itens.reduce((t, x) => t + x.preco, 0);
            const fecha = new Date(`${a.p_data}T${new Date(`${a.p_data}T12:00:00Z`).getUTCDay() === 6 ? "16:00" : "20:00"}:00${off}`);
            for (let h = new Date(`${a.p_data}T08:00:00${off}`); h.getTime() + dur * 60000 <= fecha.getTime(); h = new Date(h.getTime() + 30 * 60000)) {
              if (cheio || h < new Date(Date.now() + 3600000)) continue;
              if ((h.getUTCHours() + p.ordem) % 4 === 0) continue;
              const hl = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hourCycle: "h23" }).format(h));
              const promo = !P.get("cheio") && a.p_servicos.includes("s2") && hl >= 9 && hl < 12;
              const desc = promo ? Math.round((PS.find(x => x.profissional_id === p.id && x.servico_id === "s2").preco ?? 35) * 0.2 * 100) / 100 : 0;
              data.push({ profissional_id: p.id, inicio: h.toISOString().replace(".000Z", "+00:00"), duracao_min: dur, preco: preco - desc, preco_cheio: preco, promocao: promo ? "Manhã do corte" : null });
            }
          }
          data.sort((x, y) => x.inicio.localeCompare(y.inicio));
        }
        if (nome === "criar_agendamento") data = { codigo: "0b8f2c1e-1111-4a2b-9c3d-123456789abc" };
        if (nome === "consultar_agendamento") {
          const st = P.get("st") || "confirmado";
          data = { id: "a3", barbearia: { id: "b1", nome: B.nome, slug: B.slug, whatsapp: B.whatsapp, endereco: B.endereco, fuso: B.fuso, logo_url: B.logo_url, site_url: B.site_url, cor_destaque: B.cor_destaque, cancelamento_horas: 2 },
            servico: "Disfarçado + Barba", preco: 60, servicos: [{ id: "s2", nome: "Disfarçado", preco: 35, duracao_min: 40 }, { id: "s3", nome: "Barba", preco: 25, duracao_min: 30 }],
            profissional: "Gabriel Pires", profissional_id: "p1", cliente: "Joana", inicio: new Date(Date.now() + 2 * 86400000).toISOString(), fim: new Date(Date.now() + 2 * 86400000 + 70 * 60000).toISOString(),
            status: st, pode_alterar: st === "confirmado" && !P.get("prazo"), prazo_alteracao: null,
            pode_avaliar: st === "concluido" && !P.get("avaliado"),
            avaliacao: P.get("avaliado") ? { nota: 4, comentario: "Muito bom, só demorou um pouco.", resposta: "Obrigado! Vamos melhorar a pontualidade." } : null };
        }
        if (["cancelar_agendamento", "reagendar_agendamento", "entrar_lista_espera", "avaliar"].includes(nome)) data = true;
        if (nome === "vincular_agendamentos") data = 1;
        if (nome === "abrir_comanda") data = "m2";
        if (nome === "cota_ajustes") data = { limite: P.get("plano") === "essencial" ? 1 : 1, usados: 0 };
        if (nome === "pedir_ajuste") data = "novo";
        if (nome === "barbearia_por_dominio") data = null;
        if (nome === "aceitar_convite") data = "b1";
        if (nome === "admin_registrar_pagamento") data = "2026-11-01";
        if (nome === "admin_barbearias") data = [
          { id: "b1", nome: "Os Barbeiros JF", slug: "os-barbeiros-jf", whatsapp: "32991234073", email_dono: "gabriel@email.com", status: "ativa", plano: "Profissional", plano_id: "pl2", preco_mensal: 229, vencimento: "2026-11-01", ultimo_pagamento: "2026-10-01", agenda_ligada: true, agendamentos_30d: 214, profissionais: 1 },
          { id: "b2", nome: "Barbearia do Zé", slug: "barbearia-do-ze", whatsapp: null, email_dono: "ze@email.com", status: "teste", plano: null, plano_id: null, preco_mensal: null, teste_ate: "2026-10-12", agenda_ligada: true, agendamentos_30d: 12, profissionais: 1 },
          { id: "b3", nome: "Navalha de Ouro", slug: "navalha-de-ouro", whatsapp: "21999990000", email_dono: "contato@ouro.com", status: "atrasada", plano: "Essencial", plano_id: "pl1", preco_mensal: 149, vencimento: "2026-09-25", ultimo_pagamento: "2026-08-25", agenda_ligada: true, agendamentos_30d: 88, profissionais: 1 },
          { id: "b4", nome: "Corte Fino", slug: "corte-fino", whatsapp: null, email_dono: "fino@email.com", status: "suspensa", plano: "Essencial", plano_id: "pl1", preco_mensal: 149, vencimento: "2026-08-10", agenda_ligada: false, agendamentos_30d: 0, profissionais: 1 }];
        if (nome === "validar_cupom") data = { desconto: Math.round(a.p_subtotal * 10) / 100, descricao: "10% de desconto" };
        if (nome === "marketing_clientes") data = {
          sumidos: [{ id: "c1", nome: "João Silva", telefone: "32988887777", ultima: new Date(Date.now() - 62 * 86400000).toISOString(), visitas: 9, ultimo_contato: null },
                    { id: "c2", nome: "Carlos Souza", telefone: "32977776666", ultima: new Date(Date.now() - 50 * 86400000).toISOString(), visitas: 3, ultimo_contato: new Date().toISOString() }],
          aniversariantes: [{ id: "c3", nome: "Pedro Lima", telefone: "32966665555", nascimento: "1994-10-03", dias: 2, ultimo_contato: null }] };
        if (nome === "fechar_comanda") data = { subtotal: 80, desconto: 0, total: 80 };
        if (nome === "cancelar_comanda") data = true;
        if (nome === "relatorio" && P.get("plano") === "essencial") {
          const dias = Array.from({ length: 30 }, (_, i) => { const d = new Date(Date.now() - (29 - i) * 86400000); return { dia: d.toISOString().slice(0, 10), valor: d.getDay() === 0 ? 0 : Math.round(300 + 500 * Math.abs(Math.sin(i * 1.7))), atendimentos: 8 }; });
          return Promise.resolve({ data: { basico: true, faturamento: 12840, descontos: 120, comandas: 214, ticket_medio: 60, concluidos: 214, por_pagamento: { pix: 7200 }, por_dia: dias }, error: null });
        }
        if (nome === "relatorio") {
          const dias = Array.from({ length: 30 }, (_, i) => { const d = new Date(Date.now() - (29 - i) * 86400000); return { dia: d.toISOString().slice(0, 10), valor: d.getDay() === 0 ? 0 : Math.round(300 + 500 * Math.abs(Math.sin(i * 1.7))), atendimentos: d.getDay() === 0 ? 0 : 6 + (i % 7) }; });
          data = { faturamento: 12840, descontos: 120, comandas: 214, ticket_medio: 60, servicos_valor: 11200, produtos_valor: 1640, comissoes: 4644, agendamentos: 240, concluidos: 214, faltas: 9, cancelados: 17, taxa_falta: 4.0, online_pct: 71.5, clientes_atendidos: 163, clientes_novos: 38,
            por_pagamento: { pix: 7200, dinheiro: 2600, credito: 1900, debito: 1140 },
            por_profissional: [{ id: "p1", nome: "Gabriel Pires", faturamento: 8100, servicos: 7100, produtos: 1000, comissao: 2940, atendimentos: 132, faltas: 5, ocupacao: 78.4 }],
            por_servico: [{ nome: "Disfarçado", qtd: 140, valor: 4900 }, { nome: "Disfarçado + Barba", qtd: 52, valor: 3120 }, { nome: "Barba", qtd: 70, valor: 1750 }, { nome: "Máquina geral", qtd: 41, valor: 1025 }],
            por_produto: [{ nome: "Pomada matte", qtd: 26, valor: 1170 }, { nome: "Óleo para barba", qtd: 12, valor: 456 }], por_dia: dias };
        }
        if (nome === "resumo_avaliacoes") data = { media: 4.8, total: 23, profissionais: { p1: { media: 4.8, total: 23 } } };
        if (nome === "meus_agendamentos") {
          const bb = { id: "b1", nome: B.nome, slug: B.slug, fuso: B.fuso, logo_url: B.logo_url };
          const dia = n => new Date(Date.now() + n * 86400000).toISOString();
          data = [
            { codigo: "c-futuro", inicio: dia(3), fim: dia(3), status: "confirmado", preco: 60, servico: "Disfarçado + Barba", profissional_id: "p1", profissional: "Gabriel Pires", barbearia: bb, servicos: ["s2", "s3"], nota: null, pode_avaliar: false, pode_alterar: true },
            { codigo: "c-ontem", inicio: dia(-1), fim: dia(-1), status: "concluido", preco: 35, servico: "Disfarçado", profissional_id: "p1", profissional: "Gabriel Pires", barbearia: bb, servicos: ["s2"], nota: null, pode_avaliar: true, pode_alterar: false },
            { codigo: "c-mes", inicio: dia(-25), fim: dia(-25), status: "concluido", preco: 25, servico: "Barba", profissional_id: "p1", profissional: "Gabriel Pires", barbearia: bb, servicos: ["s3"], nota: 5, pode_avaliar: false, pode_alterar: false },
          ];
        }
        if (nome === "painel_criar_agendamento") data = "novo";
        return Promise.resolve({ data, error: null });
      },
      auth: {
        getSession: () => Promise.resolve({ data: { session: !P.get("sair") ? { user: { id: "u1", email: "bia@email.com" } } : null } }),
        onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
        signOut: () => Promise.resolve({}),
        signInWithOtp: () => Promise.resolve({ error: null }),
        signInWithPassword: () => Promise.resolve({ error: null, data: {} }),
        signUp: () => Promise.resolve({ error: null, data: { session: {} } }),
        verifyOtp: () => Promise.resolve({ error: null }),
      },
    };
  },
};
window.NAVALHA_CONFIG = { supabaseUrl: "https://teste.supabase.co", supabaseKey: "sb_publishable_teste", demoUrl: "./" };

// Faixa de demonstração com atalhos para as telas
document.addEventListener("DOMContentLoaded", () => {
  // ?clicar=<seletor> clica num elemento depois de carregar; ?limpo=1 esconde esta faixa (prints da página de vendas)
  const Q = new URLSearchParams(location.search);
  if (Q.get("clicar")) setTimeout(() => document.querySelector(Q.get("clicar"))?.click(), 1500);
  if (Q.get("limpo")) return;
  const links = [["Página inicial", "index.html"], ["Site da barbearia", "site.html?b=os-barbeiros-jf"], ["Site (tema clássico)", "site.html?b=os-barbeiros-jf&tema=classico"],
    ["Agendar (cliente)", "agendar.html?b=os-barbeiros-jf"], ["Meu horário", "agendamento.html?c=0b8f2c1e-1111-4a2b-9c3d-123456789abc"], ["Minha conta", "conta.html?b=os-barbeiros-jf"],
    ["Painel do dono", "painel.html"], ["Painel (plano Essencial)", "painel.html?plano=essencial"], ["Painel do barbeiro", "painel.html?barbeiro=1"], ["Admin", "admin.html"]];
  const d = document.createElement("div");
  d.style.cssText = "position:fixed;left:8px;bottom:" + (innerWidth < 760 ? 66 : 8) + "px;z-index:99999;background:#ffb020;color:#111;font:600 11px/1.4 ui-monospace,monospace;padding:6px 8px;max-width:calc(100% - 16px);box-shadow:0 4px 14px rgba(0,0,0,.4)";
  d.innerHTML = `${innerWidth < 760 ? "DEMO ·" : "DEMONSTRAÇÃO · dados de exemplo, nada é salvo ·"} <select style="font:inherit;padding:2px;width:auto;background:#fff;color:#111;border:1px solid #111">
    <option>ir para…</option>${links.map(([t, u]) => `<option value="${u}">${t}</option>`).join("")}</select>`;
  d.querySelector("select").onchange = e => e.target.value && (location.href = e.target.value);
  document.body.appendChild(d);
});
