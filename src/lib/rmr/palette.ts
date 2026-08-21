/**
 * Tokens de cor do design system em formato hex, para uso nos gráficos
 * (Recharts precisa de valores literais, não de classes utilitárias).
 * Mantido em sincronia com src/styles.css.
 */

export const BRAND = {
  bg: "#FFFFED",
  ink: "#1B1B1B",
  gray: "#525252",
  blue: "#231DB0",
  green: "#17804A",
  greenSoft: "#E6F4EC",
  red: "#B91C1C",
  redSoft: "#FBE9E9",
  border: "#E3E0CC",
  card: "#FFFFFF",
} as const;

/**
 * Rampa categórica única, cinza-azulada dessaturada (escuro -> claro).
 * Verde e vermelho ficam reservados para status (real vs meta).
 */
export const CATEGORICAL_RAMP = [
  "#232733",
  "#2E3340",
  "#3A4050",
  "#474E60",
  "#555D70",
  "#646C80",
  "#747C90",
  "#8790A0",
  "#9AA1B0",
  "#AEB4C0",
  "#C3C8D0",
  "#D8DBE0",
] as const;

export function rampColor(index: number): string {
  return CATEGORICAL_RAMP[index % CATEGORICAL_RAMP.length] ?? CATEGORICAL_RAMP[0];
}

/** Interpola entre o vermelho suave e o vermelho de marca (0..1). */
export function heatColor(t: number) {
  const clamped = Math.max(0, Math.min(1, t));
  if (clamped <= 0.001) return "#FFFFFF";
  const from = [0xfb, 0xe9, 0xe9];
  const to = [0xb9, 0x1c, 0x1c];
  const mix = from.map((f, i) => Math.round(f + ((to[i] ?? f) - f) * clamped));
  return `#${mix.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** Texto legível sobre o fundo do heatmap. */
export function heatTextColor(t: number) {
  return t > 0.55 ? "#FFFFFF" : BRAND.ink;
}
