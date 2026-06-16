export const STATUS_LABELS = {
  ok: 'Muito bem',
  warn: 'Perigoso',
  danger: 'Alerta crítico',
  neutral: null
};

const inRange = (value, min, max) => value >= min && value <= max;

/** CMV % — alvo 28–35% */
export const statusCmvPercent = (value) => {
  if (value == null) return 'neutral';
  if (inRange(value, 28, 35)) return 'ok';
  if (inRange(value, 22, 42)) return 'warn';
  return 'danger';
};

/** Labor cost % — alvo 20–26% */
export const statusLaborPercent = (value) => {
  if (value == null) return 'neutral';
  if (inRange(value, 20, 26)) return 'ok';
  if (inRange(value, 15, 32)) return 'warn';
  return 'danger';
};

/** Custos ocupacionais % — alvo até 10% */
export const statusOccupationalPercent = (value) => {
  if (value == null) return 'neutral';
  if (value <= 10) return 'ok';
  if (value <= 15) return 'warn';
  return 'danger';
};

/** Soma CMV + labor + ocupacional — alerta acima de 70% */
export const statusBigThreeCombined = (value) => {
  if (value == null) return 'neutral';
  if (value <= 65) return 'ok';
  if (value <= 70) return 'warn';
  return 'danger';
};

/** Progresso da meta / ponto de equilíbrio vs ritmo do mês */
export const statusTargetProgress = (progressPercent, daysElapsed, daysInMonth) => {
  if (progressPercent == null) return 'neutral';
  if (!daysInMonth || !daysElapsed) {
    if (progressPercent >= 75) return 'ok';
    if (progressPercent >= 50) return 'warn';
    return 'danger';
  }

  const expectedPace = (daysElapsed / daysInMonth) * 100;

  if (progressPercent >= expectedPace * 0.95) return 'ok';
  if (progressPercent >= expectedPace * 0.7) return 'warn';
  return 'danger';
};

/** Lucro — positivo é bom */
export const statusProfit = (value) => {
  if (value == null) return 'neutral';
  if (value > 0) return 'ok';
  if (value >= -500) return 'warn';
  return 'danger';
};

/** Margem de contribuição % */
export const statusContributionMargin = (value) => {
  if (value == null) return 'neutral';
  if (value >= 55) return 'ok';
  if (value >= 45) return 'warn';
  return 'danger';
};

/** Deduções de vendas como % do bruto — quanto menor, melhor */
export const statusDeductionsPercent = (deductions, gross) => {
  if (deductions == null || !gross) return 'neutral';
  const pct = (deductions / gross) * 100;
  if (pct <= 5) return 'ok';
  if (pct <= 12) return 'warn';
  return 'danger';
};

/** Tempo de atendimento em minutos — quanto menor, melhor */
export const statusServiceTime = (minutes) => {
  if (minutes == null) return 'neutral';
  if (minutes <= 25) return 'ok';
  if (minutes <= 40) return 'warn';
  return 'danger';
};

/** Desperdício como % do faturamento */
export const statusWastePercent = (wasteValue, grossRevenue) => {
  if (wasteValue == null || !grossRevenue) return 'neutral';
  const pct = (wasteValue / grossRevenue) * 100;
  if (pct <= 2) return 'ok';
  if (pct <= 5) return 'warn';
  return 'danger';
};

/** Clientes recorrentes % */
export const statusRecurringRate = (value) => {
  if (value == null) return 'neutral';
  if (value >= 35) return 'ok';
  if (value >= 20) return 'warn';
  return 'danger';
};

/** Absenteísmo / turnover % — quanto menor, melhor */
export const statusAbsenteeism = (value) => {
  if (value == null) return 'neutral';
  if (value <= 5) return 'ok';
  if (value <= 12) return 'warn';
  return 'danger';
};

export const statusTurnover = (value) => {
  if (value == null) return 'neutral';
  if (value <= 10) return 'ok';
  if (value <= 25) return 'warn';
  return 'danger';
};

/** Dias faltados vs esperados */
export const statusMissedDaysRatio = (missed, expected) => {
  if (missed == null || !expected) return 'neutral';
  const ratio = missed / expected;
  if (ratio <= 0.08) return 'ok';
  if (ratio <= 0.2) return 'warn';
  return 'danger';
};

/** Tempo por pedido (cozinha) */
export const statusPrepTimeOrder = (minutes) => {
  if (minutes == null) return 'neutral';
  if (minutes <= 30) return 'ok';
  if (minutes <= 45) return 'warn';
  return 'danger';
};

/** Tempo por prato */
export const statusPrepTimeDish = (minutes) => {
  if (minutes == null) return 'neutral';
  if (minutes <= 8) return 'ok';
  if (minutes <= 15) return 'warn';
  return 'danger';
};

/** Ticket médio — comparado à média da loja */
export const statusTicketVsAverage = (ticket, storeAverage) => {
  if (ticket == null || !storeAverage) return 'neutral';
  const ratio = ticket / storeAverage;
  if (ratio >= 0.95) return 'ok';
  if (ratio >= 0.75) return 'warn';
  return 'danger';
};

/** Volume de pedidos do funcionário vs média estimada */
export const statusVolumePositive = (count) => {
  if (count == null) return 'neutral';
  if (count >= 10) return 'ok';
  if (count >= 3) return 'warn';
  return 'danger';
};

/** Faturamento hoje vs média diária */
export const statusTodayVsDailyAvg = (today, dailyAvg) => {
  if (today == null || dailyAvg == null) return 'neutral';
  if (today >= dailyAvg * 0.9) return 'ok';
  if (today >= dailyAvg * 0.6) return 'warn';
  return 'danger';
};
