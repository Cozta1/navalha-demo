// Utilidades compartilhadas por agendar.html, agendamento.html e painel.html

const cfg = window.NAVALHA_CONFIG || {};
const configurado = /^https:\/\/.+\.supabase\.co$/.test(cfg.supabaseUrl || "") && !/COLE_AQUI/.test(cfg.supabaseKey || "");
const SUPORTE_WHATS = cfg.suporteWhatsapp || "";
const sb = configurado ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey) : null;

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const dinheiro = v => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const soDigitos = v => String(v ?? "").replace(/\D/g, "");

function fmtTelefone(v) {
  const d = soDigitos(v).replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return v ?? "";
}

function mascaraTelefone(input) {
  input.addEventListener("input", () => {
    const d = soDigitos(input.value).slice(0, 11);
    let s = d;
    if (d.length > 2) s = `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length > 7) s = `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
    input.value = s;
  });
}

// Link wa.me: números brasileiros sem DDI recebem 55
function linkWhats(telefone, texto) {
  let d = soDigitos(telefone);
  if (d.length === 10 || d.length === 11) d = "55" + d;
  return `https://wa.me/${d}${texto ? "?text=" + encodeURIComponent(texto) : ""}`;
}

// ---------- datas no fuso da barbearia ----------
function offsetFuso(fuso, data = new Date()) {
  const parte = new Intl.DateTimeFormat("en-US", { timeZone: fuso, timeZoneName: "longOffset" })
    .formatToParts(data).find(p => p.type === "timeZoneName").value; // "GMT-03:00" ou "GMT"
  return parte === "GMT" ? "+00:00" : parte.slice(3);
}
// "YYYY-MM-DD" de hoje no fuso
const hojeNoFuso = fuso => new Intl.DateTimeFormat("en-CA", { timeZone: fuso }).format(new Date());
// Date que representa "data + hora" no relógio da barbearia
function dataHoraNoFuso(dataStr, horaStr, fuso) {
  const off = offsetFuso(fuso, new Date(`${dataStr}T12:00:00Z`));
  return new Date(`${dataStr}T${horaStr.length === 5 ? horaStr + ":00" : horaStr}${off}`);
}
function somaDias(dataStr, n) {
  const d = new Date(`${dataStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const diaSemana = dataStr => new Date(`${dataStr}T12:00:00Z`).getUTCDay();

const fmtHora = (iso, fuso) => new Intl.DateTimeFormat("pt-BR", { timeZone: fuso, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const fmtDataLonga = (iso, fuso) => new Intl.DateTimeFormat("pt-BR", { timeZone: fuso, weekday: "long", day: "2-digit", month: "long" }).format(new Date(iso));
const fmtDataCurta = (dataStr) => {
  const d = new Date(`${dataStr}T12:00:00Z`);
  return {
    semana: new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "short" }).format(d).replace(".", ""),
    dia: d.getUTCDate(),
    mes: new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", month: "short" }).format(d).replace(".", ""),
  };
};

// ---------- feedback ----------
function toast(msg, tipo = "ok") {
  let box = $("#toasts");
  if (!box) { box = document.createElement("div"); box.id = "toasts"; document.body.appendChild(box); }
  const el = document.createElement("div");
  el.className = `toast ${tipo}`;
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.classList.add("sai"), 3500);
  setTimeout(() => el.remove(), 4000);
}

// Mensagem legível a partir de erro do Supabase/Postgres
// Segmentos atendidos e estilos de site (o estilo é escolhido pela equipe, não pelo dono)
const SEGMENTOS = { barbearia: "Barbearia", salao: "Salão de beleza", unhas: "Unhas / esmalteria", cilios: "Sobrancelhas e cílios", outro: "Outra área" };
const TEMAS_SITE = { urbano: "Urbano (escuro, marcante)", classico: "Clássico (claro, serifado)", elegante: "Elegante (salão)", doce: "Doce (unhas)", minimal: "Minimal (sobrancelhas e cílios)" };

function msgErro(e) {
  const m = e?.message || String(e);
  if (/agendamento_sem_conflito/.test(m)) return "Já existe um agendamento nesse horário para esse profissional.";
  if (/Invalid login credentials/i.test(m)) return "E-mail ou senha incorretos.";
  if (/Email not confirmed/i.test(m)) return "Confirme seu e-mail pelo link que enviamos antes de entrar.";
  if (/User already registered/i.test(m)) return "Esse e-mail já tem conta. Use \"Entrar\".";
  if (/Password should be/i.test(m)) return "A senha precisa ter pelo menos 6 caracteres.";
  if (/Failed to fetch|NetworkError/i.test(m)) return "Sem conexão. Verifique a internet e tente de novo.";
  return m;
}

function avisoNaoConfigurado() {
  document.body.innerHTML = `<main class="wrap estreito" style="padding:60px 16px">
    <div class="card"><h2>Falta configurar o Supabase</h2>
    <p class="muted">Edite <code>js/config.js</code> com a URL e a chave publishable do seu projeto Supabase
    e rode <code>supabase/schema.sql</code> no SQL Editor. Veja o README.</p></div></main>`;
}

// Arquivo .ics para "adicionar ao calendário"
function baixarIcs({ titulo, inicio, fim, local, descricao }) {
  const f = d => new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const linhas = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Marcai//Agenda//PT", "BEGIN:VEVENT",
    `UID:${f(inicio)}-${Math.random().toString(36).slice(2)}@marcai`, `DTSTAMP:${f(new Date())}`,
    `DTSTART:${f(inicio)}`, `DTEND:${f(fim)}`, `SUMMARY:${titulo}`,
    local ? `LOCATION:${local}` : "", descricao ? `DESCRIPTION:${descricao.replace(/\n/g, "\\n")}` : "",
    "BEGIN:VALARM", "TRIGGER:-PT2H", "ACTION:DISPLAY", "DESCRIPTION:Lembrete", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ].filter(Boolean);
  const url = URL.createObjectURL(new Blob([linhas.join("\r\n")], { type: "text/calendar" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: "agendamento.ics" });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Cor de destaque da barbearia (configurável no painel)
function aplicarTema(barb) {
  if (!barb?.cor_destaque || !/^#[0-9a-f]{6}$/i.test(barb.cor_destaque)) return;
  document.documentElement.style.setProperty("--blue", barb.cor_destaque);
  // texto sobre a cor da barbearia: preto se a cor for clara, branco se for escura
  const [r, g, b_] = [1, 3, 5].map(i => parseInt(barb.cor_destaque.slice(i, i + 2), 16) / 255)
    .map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b_;
  document.documentElement.style.setProperty("--on-accent", lum > 0.45 ? "#111" : "#fff");
}

// ---------- tema claro/escuro (telas do cliente e página de vendas) ----------
const temaAtual = () => document.documentElement.dataset.tema
  || (matchMedia("(prefers-color-scheme: light)").matches ? "claro" : "escuro");
function botaoTema() {
  const b = document.createElement("button");
  b.type = "button"; b.className = "tema-btn";
  const pinta = () => {
    const claro = temaAtual() === "claro";
    b.textContent = claro ? "☾" : "☀";
    b.title = b.ariaLabel = claro ? "Usar tema escuro" : "Usar tema claro";
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = claro ? "#f6f1ea" : "#0e0d0c";
  };
  b.onclick = () => {
    const novo = temaAtual() === "claro" ? "escuro" : "claro";
    document.documentElement.dataset.tema = novo;
    guarda.gravar("navalha_tema", novo);
    pinta();
  };
  pinta();
  return b;
}

const somaPreco = itens => itens.reduce((t, x) => t + Number(x.preco), 0);
const somaDuracao = itens => itens.reduce((t, x) => t + Number(x.duracao_min), 0);
const fmtDuracao = min => min >= 60 ? `${Math.floor(min / 60)}h${min % 60 ? String(min % 60).padStart(2, "0") : ""}` : `${min} min`;

// localStorage pode falhar (aba anônima etc.) — nunca quebrar a página por isso
const guarda = {
  ler(chave, padrao) { try { return JSON.parse(localStorage.getItem(chave)) ?? padrao; } catch { return padrao; } },
  gravar(chave, valor) { try { localStorage.setItem(chave, JSON.stringify(valor)); } catch {} },
};
