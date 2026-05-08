export const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const inrLakhs = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCurrency(value: number) {
  return inr.format(Number.isFinite(value) ? value : 0);
}

export function formatKpiCurrency(value: number) {
  const safe = Number.isFinite(value) ? value : 0;
  const abs = Math.abs(safe);
  const sign = safe < 0 ? "-" : "";

  if (abs >= 100000) {
    return `${sign}₹${inrLakhs.format(abs / 100000)}L`;
  }

  return formatCurrency(safe);
}

export function formatNumber(value: number) {
  return Math.round(Number.isFinite(value) ? value : 0).toLocaleString("en-IN");
}

export function formatPercent(value: number) {
  const safe = Number.isFinite(value) ? value : 0;
  return `${safe.toLocaleString("en-IN", {
    minimumFractionDigits: safe === 0 ? 0 : 1,
    maximumFractionDigits: 2,
  })}%`;
}
