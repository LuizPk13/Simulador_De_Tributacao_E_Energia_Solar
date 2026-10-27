/*
 * Modelo de cálculo (funções puras, sem acesso à tela).
 * Fórmulas: seção "Modelo de cálculo" da especificação.
 */
(function (root) {
  const TAX_KEYS = ["te", "tc", "ee", "et"];

  /** Valores padrão das entradas globais, como objeto simples { P: 5, C: 2200, ... }. */
  function defaultGlobals(config) {
    const out = {};
    for (const k of Object.keys(config.globals)) out[k] = config.globals[k].value;
    return out;
  }

  /** Troca o marcador "IBS_CBS" pela alíquota informada. */
  function resolveTaxes(scenario, ibsCbsRate) {
    const out = {};
    for (const k of TAX_KEYS) out[k] = scenario[k] === "IBS_CBS" ? ibsCbsRate : scenario[k];
    return out;
  }

  /**
   * Simula um cenário.
   * g: entradas globais (frações para percentuais); t: { te, tc, ee, et } já resolvidos.
   * Retorna investimento, economia no ano 1, acumulado descontado (anos 0..N), VPL e tempo de retorno.
   */
  function simulate(g, t) {
    const I = g.P * g.C * (1 + t.te);
    const cumulative = [-I];
    let cum = -I;
    let payback = I <= 0 ? 0 : null;
    let savingsYear1 = 0;

    for (let y = 1; y <= g.N; y++) {
      const E = g.P * g.Y * Math.pow(1 - g.d, y - 1);
      const Ty = g.T * Math.pow(1 + g.g, y - 1);
      const S =
        g.a * E * Ty * (1 + t.tc) +
        (1 - g.a) * E * Ty * ((1 + t.tc) - (1 - g.u) * t.ee - g.u * t.et);
      if (y === 1) savingsYear1 = S;

      const F = (S - g.m * I) / Math.pow(1 + g.i, y);
      const prev = cum;
      cum += F;
      cumulative.push(cum);

      // Interpolação linear dentro do ano em que o acumulado cruza o zero.
      if (payback === null && cum >= 0 && F > 0) payback = y - 1 + -prev / F;
    }

    return { investment: I, savingsYear1, cumulative, npv: cum, payback };
  }

  /** Simula todos os cenários da configuração. */
  function runAll(g, scenarios, ibsCbsRate) {
    return scenarios.map((s) => {
      const taxes = resolveTaxes(s, ibsCbsRate);
      return { id: s.id, taxes, ...simulate(g, taxes) };
    });
  }

  /**
   * Ponte de VPL entre dois conjuntos de tributos: aplica as mudanças uma a uma,
   * na ordem te → tc → ee → et, e mede o efeito de cada uma no VPL.
   * O efeito de cada passo depende da ordem; a soma dos passos é sempre exata.
   */
  function npvBridge(g, fromTaxes, toTaxes) {
    const start = simulate(g, fromTaxes).npv;
    const cur = { ...fromTaxes };
    let last = start;
    const steps = [];
    for (const k of TAX_KEYS) {
      cur[k] = toTaxes[k];
      const npv = simulate(g, cur).npv;
      steps.push({ key: k, delta: npv - last });
      last = npv;
    }
    return { start, steps, end: last };
  }

  /** Tempo de retorno de cada cenário para uma lista de alíquotas de IBS/CBS. */
  function sensitivity(g, scenarios, rates) {
    return scenarios.map((s) => ({
      id: s.id,
      points: rates.map((r) => ({ x: r, y: simulate(g, resolveTaxes(s, r)).payback }))
    }));
  }

  const api = { TAX_KEYS, defaultGlobals, resolveTaxes, simulate, runAll, npvBridge, sensitivity };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SimCalc = api;
})(typeof window !== "undefined" ? window : globalThis);
