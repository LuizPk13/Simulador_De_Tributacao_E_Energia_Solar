/*
 * Teste de referência da especificação.
 * Rode com: node tests/calc.test.js
 */
const assert = require("node:assert/strict");
const CONFIG = require("../js/config.js");
const Calc = require("../js/calc.js");

// Tabela "Teste de referência" da especificação (valores padrão de SC, out/2026).
const EXPECTED = {
  sem:   { investment: 14850, savingsYear1: 5279, payback: 3.3, npv: 60251 },
  atual: { investment: 12320, savingsYear1: 5679, payback: 2.5, npv: 68853 },
  local: { investment: 14069, savingsYear1: 5791, payback: 2.8, npv: 68544 },
  comp:  { investment: 14069, savingsYear1: 5352, payback: 3.0, npv: 62170 }
};

const g = Calc.defaultGlobals(CONFIG);
const results = Calc.runAll(g, CONFIG.scenarios, CONFIG.ibsCbsRate);
let failures = 0;

for (const r of results) {
  const e = EXPECTED[r.id];
  const checks = [
    ["investment", Math.abs(r.investment - e.investment) <= 1],
    ["savingsYear1", Math.abs(r.savingsYear1 - e.savingsYear1) <= 1],
    ["npv", Math.abs(r.npv - e.npv) <= 1],
    ["payback", Math.abs(Math.round(r.payback * 10) / 10 - e.payback) < 0.05]
  ];
  for (const [field, ok] of checks) {
    if (!ok) {
      failures++;
      console.error(`FALHOU ${r.id}.${field}: obtido ${r[field]}, esperado ${e[field]}`);
    }
  }
  console.log(
    `${ok(checks)} ${r.id.padEnd(6)} investimento ${r.investment.toFixed(0)} | ` +
    `economia ano 1 ${r.savingsYear1.toFixed(0)} | retorno ${r.payback.toFixed(2)} anos | VPL ${r.npv.toFixed(0)}`
  );
}

// A ponte de VPL precisa fechar exatamente no VPL de destino.
const ref = results.find((r) => r.id === "atual");
const comp = results.find((r) => r.id === "comp");
const bridge = Calc.npvBridge(g, ref.taxes, comp.taxes);
const sum = bridge.start + bridge.steps.reduce((s, x) => s + x.delta, 0);
assert.ok(Math.abs(sum - comp.npv) < 1e-6, "a ponte de VPL não fecha");
assert.ok(Math.abs(bridge.end - comp.npv) < 1e-6, "o fim da ponte difere do VPL do cenário");
console.log("ok     ponte de VPL fecha no VPL do cenário");

if (failures) {
  console.error(`\n${failures} verificação(ões) falharam.`);
  process.exit(1);
}
console.log("\nTodos os cenários batem com o teste de referência.");

function ok(checks) { return checks.every((c) => c[1]) ? "ok    " : "ERRO  "; }
