/*
 * Configuração do simulador.
 * Todos os valores padrão ficam aqui. Para atualizar dados, edite só este arquivo.
 *
 * Percentuais são guardados como fração (0,23 = 23%).
 * Nos cenários, o valor "IBS_CBS" faz o campo seguir a alíquota de IBS/CBS definida em `ibsCbsRate`.
 */
(function (root) {
  const CONFIG = {
    dataDate: "out/2026",

    // Soma das estimativas não oficiais de CBS (9,21%) e IBS (18,7%), Senado Notícias, 26/10/2026.
    // O Senado fixa a alíquota da CBS de 2027 até 15/12/2026: troque este valor quando sair.
    ibsCbsRate: 0.279,
    ibsCbsIsEstimate: true,

    // Cenário usado como base para as diferenças exibidas na tela.
    referenceScenario: "atual",

    globals: {
      P: { label: "Potência do sistema", unit: "kWp", value: 5, kind: "number", step: 0.5, min: 0.5, estimate: true },
      C: { label: "Custo do sistema sem tributos", unit: "R$/kWp", value: 2200, kind: "number", step: 50, min: 0, estimate: true },
      Y: { label: "Geração anual por kWp", unit: "kWh/kWp/ano", value: 1300, kind: "number", step: 10, min: 0 },
      a: { label: "Autoconsumo instantâneo", unit: "%", value: 0.30, kind: "percent", estimate: true },
      T: { label: "Tarifa de energia sem tributos", unit: "R$/kWh", value: 0.75975, kind: "number", step: 0.001, min: 0 },
      u: { label: "Parcela da tarifa referente ao uso da rede (TUSD)", unit: "%", value: 0.545, kind: "percent" },
      g: { label: "Reajuste anual da tarifa", unit: "% a.a.", value: 0.04, kind: "percent", estimate: true },
      d: { label: "Perda anual de eficiência das placas", unit: "% a.a.", value: 0.005, kind: "percent", estimate: true },
      i: { label: "Taxa de desconto", unit: "% a.a.", value: 0.08, kind: "percent", estimate: true },
      m: { label: "Manutenção anual", unit: "% do investimento", value: 0.01, kind: "percent", estimate: true },
      N: { label: "Horizonte de análise", unit: "anos", value: 25, kind: "integer", step: 1, min: 1, max: 40 }
    },

    // te = tributo sobre equipamentos; tc = carga na conta de luz;
    // ee = tributo mantido sobre energia compensada; et = tributo mantido sobre TUSD compensada.
    scenarios: [
      {
        id: "sem", key: "1", name: "Sem desoneração",
        basis: "Hipotético: ICMS e PIS/Cofins sem nenhuma isenção",
        te: 0.35, tc: 0.23, ee: 0.23, et: 0.23, estimates: ["te"]
      },
      {
        id: "atual", key: "2", name: "Regime atual em SC",
        basis: "Conv. ICMS 101/97 e 16/2015, Lei 13.169/2015",
        te: 0.12, tc: 0.23, ee: 0, et: 0.21, estimates: ["te"]
      },
      {
        id: "local", key: "3", name: "Pós-reforma, GD local",
        basis: "LC 214/2025, art. 28, §§ 3º e 4º",
        te: "IBS_CBS", tc: "IBS_CBS", ee: 0, et: "IBS_CBS", estimates: ["te"]
      },
      {
        id: "comp", key: "4", name: "Pós-reforma, GD compartilhada",
        basis: "LC 214/2025, sem exclusão expressa",
        te: "IBS_CBS", tc: "IBS_CBS", ee: "IBS_CBS", et: "IBS_CBS", estimates: ["te"]
      }
    ],

    taxLabels: {
      te: "Tributo sobre equipamentos",
      tc: "Carga na conta de luz",
      ee: "Tributo sobre energia compensada",
      et: "Tributo sobre TUSD compensada"
    }
  };

  if (typeof module !== "undefined" && module.exports) module.exports = CONFIG;
  else root.SIM_CONFIG = CONFIG;
})(typeof window !== "undefined" ? window : globalThis);
