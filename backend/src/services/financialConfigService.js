const db = require('../../database/connection');

const DEFAULT_CONFIG = {
  salesTaxes: {
    creditRate: 0,
    debitRate: 0,
    ifoodRate: 0,
    unassignedRate: 0,
    extras: []
  },
  cmv: {
    initialStock: null,
    purchases: null,
    finalStock: null,
    targetPercent: null
  },
  occupational: {
    energy: null,
    water: null,
    extras: []
  },
  operatingExpenses: {
    items: []
  },
  capex: {
    value: null
  },
  goals: {
    monthlyRevenueTarget: null
  }
};

const toNumber = (value) => {
  if (value == null || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeExtras = (list, withRate = false) => {
  if (!Array.isArray(list)) {
    return [];
  }

  return list
    .map((item, index) => {
      const base = {
        id: item.id || `extra-${index}-${Date.now()}`,
        label: String(item.label || 'Outro').trim() || 'Outro'
      };

      if (withRate) {
        return {
          ...base,
          ratePercent: Math.max(0, Number(item.ratePercent) || 0),
          base: item.base || 'all'
        };
      }

      return {
        ...base,
        value: Math.max(0, Number(item.value) || 0)
      };
    })
    .filter((item) => item.label);
};

const mergeConfig = (raw = {}) => ({
  salesTaxes: {
    creditRate: Math.max(0, Number(raw.salesTaxes?.creditRate) || 0),
    debitRate: Math.max(0, Number(raw.salesTaxes?.debitRate) || 0),
    ifoodRate: Math.max(0, Number(raw.salesTaxes?.ifoodRate) || 0),
    unassignedRate: Math.max(0, Number(raw.salesTaxes?.unassignedRate) || 0),
    extras: normalizeExtras(raw.salesTaxes?.extras, true)
  },
  cmv: {
    initialStock: toNumber(raw.cmv?.initialStock),
    purchases: toNumber(raw.cmv?.purchases),
    finalStock: toNumber(raw.cmv?.finalStock),
    targetPercent: toNumber(raw.cmv?.targetPercent)
  },
  occupational: {
    energy: toNumber(raw.occupational?.energy),
    water: toNumber(raw.occupational?.water),
    extras: normalizeExtras(raw.occupational?.extras, false)
  },
  operatingExpenses: {
    items: normalizeExtras(raw.operatingExpenses?.items, false)
  },
  capex: {
    value: toNumber(raw.capex?.value)
  },
  goals: {
    monthlyRevenueTarget: toNumber(raw.goals?.monthlyRevenueTarget)
  }
});

const ensureTable = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS financial_config (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      config JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    INSERT INTO financial_config (id, config)
    VALUES (1, '{}'::jsonb)
    ON CONFLICT (id) DO NOTHING
  `);
};

const getConfig = async () => {
  await ensureTable();

  const result = await db.query('SELECT config FROM financial_config WHERE id = 1');
  return mergeConfig(result.rows[0]?.config || DEFAULT_CONFIG);
};

const saveConfig = async (partialConfig) => {
  const current = await getConfig();
  const next = mergeConfig({
    ...current,
    ...partialConfig,
    salesTaxes: { ...current.salesTaxes, ...partialConfig.salesTaxes },
    cmv: { ...current.cmv, ...partialConfig.cmv },
    occupational: { ...current.occupational, ...partialConfig.occupational },
    operatingExpenses: {
      ...current.operatingExpenses,
      ...partialConfig.operatingExpenses
    },
    capex: { ...current.capex, ...partialConfig.capex },
    goals: { ...current.goals, ...partialConfig.goals }
  });

  await db.query(
    `UPDATE financial_config
     SET config = $1::jsonb, updated_at = CURRENT_TIMESTAMP
     WHERE id = 1`,
    [JSON.stringify(next)]
  );

  return next;
};

const sumValues = (values) =>
  values.reduce((sum, value) => sum + (Number(value) || 0), 0);

const calculateCmvReal = (cmv) => {
  const { initialStock, purchases, finalStock } = cmv;

  if (initialStock == null || purchases == null || finalStock == null) {
    return null;
  }

  return Number((initialStock + purchases - finalStock).toFixed(2));
};

const calculateSalesDeductions = (grossRevenue, trackedDeductions, revenueByPayment, salesTaxes) => {
  let taxDeductions = 0;
  const breakdown = [];

  const addRateLine = (label, base, ratePercent) => {
    if (ratePercent <= 0 || base <= 0) {
      return;
    }

    const amount = Number(((base * ratePercent) / 100).toFixed(2));
    taxDeductions += amount;
    breakdown.push({ label, amount, base, ratePercent });
  };

  addRateLine('Taxa máquina crédito', revenueByPayment.credito || 0, salesTaxes.creditRate);
  addRateLine('Taxa máquina débito', revenueByPayment.debito || 0, salesTaxes.debitRate);
  addRateLine('Taxa iFood', revenueByPayment.ifood || 0, salesTaxes.ifoodRate);
  addRateLine(
    'Taxa vendas sem pagamento informado',
    revenueByPayment.__unassigned__ || 0,
    salesTaxes.unassignedRate
  );

  for (const extra of salesTaxes.extras) {
    let base = grossRevenue;

    if (extra.base && extra.base !== 'all') {
      base = revenueByPayment[extra.base] || 0;
    }

    addRateLine(extra.label, base, extra.ratePercent);
  }

  return {
    total: Number((trackedDeductions + taxDeductions).toFixed(2)),
    trackedDeductions,
    taxDeductions: Number(taxDeductions.toFixed(2)),
    breakdown,
    revenueByPayment
  };
};

const calculateOccupationalCosts = (occupational) => {
  const extrasTotal = sumValues(occupational.extras.map((item) => item.value));
  const total = sumValues([occupational.energy, occupational.water, extrasTotal]);

  return total > 0 ? Number(total.toFixed(2)) : null;
};

const calculateOperatingExpenses = (operatingExpenses) => {
  const total = sumValues(operatingExpenses.items.map((item) => item.value));
  return total > 0 ? Number(total.toFixed(2)) : null;
};

const getEffectiveMarginMetrics = (netRevenue, { cmvReal, cmvFromSales, cmvTargetPercent }) => {
  if (netRevenue <= 0) {
    return { marginReais: null, marginPercent: null, source: null };
  }

  if (cmvFromSales > 0) {
    const marginReais = netRevenue - cmvFromSales;

    return {
      marginReais: Number(marginReais.toFixed(2)),
      marginPercent: Number(((marginReais / netRevenue) * 100).toFixed(1)),
      source: 'sales'
    };
  }

  if (cmvTargetPercent != null && cmvTargetPercent >= 0 && cmvTargetPercent <= 100) {
    const variableCost = netRevenue * (cmvTargetPercent / 100);
    const marginReais = netRevenue - variableCost;

    return {
      marginReais: Number(marginReais.toFixed(2)),
      marginPercent: Number((100 - cmvTargetPercent).toFixed(1)),
      source: 'target'
    };
  }

  if (cmvReal != null && cmvReal > 0 && cmvReal <= netRevenue) {
    const marginReais = netRevenue - cmvReal;

    return {
      marginReais: Number(marginReais.toFixed(2)),
      marginPercent: Number(((marginReais / netRevenue) * 100).toFixed(1)),
      source: 'inventory'
    };
  }

  return { marginReais: null, marginPercent: null, source: null };
};

const calculateBreakEven = ({ fixedCosts, marginPercent, daysInMonth }) => {
  if (fixedCosts <= 0) {
    return { monthly: 0, daily: 0 };
  }

  if (marginPercent == null || marginPercent <= 0) {
    return { monthly: null, daily: null };
  }

  const monthly = Number((fixedCosts / (marginPercent / 100)).toFixed(2));
  const daily = Number((monthly / daysInMonth).toFixed(2));

  return { monthly, daily };
};

module.exports = {
  DEFAULT_CONFIG,
  getConfig,
  saveConfig,
  mergeConfig,
  calculateCmvReal,
  calculateSalesDeductions,
  calculateOccupationalCosts,
  calculateOperatingExpenses,
  getEffectiveMarginMetrics,
  calculateBreakEven
};
