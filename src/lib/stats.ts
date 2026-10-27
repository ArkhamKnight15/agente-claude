/** Estatística simples para relatórios: taxas e teste de duas proporções. */

export function rate(part: number, total: number): number | null {
  return total > 0 ? part / total : null;
}

// Aproximação de Abramowitz-Stegun para a função erro.
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

export function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

export interface ProportionTest {
  rateA: number;
  rateB: number;
  z: number;
  pValue: number;
  significant: boolean;
}

/** Teste z bicaudal para diferença entre duas proporções. */
export function twoProportionTest(
  successA: number,
  totalA: number,
  successB: number,
  totalB: number,
  alpha = 0.05,
): ProportionTest | null {
  if (totalA === 0 || totalB === 0) return null;
  const rateA = successA / totalA;
  const rateB = successB / totalB;
  const pooled = (successA + successB) / (totalA + totalB);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / totalA + 1 / totalB));
  if (se === 0) return { rateA, rateB, z: 0, pValue: 1, significant: false };
  const z = (rateA - rateB) / se;
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));
  return { rateA, rateB, z, pValue, significant: pValue < alpha };
}
