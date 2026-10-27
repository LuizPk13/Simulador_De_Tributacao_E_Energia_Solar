/* Interface: liga a configuração e o cálculo à tela e aos gráficos. */
(function () {
  "use strict";

  const CONFIG = window.SIM_CONFIG;
  const Calc = window.SimCalc;
  const SERIES_VARS = ["--s1", "--s2", "--s3", "--s4"];
  const TAX_KEYS = Calc.TAX_KEYS;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- Formatação pt-BR ----------
  const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const fmtNum = (v, d) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
  const fmtYears = (v) => (v === null ? "não se paga" : `${fmtNum(v, 1)} ${Math.round(v * 10) / 10 === 1 ? "ano" : "anos"}`);
  const fmtPct = (v) => `${fmtNum(v * 100, v * 100 % 1 === 0 ? 0 : 1)}%`;
  const signed = (txt, v) => (v > 0 ? "+" : v < 0 ? "−" : "±") + txt;
  const brlShort = (v) => {
    const a = Math.abs(v);
    const s = a >= 1000 ? `R$ ${fmtNum(a / 1000, a >= 100000 ? 0 : 1)} mil` : `R$ ${fmtNum(a, 0)}`;
    return v < 0 ? `−${s}` : s;
  };
  function parseInput(str) {
    const clean = String(str).trim().replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
    if (clean === "" || clean === "-") return NaN;
    return Number(clean);
  }
  function toInputString(v, kind) {
    const n = kind === "percent" ? v * 100 : v;
    return String(Math.round(n * 100000) / 100000).replace(".", ",");
  }

  // ---------- Estado ----------
  const clone = (o) => JSON.parse(JSON.stringify(o));
  let state = null;
  function freshState() {
    return {
      globals: Calc.defaultGlobals(CONFIG),
      ibsCbs: CONFIG.ibsCbsRate,
      scenarios: clone(CONFIG.scenarios),
      selected: (state && state.selected) || CONFIG.referenceScenario,
      presenting: (state && state.presenting) || false
    };
  }
  state = freshState();

  let results = [];
  const byId = (id) => results.find((r) => r.id === id);
  const scenById = (id) => state.scenarios.find((s) => s.id === id);
  const indexOfScen = (id) => state.scenarios.findIndex((s) => s.id === id);

  // ---------- Cores do tema (lidas dos tokens CSS) ----------
  let colors = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => cs.getPropertyValue(n).trim();
    colors = {
      series: SERIES_VARS.map(v),
      ink: v("--ink"), ink2: v("--ink-2"), muted: v("--muted"),
      grid: v("--grid"), line: v("--line"), surface: v("--surface"),
      pos: v("--pos"), neg: v("--neg"), total: v("--total")
    };
  }
  function fade(hex, alpha) {
    const h = hex.replace("#", "");
    const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  const scenColor = (id) => colors.series[indexOfScen(id)];

  // ---------- Montagem da tela ----------
  const $ = (id) => document.getElementById(id);

  function buildScenarioButtons() {
    const box = $("scenario-buttons");
    box.innerHTML = "";
    state.scenarios.forEach((s, idx) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "scen-btn";
      b.setAttribute("role", "radio");
      b.dataset.id = s.id;
      b.style.setProperty("--c", `var(${SERIES_VARS[idx]})`);
      b.innerHTML =
        `<span class="scen-key">Tecla ${s.key}</span>` +
        `<span class="scen-name">${s.name}</span>` +
        `<span class="scen-basis">${s.basis}</span>`;
      b.addEventListener("click", () => select(s.id));
      box.appendChild(b);
    });
  }

  function buildGlobalFields() {
    const box = $("global-fields");
    box.innerHTML = "";
    for (const [key, def] of Object.entries(CONFIG.globals)) {
      const id = `f-${key}`;
      const wrap = document.createElement("div");
      wrap.className = "field";
      wrap.innerHTML =
        `<label for="${id}">${def.label}${def.estimate ? '<span class="star">*</span>' : ""}</label>` +
        `<div class="input-unit"><input id="${id}" inputmode="decimal" autocomplete="off"><span>${def.unit}</span></div>`;
      box.appendChild(wrap);
      const input = wrap.querySelector("input");
      input.value = toInputString(state.globals[key], def.kind);
      input.addEventListener("input", () => {
        const n = parseInput(input.value);
        let val = def.kind === "percent" ? n / 100 : n;
        if (def.kind === "integer") val = Math.round(val);
        const ok = Number.isFinite(val) && (def.min === undefined || val >= def.min) && (def.max === undefined || val <= def.max) &&
          (def.kind !== "percent" || (val >= 0 && val < 1));
        input.setAttribute("aria-invalid", ok ? "false" : "true");
        if (!ok) return;
        state.globals[key] = val;
        update(false);
      });
    }
  }

  function buildIbsCbsField() {
    const input = $("f-ibscbs");
    input.value = toInputString(state.ibsCbs, "percent");
    input.oninput = () => {
      const v = parseInput(input.value) / 100;
      const ok = Number.isFinite(v) && v >= 0 && v < 1;
      input.setAttribute("aria-invalid", ok ? "false" : "true");
      if (!ok) return;
      state.ibsCbs = v;
      update(false);
    };
  }

  function buildScenarioFields() {
    const body = $("scenario-fields").querySelector("tbody");
    body.innerHTML = "";
    state.scenarios.forEach((s) => {
      const tr = document.createElement("tr");
      let html = `<td>${s.name}</td>`;
      for (const k of TAX_KEYS) {
        const star = (s.estimates || []).includes(k) ? '<span class="star">*</span>' : "";
        if (s[k] === "IBS_CBS") {
          html += `<td><span class="linked">= IBS/CBS${star}</span></td>`;
        } else {
          const id = `f-${s.id}-${k}`;
          html += `<td><label class="sr-only" for="${id}">${s.name}: ${CONFIG.taxLabels[k]}</label>` +
            `<div class="input-unit"><input id="${id}" data-s="${s.id}" data-k="${k}" inputmode="decimal" autocomplete="off" value="${toInputString(s[k], "percent")}"><span>%${star}</span></div></td>`;
        }
      }
      tr.innerHTML = html;
      body.appendChild(tr);
    });
    body.querySelectorAll("input").forEach((input) => {
      input.addEventListener("input", () => {
        const v = parseInput(input.value) / 100;
        const ok = Number.isFinite(v) && v >= 0 && v < 1;
        input.setAttribute("aria-invalid", ok ? "false" : "true");
        if (!ok) return;
        scenById(input.dataset.s)[input.dataset.k] = v;
        update(false);
      });
    });
  }

  // ---------- Números grandes com animação curta ----------
  const shown = {};
  function animateNumber(el, key, target, format) {
    const from = shown[key];
    shown[key] = target;
    if (target === null || from === undefined || from === null || reduceMotion) {
      el.textContent = format(target);
      return;
    }
    const t0 = performance.now();
    const dur = 400;
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = format(from + (target - from) * e);
      if (p < 1 && shown[key] === target) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function renderResults(animate) {
    const sel = byId(state.selected);
    const ref = byId(CONFIG.referenceScenario);
    const scen = scenById(state.selected);
    $("selected-name").textContent = `${scen.name}`;
    document.querySelectorAll(".n-years").forEach((el) => (el.textContent = state.globals.N));

    const set = (id, key, val, fmt) => (animate ? animateNumber($(id), key, val, fmt) : (($(id).textContent = fmt(val)), (shown[key] = val)));
    set("v-payback", "payback", sel.payback, fmtYears);
    set("v-npv", "npv", sel.npv, fmtBRL.format);
    set("v-inv", "inv", sel.investment, fmtBRL.format);
    $("v-sav").textContent = fmtBRL.format(sel.savingsYear1);

    const isRef = state.selected === CONFIG.referenceScenario;
    const refName = scenById(CONFIG.referenceScenario).name;
    const vs = ` em relação ao ${refName}`;
    if (isRef) {
      $("d-payback").textContent = "Cenário de referência";
      $("d-npv").textContent = "Cenário de referência";
      $("d-inv").textContent = "Cenário de referência";
      $("d-sav").textContent = "";
    } else {
      const dp = sel.payback !== null && ref.payback !== null ? sel.payback - ref.payback : null;
      $("d-payback").textContent = dp === null ? "" : signed(`${fmtNum(Math.abs(dp), 1)} ano${Math.abs(dp) >= 1.95 ? "s" : ""}`, Math.round(dp * 10)) + vs;
      const dn = sel.npv - ref.npv;
      $("d-npv").textContent = signed(fmtBRL.format(Math.abs(dn)), Math.round(dn)) + vs;
      const di = sel.investment - ref.investment;
      $("d-inv").textContent = signed(fmtBRL.format(Math.abs(di)), Math.round(di)) + vs;
      const ds = sel.savingsYear1 - ref.savingsYear1;
      $("d-sav").textContent = `(${signed(fmtBRL.format(Math.abs(ds)), Math.round(ds))}${vs})`;
    }

    const usesIbs = TAX_KEYS.some((k) => scen[k] === "IBS_CBS");
    const notes = [];
    if (usesIbs) notes.push(`* Alíquota de IBS + CBS estimada em ${fmtPct(state.ibsCbs)}; a oficial ainda não foi fixada.`);
    if ((scen.estimates || []).includes("te")) notes.push("* Tributo sobre equipamentos estimado.");
    $("estimate-note").textContent = notes.join(" ");

    document.querySelectorAll(".scen-btn").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.id === state.selected)));
  }

  function renderTable() {
    const body = $("compare-table").querySelector("tbody");
    body.innerHTML = "";
    results.forEach((r, idx) => {
      const s = scenById(r.id);
      const tr = document.createElement("tr");
      if (r.id === state.selected) tr.className = "is-selected";
      tr.innerHTML =
        `<td><span class="swatch" style="--c: var(${SERIES_VARS[idx]})"></span>${s.name}</td>` +
        `<td class="num">${fmtBRL.format(r.investment)}</td>` +
        `<td class="num">${fmtBRL.format(r.savingsYear1)}</td>` +
        `<td class="num">${fmtYears(r.payback)}</td>` +
        `<td class="num">${fmtBRL.format(r.npv)}</td>`;
      body.appendChild(tr);
    });
  }

  // ---------- Gráficos ----------
  const charts = {};

  function baseFont() { return state.presenting ? 18 : 13; }

  function applyChartDefaults() {
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    Chart.defaults.font.size = baseFont();
    Chart.defaults.color = colors.muted;
    Chart.defaults.borderColor = colors.grid;
    Chart.defaults.animation.duration = reduceMotion ? 0 : 400;
  }

  const tooltipStyle = () => ({
    backgroundColor: colors.surface,
    titleColor: colors.ink,
    bodyColor: colors.ink2,
    borderColor: colors.line,
    borderWidth: 1,
    padding: 10,
    boxPadding: 4,
    titleFont: { weight: "700", size: baseFont() },
    bodyFont: { size: baseFont() }
  });

  // Rótulos na ponta das linhas, afastados para não se sobreporem.
  const endLabels = {
    id: "endLabels",
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      if (chart.width < 520) return; // no celular, a legenda identifica as linhas
      const items = [];
      chart.data.datasets.forEach((ds, i) => {
        const meta = chart.getDatasetMeta(i);
        if (meta.hidden || !ds.endLabel) return;
        const pts = meta.data.filter((p) => p && !p.skip);
        const last = pts[pts.length - 1];
        if (!last) return;
        items.push({ y: last.y, x: last.x, text: ds.endLabel, color: ds.labelColor, bold: ds.isSelected });
      });
      items.sort((a, b) => a.y - b.y);
      const gap = baseFont() + 4;
      for (let i = 1; i < items.length; i++) if (items[i].y - items[i - 1].y < gap) items[i].y = items[i - 1].y + gap;
      ctx.save();
      ctx.textBaseline = "middle";
      items.forEach((it) => {
        ctx.font = `${it.bold ? "700" : "500"} ${baseFont()}px ${Chart.defaults.font.family}`;
        ctx.fillStyle = it.color;
        ctx.fillText(it.text, it.x + 8, it.y);
      });
      ctx.restore();
    }
  };

  // Ponto onde cada linha cruza o zero (tempo de retorno).
  const paybackDots = {
    id: "paybackDots",
    afterDatasetsDraw(chart) {
      const { ctx, scales } = chart;
      chart.data.datasets.forEach((ds, i) => {
        if (chart.getDatasetMeta(i).hidden || ds.payback === null || ds.payback === undefined) return;
        const x = scales.x.getPixelForValue(ds.payback);
        const y = scales.y.getPixelForValue(0);
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, ds.isSelected ? 7 : 5, 0, Math.PI * 2);
        ctx.fillStyle = ds.borderColor;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = colors.surface;
        ctx.stroke();
        ctx.restore();
      });
    }
  };

  // Linha zero mais forte que a grade.
  const zeroLine = {
    id: "zeroLine",
    beforeDatasetsDraw(chart) {
      const { ctx, chartArea, scales } = chart;
      const y = scales.y.getPixelForValue(0);
      if (y < chartArea.top || y > chartArea.bottom) return;
      ctx.save();
      ctx.strokeStyle = colors.ink2;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(chartArea.left, y);
      ctx.lineTo(chartArea.right, y);
      ctx.stroke();
      ctx.restore();
    }
  };

  // Valor escrito na ponta de cada barra.
  const barValues = {
    id: "barValues",
    afterDatasetsDraw(chart, _args, opts) {
      const { ctx } = chart;
      const meta = chart.getDatasetMeta(0);
      ctx.save();
      ctx.font = `600 ${baseFont()}px ${Chart.defaults.font.family}`;
      ctx.fillStyle = colors.ink;
      meta.data.forEach((bar, i) => {
        const text = opts.labels[i];
        if (!text) return;
        if (chart.options.indexAxis === "y") {
          ctx.textBaseline = "middle";
          if (bar.x < bar.base) {
            ctx.textAlign = "right";
            ctx.fillText(text, bar.x - 8, bar.y);
          } else {
            ctx.textAlign = "left";
            ctx.fillText(text, Math.max(bar.x, bar.base) + 8, bar.y);
          }
        } else {
          ctx.textBaseline = "bottom";
          ctx.textAlign = "center";
          ctx.fillText(text, bar.x, Math.min(bar.y, bar.base) - 6);
        }
      });
      ctx.restore();
    }
  };

  // Linha vertical na alíquota usada.
  const rateMarker = {
    id: "rateMarker",
    afterDatasetsDraw(chart, _args, opts) {
      const { ctx, chartArea, scales } = chart;
      const x = scales.x.getPixelForValue(opts.value);
      if (x < chartArea.left || x > chartArea.right) return;
      ctx.save();
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = colors.ink2;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, chartArea.top);
      ctx.lineTo(x, chartArea.bottom);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = `600 ${baseFont()}px ${Chart.defaults.font.family}`;
      ctx.fillStyle = colors.ink;
      ctx.textBaseline = "top";
      const label = `Simulador: ${fmtPct(opts.value)}`;
      const w = ctx.measureText(label).width;
      const tx = x + 6 + w > chartArea.right ? x - 6 - w : x + 6;
      ctx.fillText(label, tx, chartArea.top + 4);
      ctx.restore();
    }
  };

  function lineData() {
    const N = state.globals.N;
    return {
      labels: Array.from({ length: N + 1 }, (_, y) => y),
      datasets: results.map((r) => {
        const sel = r.id === state.selected;
        const c = scenColor(r.id);
        return {
          label: scenById(r.id).name,
          data: r.cumulative,
          borderColor: sel ? c : fade(c, 0.45),
          backgroundColor: c,
          borderWidth: sel ? 4 : 2,
          pointRadius: 0,
          pointHoverRadius: 5,
          tension: 0,
          order: sel ? 0 : 1,
          isSelected: sel,
          payback: r.payback,
          endLabel: scenById(r.id).name,
          labelColor: sel ? colors.ink : colors.muted
        };
      })
    };
  }

  function makeLineChart() {
    charts.line = new Chart($("chart-line"), {
      type: "line",
      data: lineData(),
      plugins: [zeroLine, paybackDots, endLabels],
      options: {
        maintainAspectRatio: false,
        layout: { padding: { right: endLabelRoom() } },
        interaction: { mode: "index", intersect: false },
        scales: {
          x: { type: "linear", min: 0, max: state.globals.N, title: { display: true, text: "Anos" }, ticks: { stepSize: 5 }, grid: { display: false } },
          y: { title: { display: true, text: "R$ acumulados (descontados)" }, ticks: { callback: (v) => brlShort(v) } }
        },
        plugins: {
          legend: { position: "top", align: "start", labels: { usePointStyle: true, pointStyle: "line", color: colors.ink2 } },
          tooltip: {
            ...tooltipStyle(),
            callbacks: {
              title: (items) => `Ano ${items[0].parsed.x}`,
              label: (item) => ` ${item.dataset.label}: ${fmtBRL.format(item.parsed.y)}`
            }
          }
        }
      }
    });
  }

  function endLabelRoom() {
    if (window.innerWidth < 560) return 8;
    return state.presenting ? 320 : 240;
  }

  function barsData() {
    const sorted = [...results].sort((a, b) => (a.payback ?? Infinity) - (b.payback ?? Infinity));
    return {
      sorted,
      data: {
        labels: sorted.map((r) => scenById(r.id).name),
        datasets: [{
          data: sorted.map((r) => r.payback ?? state.globals.N),
          backgroundColor: sorted.map((r) => (r.id === state.selected ? scenColor(r.id) : fade(scenColor(r.id), 0.45))),
          borderColor: colors.surface,
          borderWidth: 2,
          borderRadius: 4,
          borderSkipped: "start",
          barPercentage: 0.75,
          categoryPercentage: 0.9
        }]
      }
    };
  }

  function makeBarsChart() {
    const { sorted, data } = barsData();
    charts.bars = new Chart($("chart-bars"), {
      type: "bar",
      data,
      plugins: [barValues],
      options: {
        indexAxis: "y",
        maintainAspectRatio: false,
        layout: { padding: { right: 110 } },
        scales: {
          x: { beginAtZero: true, title: { display: true, text: "Anos" }, ticks: { callback: (v) => fmtNum(v, Number.isInteger(v) ? 0 : 1) } },
          y: { grid: { display: false }, ticks: { color: colors.ink2, autoSkip: false, callback(v) { return wrapLabel(this.getLabelForValue(v), this.chart.width < 480 ? 10 : 16); } } }
        },
        plugins: {
          legend: { display: false },
          barValues: { labels: sorted.map((r) => fmtYears(r.payback)) },
          tooltip: { ...tooltipStyle(), callbacks: { label: (item) => ` ${fmtYears(barsData().sorted[item.dataIndex].payback)}` } }
        }
      }
    });
  }

  // Efeito de cada mudança de tributo no VPL, do cenário de referência ao selecionado.
  // Barras a partir do zero (e não cascata sobre o VPL total), porque as variações
  // são pequenas perto do total e ficariam invisíveis numa escala que começa em zero.
  function bridgeModel() {
    const ref = CONFIG.referenceScenario;
    const fromId = state.selected === ref ? state.scenarios[0].id : ref;
    const toId = state.selected;
    const b = Calc.npvBridge(state.globals, byId(fromId).taxes, byId(toId).taxes);
    const labels = b.steps.map((s) => CONFIG.taxLabels[s.key]);
    const deltas = b.steps.map((s) => (Math.abs(s.delta) < 0.5 ? 0 : s.delta));
    const fills = deltas.map((d) => (d === 0 ? colors.grid : d > 0 ? colors.pos : colors.neg));
    const texts = deltas.map((d) => (d === 0 ? "sem efeito" : (d > 0 ? "+" : "") + brlShort(d)));
    const maxAbs = Math.max(1000, ...deltas.map(Math.abs));
    return { fromId, toId, start: b.start, end: b.end, labels, deltas, fills, texts, maxAbs };
  }

  function bridgeScale(m) {
    const pad = m.maxAbs * 0.9;
    const hasNeg = m.deltas.some((d) => d < 0);
    const hasPos = m.deltas.some((d) => d > 0);
    return { min: hasNeg ? -(m.maxAbs + pad) : 0, max: hasPos ? m.maxAbs + pad : 0 };
  }

  function makeBridgeChart() {
    const m = bridgeModel();
    const sc = bridgeScale(m);
    charts.bridge = new Chart($("chart-bridge"), {
      type: "bar",
      data: { labels: m.labels, datasets: [{ data: m.deltas, backgroundColor: m.fills, borderColor: colors.surface, borderWidth: 2, borderRadius: 4, borderSkipped: false, barPercentage: 0.75, categoryPercentage: 0.9 }] },
      plugins: [barValues, zeroLineX],
      options: {
        indexAxis: "y",
        maintainAspectRatio: false,
        scales: {
          x: { min: sc.min, max: sc.max, title: { display: true, text: "Efeito no VPL (R$)" }, ticks: { callback: (v) => brlShort(v), maxTicksLimit: 6 } },
          y: { grid: { display: false }, ticks: { color: colors.ink2, autoSkip: false, callback(v) { return wrapLabel(this.getLabelForValue(v), this.chart.width < 480 ? 12 : 18); } } }
        },
        plugins: {
          legend: { display: false },
          barValues: { labels: m.texts },
          tooltip: { ...tooltipStyle(), callbacks: { label: (item) => ` ${bridgeModel().texts[item.dataIndex]}` } }
        }
      }
    });
    setBridgeSubtitle(m);
  }

  // Linha vertical no zero para barras horizontais com sinal.
  const zeroLineX = {
    id: "zeroLineX",
    afterDatasetsDraw(chart) {
      const { ctx, chartArea, scales } = chart;
      const x = scales.x.getPixelForValue(0);
      if (x < chartArea.left || x > chartArea.right) return;
      ctx.save();
      ctx.strokeStyle = colors.ink2;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, chartArea.top);
      ctx.lineTo(x, chartArea.bottom);
      ctx.stroke();
      ctx.restore();
    }
  };

  function wrapLabel(text, max = 14) {
    const words = text.split(" ");
    const lines = [];
    let cur = "";
    words.forEach((w) => {
      if ((cur + " " + w).trim().length > max && cur) { lines.push(cur); cur = w; } else cur = (cur + " " + w).trim();
    });
    if (cur) lines.push(cur);
    return lines;
  }

  function setBridgeSubtitle(m) {
    $("bridge-sub").textContent =
      `Do ${scenById(m.fromId).name} (${brlShort(m.start)}) ao ${scenById(m.toId).name} (${brlShort(m.end)}): ` +
      `quanto cada mudança de tributo soma (azul) ou tira (laranja) do valor presente líquido.`;
  }

  function sensRates() {
    const lo = Math.min(0.20, Math.floor(state.ibsCbs * 100 - 2) / 100);
    const hi = Math.max(0.32, Math.ceil(state.ibsCbs * 100 + 2) / 100);
    const out = [];
    for (let r = lo; r <= hi + 1e-9; r += 0.005) out.push(Math.round(r * 1000) / 1000);
    return out;
  }

  function sensData() {
    const rates = sensRates();
    const series = Calc.sensitivity(state.globals, state.scenarios, rates);
    return {
      rates,
      data: {
        datasets: series.map((s) => {
          const sel = s.id === state.selected;
          const c = scenColor(s.id);
          return {
            label: scenById(s.id).name,
            data: s.points,
            borderColor: sel ? c : fade(c, 0.45),
            backgroundColor: c,
            borderWidth: sel ? 4 : 2,
            pointRadius: 0,
            pointHoverRadius: 5,
            order: sel ? 0 : 1,
            spanGaps: false
          };
        })
      }
    };
  }

  function makeSensChart() {
    const { rates, data } = sensData();
    charts.sens = new Chart($("chart-sens"), {
      type: "line",
      data,
      plugins: [rateMarker],
      options: {
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        scales: {
          x: { type: "linear", min: rates[0], max: rates[rates.length - 1], title: { display: true, text: "Alíquota somada de IBS + CBS" }, ticks: { stepSize: 0.02, callback: (v) => fmtPct(v) }, grid: { display: false } },
          y: { beginAtZero: true, title: { display: true, text: "Tempo de retorno (anos)" }, ticks: { callback: (v) => fmtNum(v, Number.isInteger(v) ? 0 : 1) } }
        },
        plugins: {
          rateMarker: { value: state.ibsCbs },
          legend: { position: "top", align: "start", labels: { usePointStyle: true, pointStyle: "line", color: colors.ink2 } },
          tooltip: {
            ...tooltipStyle(),
            callbacks: {
              title: (items) => `IBS + CBS: ${fmtPct(items[0].parsed.x)}`,
              label: (item) => ` ${item.dataset.label}: ${fmtYears(item.parsed.y)}`
            }
          }
        }
      }
    });
  }

  function updateCharts() {
    // Linha
    const lc = charts.line;
    lc.data = lineData();
    lc.options.scales.x.max = state.globals.N;
    lc.options.layout.padding.right = endLabelRoom();
    lc.update();

    // Barras
    const { sorted, data } = barsData();
    charts.bars.data = data;
    charts.bars.options.plugins.barValues.labels = sorted.map((r) => fmtYears(r.payback));
    charts.bars.update();

    // Ponte
    const m = bridgeModel();
    const bc = charts.bridge;
    const bs = bridgeScale(m);
    bc.data.labels = m.labels;
    bc.data.datasets[0].data = m.deltas;
    bc.data.datasets[0].backgroundColor = m.fills;
    bc.data.datasets[0].borderColor = colors.surface;
    bc.options.scales.x.min = bs.min;
    bc.options.scales.x.max = bs.max;
    bc.options.plugins.barValues.labels = m.texts;
    bc.update();
    setBridgeSubtitle(m);

    // Sensibilidade
    const sd = sensData();
    const sc = charts.sens;
    sc.data = sd.data;
    sc.options.scales.x.min = sd.rates[0];
    sc.options.scales.x.max = sd.rates[sd.rates.length - 1];
    sc.options.plugins.rateMarker.value = state.ibsCbs;
    sc.update();
  }

  function rebuildCharts() {
    Object.values(charts).forEach((c) => c.destroy());
    readColors();
    applyChartDefaults();
    makeLineChart();
    makeBarsChart();
    makeBridgeChart();
    makeSensChart();
  }

  // ---------- Fluxo principal ----------
  function compute() {
    results = Calc.runAll(state.globals, state.scenarios, state.ibsCbs);
  }

  function update(animate) {
    compute();
    renderResults(animate);
    renderTable();
    updateCharts();
  }

  function select(id) {
    if (!scenById(id) || id === state.selected) return;
    state.selected = id;
    update(true);
  }

  function setPresenting(on) {
    state.presenting = on;
    document.body.classList.toggle("presenting", on);
    $("btn-present").setAttribute("aria-pressed", String(on));
    $("btn-present").textContent = on ? "Sair da apresentação" : "Modo apresentação";
    rebuildCharts();
  }

  function currentTheme() {
    const attr = document.documentElement.getAttribute("data-theme");
    if (attr) return attr;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  function syncThemeButton() {
    $("btn-theme").textContent = currentTheme() === "dark" ? "Tema claro" : "Tema escuro";
  }

  function resetAll() {
    state = freshState();
    buildGlobalFields();
    buildIbsCbsField();
    buildScenarioFields();
    update(false);
    $("reset-status").textContent = "Valores padrão restaurados.";
    setTimeout(() => ($("reset-status").textContent = ""), 3000);
  }

  function init() {
    $("data-date").textContent = CONFIG.dataDate;
    readColors();
    applyChartDefaults();
    buildScenarioButtons();
    buildGlobalFields();
    buildIbsCbsField();
    buildScenarioFields();
    compute();
    renderResults(false);
    renderTable();
    makeLineChart();
    makeBarsChart();
    makeBridgeChart();
    makeSensChart();
    syncThemeButton();

    $("btn-present").addEventListener("click", () => setPresenting(!state.presenting));
    $("btn-reset").addEventListener("click", resetAll);
    $("btn-theme").addEventListener("click", () => {
      document.documentElement.setAttribute("data-theme", currentTheme() === "dark" ? "light" : "dark");
    });

    // Atalhos: 1–4 trocam o cenário, P liga o modo apresentação.
    document.addEventListener("keydown", (e) => {
      const t = e.target;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const s = state.scenarios.find((x) => x.key === e.key);
      if (s) { e.preventDefault(); select(s.id); return; }
      if (e.key === "p" || e.key === "P") { e.preventDefault(); setPresenting(!state.presenting); }
    });

    // Tema: refaz as cores dos gráficos quando o tema muda.
    const onTheme = () => { syncThemeButton(); rebuildCharts(); };
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", onTheme);
    new MutationObserver(onTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    let resizeTimer;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        charts.line.options.layout.padding.right = endLabelRoom();
        charts.line.update("none");
      }, 150);
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
