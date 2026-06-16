import { useCallback, useEffect, useState } from 'react';
import api from '../../api/axios.js';
import ConfigModal from '../../components/ConfigModal/ConfigModal.jsx';
import InfoTip from '../../components/InfoTip/InfoTip.jsx';
import MetricCard from '../../components/MetricCard/MetricCard.jsx';
import {
  statusContributionMargin,
  statusCmvPercent,
  statusDeductionsPercent,
  statusOccupationalPercent,
  statusProfit
} from '../../utils/metricStatus.js';
import { FINANCIAL_TOOLTIPS } from './financialTooltips.js';

const formatCurrency = (value) => {
  if (value == null || Number.isNaN(value)) {
    return '—';
  }

  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const formatPercent = (value) => {
  if (value == null || Number.isNaN(value)) {
    return '—';
  }

  return `${Number(value).toFixed(1)}%`;
};

const formatNumber = (value) => {
  if (value == null || Number.isNaN(value)) {
    return '—';
  }

  return Number(value).toLocaleString('pt-BR');
};

const CHANNEL_LABELS = {
  local: 'No local',
  delivery: 'Entrega',
  whatsapp: 'WhatsApp'
};

const PAYMENT_BASE_OPTIONS = [
  { value: 'all', label: 'Todas as vendas' },
  { value: 'credito', label: 'Crédito' },
  { value: 'debito', label: 'Débito' },
  { value: 'pix', label: 'PIX' },
  { value: 'ifood', label: 'iFood' },
  { value: 'outros', label: 'Outros' }
];

const newExtraId = () => `extra-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

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

const getConfig = (data) => ({
  salesTaxes: { ...DEFAULT_CONFIG.salesTaxes, ...data?.config?.salesTaxes },
  cmv: { ...DEFAULT_CONFIG.cmv, ...data?.config?.cmv },
  occupational: { ...DEFAULT_CONFIG.occupational, ...data?.config?.occupational },
  operatingExpenses: { ...DEFAULT_CONFIG.operatingExpenses, ...data?.config?.operatingExpenses },
  capex: { ...DEFAULT_CONFIG.capex, ...data?.config?.capex },
  goals: { ...DEFAULT_CONFIG.goals, ...data?.config?.goals }
});

function BlockTitle({ title, subtitle }) {
  return (
    <div className="fin-block-title">
      <h2>{title}</h2>
      {subtitle && <p>{subtitle}</p>}
    </div>
  );
}

function FormField({ label, children }) {
  return (
    <label className="fin-form-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export default function FinancialDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeModal, setActiveModal] = useState(null);

  const [salesTaxesForm, setSalesTaxesForm] = useState({
    creditRate: '',
    debitRate: '',
    ifoodRate: '',
    unassignedRate: '',
    extras: []
  });
  const [cmvForm, setCmvForm] = useState({
    initialStock: '',
    purchases: '',
    finalStock: '',
    targetPercent: ''
  });
  const [occupationalForm, setOccupationalForm] = useState({ energy: '', water: '', extras: [] });
  const [capexForm, setCapexForm] = useState({ value: '' });
  const [operatingForm, setOperatingForm] = useState({ items: [] });

  const loadDashboard = useCallback(() => {
    setLoading(true);

    return Promise.all([api.get('/reports/financial-dashboard'), api.get('/health').catch(() => null)])
      .then(([dashboardResponse, healthResponse]) => {
        setData(dashboardResponse.data);
        setError('');

        const health = healthResponse?.data;

        if (health && !health.features?.financialConfig) {
          setError(
            'Backend desatualizado: pare o processo na porta 3000 e rode "npm start" dentro da pasta backend.'
          );
        } else if (dashboardResponse.data && !dashboardResponse.data.config) {
          setError(
            'Backend parcialmente desatualizado: reinicie com "cd backend && npm start" para habilitar salvar configurações.'
          );
        }
      })
      .catch((err) => setError(err.response?.data?.error || 'Erro ao carregar dashboard financeiro.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const openModal = (modal) => {
    const config = getConfig(data);

    if (modal === 'salesTaxes') {
      setSalesTaxesForm({
        creditRate: config.salesTaxes.creditRate ?? '',
        debitRate: config.salesTaxes.debitRate ?? '',
        ifoodRate: config.salesTaxes.ifoodRate ?? '',
        unassignedRate: config.salesTaxes.unassignedRate ?? '',
        extras: (config.salesTaxes.extras || []).map((item) => ({ ...item }))
      });
    }

    if (modal === 'cmv') {
      setCmvForm({
        initialStock: config.cmv.initialStock ?? '',
        purchases: config.cmv.purchases ?? '',
        finalStock: config.cmv.finalStock ?? '',
        targetPercent: config.cmv.targetPercent ?? ''
      });
    }

    if (modal === 'occupational') {
      setOccupationalForm({
        energy: config.occupational.energy ?? '',
        water: config.occupational.water ?? '',
        extras: (config.occupational.extras || []).map((item) => ({ ...item }))
      });
    }

    if (modal === 'capex') {
      setCapexForm({ value: config.capex.value ?? '' });
    }

    if (modal === 'operating') {
      const items = (config.operatingExpenses.items || []).map((item) => ({ ...item }));
      setOperatingForm({
        items: items.length > 0 ? items : [{ id: newExtraId(), label: '', value: '' }]
      });
    }

    setActiveModal(modal);
  };

  const closeModal = () => {
    if (!saving) {
      setActiveModal(null);
    }
  };

  const saveConfig = async (payload) => {
    setSaving(true);
    setError('');

    try {
      const response = await api.put('/reports/financial-config', payload);
      setData(response.data.report);
      setActiveModal(null);
    } catch (err) {
      const status = err.response?.status;
      const backendMessage = err.response?.data?.error;
      let message = backendMessage || 'Erro ao salvar configuração.';

      if (status === 404) {
        message =
          'Rota não encontrada. Verifique se o backend foi reiniciado em backend/ com node server.js. ' +
          'Se usa VITE_API_URL, prefira /api (Vite) ou http://localhost:3000 (direto, sem /api no final).';
      } else if (status === 401) {
        message = 'Sessão expirada. Faça login novamente.';
      } else if (!err.response) {
        message = 'Não foi possível conectar ao backend. Confirme se node server.js está rodando na porta 3000.';
      }

      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSalesTaxes = () => {
    saveConfig({
      salesTaxes: {
        creditRate: Number(salesTaxesForm.creditRate) || 0,
        debitRate: Number(salesTaxesForm.debitRate) || 0,
        ifoodRate: Number(salesTaxesForm.ifoodRate) || 0,
        unassignedRate: Number(salesTaxesForm.unassignedRate) || 0,
        extras: salesTaxesForm.extras.map((item) => ({
          id: item.id || newExtraId(),
          label: item.label || 'Outro',
          ratePercent: Number(item.ratePercent) || 0,
          base: item.base || 'all'
        }))
      }
    });
  };

  const handleSaveCmv = () => {
    saveConfig({
      cmv: {
        initialStock: cmvForm.initialStock === '' ? null : Number(cmvForm.initialStock),
        purchases: cmvForm.purchases === '' ? null : Number(cmvForm.purchases),
        finalStock: cmvForm.finalStock === '' ? null : Number(cmvForm.finalStock),
        targetPercent: cmvForm.targetPercent === '' ? null : Number(cmvForm.targetPercent)
      }
    });
  };

  const handleSaveOccupational = () => {
    saveConfig({
      occupational: {
        energy: occupationalForm.energy === '' ? null : Number(occupationalForm.energy),
        water: occupationalForm.water === '' ? null : Number(occupationalForm.water),
        extras: occupationalForm.extras.map((item) => ({
          id: item.id || newExtraId(),
          label: item.label || 'Outro',
          value: Number(item.value) || 0
        }))
      }
    });
  };

  const handleSaveCapex = () => {
    saveConfig({
      capex: {
        value: capexForm.value === '' ? null : Number(capexForm.value)
      }
    });
  };

  const handleSaveOperating = () => {
    saveConfig({
      operatingExpenses: {
        items: operatingForm.items.map((item) => ({
          id: item.id || newExtraId(),
          label: item.label || 'Despesa',
          value: Number(item.value) || 0
        }))
      }
    });
  };

  if (loading) {
    return <p>Carregando dashboard financeiro...</p>;
  }

  if (error && !data) {
    return <p className="error-text">{error}</p>;
  }

  if (!data) {
    return <p className="error-text">Não foi possível carregar o dashboard financeiro.</p>;
  }

  const dailyComparison = data.margins?.dailyComparison || [];
  const maxDailyValue = Math.max(
    ...dailyComparison.map((day) => Math.max(day.revenue, day.cost || 0)),
    1
  );
  const hasDailyCost = dailyComparison.some((day) => day.cost != null && day.cost > 0);

  return (
    <div className="financial-dashboard">
      <header className="fin-page-header">
        <div>
          <h1 className="page-title">Dashboard Financeiro</h1>
          <p className="page-subtitle">
            Período: {data.period.label} · {data.period.daysElapsed} dias decorridos
          </p>
        </div>
      </header>

      {error && <p className="error-text fin-inline-error">{error}</p>}

      <section className="panel fin-block">
        <BlockTitle
          title="Bloco 1 — Visão Geral"
          subtitle="Indicadores de performance (KPIs) — volume de vendas, canais e comportamento do cliente"
        />
        <div className="fin-metrics-grid">
          <MetricCard
            label="Faturamento Bruto"
            value={formatCurrency(data.kpis.grossRevenue)}
            tooltip={FINANCIAL_TOOLTIPS.grossRevenue}
            status="ok"
          />
          <MetricCard
            label="Deduções de Vendas"
            value={formatCurrency(data.kpis.salesDeductions)}
            tooltip={FINANCIAL_TOOLTIPS.salesDeductions}
            status={statusDeductionsPercent(data.kpis.salesDeductions, data.kpis.grossRevenue)}
            onEdit={() => openModal('salesTaxes')}
          />
          <MetricCard
            label="Faturamento Líquido"
            value={formatCurrency(data.kpis.netRevenue)}
            tooltip={FINANCIAL_TOOLTIPS.netRevenue}
            status={data.kpis.netRevenue > 0 ? 'ok' : 'danger'}
          />
          <MetricCard
            label="Volume de Pedidos"
            value={formatNumber(data.kpis.orderVolume)}
            tooltip={FINANCIAL_TOOLTIPS.orderVolume}
            status={data.kpis.orderVolume >= 10 ? 'ok' : data.kpis.orderVolume >= 3 ? 'warn' : 'danger'}
          />
          <MetricCard
            label="Faturamento Diário Médio"
            value={formatCurrency(data.kpis.avgDailyRevenue)}
            tooltip={FINANCIAL_TOOLTIPS.avgDailyRevenue}
            status={data.kpis.avgDailyRevenue >= 500 ? 'ok' : data.kpis.avgDailyRevenue >= 200 ? 'warn' : 'danger'}
          />
          <MetricCard
            label="Ticket Médio por Pedido"
            value={formatCurrency(data.kpis.avgTicketPerOrder)}
            tooltip={FINANCIAL_TOOLTIPS.avgTicketPerOrder}
            status={data.kpis.avgTicketPerOrder >= 50 ? 'ok' : data.kpis.avgTicketPerOrder >= 35 ? 'warn' : 'danger'}
          />
          <MetricCard
            label="Ticket Médio por Comanda"
            value={formatCurrency(data.kpis.avgTicketPerComanda)}
            tooltip={FINANCIAL_TOOLTIPS.avgTicketPerComanda}
            status={data.kpis.avgTicketPerComanda >= 50 ? 'ok' : data.kpis.avgTicketPerComanda >= 35 ? 'warn' : 'danger'}
          />
        </div>

        {data.salesByChannel.length > 0 && (
          <div className="fin-channel-breakdown">
            <h3 className="fin-subsection-title">Vendas por canal</h3>
            <div className="fin-channel-grid">
              {data.salesByChannel.map((channel) => (
                <div key={channel.channel} className="fin-channel-card">
                  <span>{CHANNEL_LABELS[channel.channel] || channel.channel}</span>
                  <strong>{formatCurrency(channel.revenue)}</strong>
                  <small>{channel.orderCount} pedidos</small>
                </div>
              ))}
            </div>
          </div>
        )}

        {data.dataNotes?.salesDeductions && (
          <p className="fin-data-note">{data.dataNotes.salesDeductions}</p>
        )}

        {data.kpis.salesDeductionsBreakdown?.breakdown?.length > 0 && (
          <div className="fin-deduction-breakdown">
            <h3 className="fin-subsection-title">Detalhamento das deduções</h3>
            <ul>
              {data.kpis.salesDeductionsBreakdown.breakdown.map((item) => (
                <li key={item.label}>
                  <span>{item.label}</span>
                  <span>
                    {formatCurrency(item.amount)}
                    {item.ratePercent != null && (
                      <small>
                        {' '}
                        ({item.ratePercent}% sobre {formatCurrency(item.base)})
                      </small>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            {data.kpis.salesDeductionsBreakdown.trackedDeductions > 0 && (
              <p className="fin-deduction-extra">
                Descontos/cashback do sistema:{' '}
                {formatCurrency(data.kpis.salesDeductionsBreakdown.trackedDeductions)}
              </p>
            )}
          </div>
        )}
      </section>

      <section className="panel fin-block">
        <BlockTitle
          title="Bloco 2 — Custos e Despesas"
          subtitle="Saídas de caixa — controle de desperdícios e excessos"
        />
        <div className="fin-metrics-grid">
          <MetricCard
            label="CMV Real"
            value={formatCurrency(data.costs.cmvReal)}
            tooltip={FINANCIAL_TOOLTIPS.cmvReal}
            status={statusCmvPercent(data.costs.cmvPercent)}
            onEdit={() => openModal('cmv')}
          />
          <MetricCard
            label="CMV em %"
            value={formatPercent(data.costs.cmvPercent)}
            tooltip={FINANCIAL_TOOLTIPS.cmvPercent}
            status={statusCmvPercent(data.costs.cmvPercent)}
          />
          <MetricCard
            label="Custos Ocupacionais (Fixos)"
            value={formatCurrency(data.costs.occupationalCosts)}
            tooltip={FINANCIAL_TOOLTIPS.occupationalCosts}
            status={statusOccupationalPercent(
              data.kpis.grossRevenue > 0 && data.costs.occupationalCosts
                ? (data.costs.occupationalCosts / data.kpis.grossRevenue) * 100
                : null
            )}
            onEdit={() => openModal('occupational')}
          />
          <MetricCard
            label="Despesas Operacionais (Variáveis)"
            value={formatCurrency(data.costs.operatingExpenses)}
            tooltip={FINANCIAL_TOOLTIPS.operatingExpenses}
            status={
              data.costs.operatingExpenses != null && data.kpis.grossRevenue > 0
                ? (data.costs.operatingExpenses / data.kpis.grossRevenue) * 100 <= 15
                  ? 'ok'
                  : (data.costs.operatingExpenses / data.kpis.grossRevenue) * 100 <= 25
                    ? 'warn'
                    : 'danger'
                : 'neutral'
            }
            onEdit={() => openModal('operating')}
          />
          <MetricCard
            label="Investimentos (Capex)"
            value={formatCurrency(data.costs.capex)}
            tooltip={FINANCIAL_TOOLTIPS.capex}
            status="neutral"
            onEdit={() => openModal('capex')}
          />
        </div>
        {data.dataNotes?.pendingCosts && (
          <p className="fin-data-note">{data.dataNotes.pendingCosts}</p>
        )}
      </section>

      <section className="panel fin-block">
        <BlockTitle
          title="Bloco 3 — Margens e Lucratividade"
          subtitle="Saúde financeira da operação"
        />
        <div className="fin-metrics-grid fin-metrics-grid-compact">
          <MetricCard
            label="Margem de Contribuição (R$)"
            value={formatCurrency(data.margins.contributionMargin)}
            tooltip={FINANCIAL_TOOLTIPS.contributionMargin}
            status={statusProfit(data.margins.contributionMargin)}
          />
          <MetricCard
            label="Margem de Contribuição (%)"
            value={formatPercent(data.margins.contributionMarginPercent)}
            tooltip={FINANCIAL_TOOLTIPS.contributionMarginPercent}
            status={statusContributionMargin(data.margins.contributionMarginPercent)}
          />
          <MetricCard
            label="Ponto de Equilíbrio (mensal)"
            value={formatCurrency(data.margins.breakEven.monthly)}
            tooltip={FINANCIAL_TOOLTIPS.breakEven}
            status={data.margins.breakEven.monthly != null ? 'neutral' : 'warn'}
          />
          <MetricCard
            label="Ponto de Equilíbrio (diário)"
            value={formatCurrency(data.margins.breakEven.daily)}
            tooltip={FINANCIAL_TOOLTIPS.breakEven}
            status={data.margins.breakEven.daily != null ? 'neutral' : 'warn'}
          />
          <MetricCard
            label="Lucro Líquido Operacional (EBITDA)"
            value={formatCurrency(data.margins.operationalProfit)}
            tooltip={FINANCIAL_TOOLTIPS.ebitda}
            status={statusProfit(data.margins.operationalProfit)}
          />
        </div>

        {data.dataNotes?.breakEven && (
          <p className="fin-data-note">{data.dataNotes.breakEven}</p>
        )}

        <div className="fin-chart-section">
          <div className="fin-subsection-header">
            <h3 className="fin-subsection-title">Faturamento diário vs. Custo diário</h3>
            <InfoTip text={FINANCIAL_TOOLTIPS.dailyRevenueVsCost} />
          </div>
          <div className="fin-daily-chart">
            {dailyComparison.map((day) => (
              <div key={day.dayName} className="fin-daily-bar-group">
                <div className="fin-daily-bars">
                  <div
                    className="fin-bar fin-bar-revenue"
                    style={{ height: `${Math.max(8, (day.revenue / maxDailyValue) * 100)}%` }}
                    title={`Faturamento: ${formatCurrency(day.revenue)}`}
                  />
                  <div
                    className={`fin-bar fin-bar-cost${day.cost ? '' : ' fin-bar-empty'}`}
                    style={{
                      height: day.cost
                        ? `${Math.max(8, (day.cost / maxDailyValue) * 100)}%`
                        : undefined
                    }}
                    title={
                      day.cost
                        ? `Custo diário: ${formatCurrency(day.cost)}`
                        : 'Custo diário: configure custos fixos e variáveis'
                    }
                  />
                </div>
                <span className="fin-daily-label">{day.dayName.slice(0, 3)}</span>
                <small className="fin-daily-value">{formatCurrency(day.revenue)}</small>
              </div>
            ))}
          </div>
          <p className="fin-chart-legend">
            <span className="fin-legend-item">
              <i className="fin-legend-dot fin-legend-revenue" /> Faturamento
            </span>
            <span className="fin-legend-item">
              <i className="fin-legend-dot fin-legend-cost" /> Custo diário
              {!hasDailyCost && ' (configure custos)'}
            </span>
          </p>
        </div>
      </section>

      <section className="panel fin-block">
        <BlockTitle
          title="Bloco 4 — Engenharia de Cardápio"
          subtitle="Análise de produtos — volume, giro e rentabilidade"
        />

        <div className="fin-table-section">
          <div className="fin-subsection-header">
            <h3 className="fin-subsection-title">Tabela 1 — Produtos mais vendidos</h3>
            <InfoTip text={FINANCIAL_TOOLTIPS.topProductsVolume} />
          </div>
          <div className="fin-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Qtd. vendida</th>
                  <th>Faturamento total</th>
                  <th>Custo/un.</th>
                  <th>Custo total</th>
                  <th>Lucro/un.</th>
                  <th>Lucro total</th>
                </tr>
              </thead>
              <tbody>
                {data.menuEngineering.topByVolume.length === 0 ? (
                  <tr>
                    <td colSpan={7}>Nenhuma venda no período.</td>
                  </tr>
                ) : (
                  data.menuEngineering.topByVolume.map((product) => (
                    <tr key={product.productId}>
                      <td>{product.productName}</td>
                      <td>{product.totalQuantity}</td>
                      <td>{formatCurrency(product.totalRevenue)}</td>
                      <td>{formatCurrency(product.unitCost)}</td>
                      <td>{formatCurrency(product.totalCost)}</td>
                      <td>{formatCurrency(product.profitPerUnit)}</td>
                      <td>{formatCurrency(product.totalProfit)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="fin-table-section">
          <div className="fin-subsection-header">
            <h3 className="fin-subsection-title">Tabela 2 — Pratos mais lucrativos</h3>
            <InfoTip text={FINANCIAL_TOOLTIPS.topProductsProfit} />
          </div>
          <div className="fin-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Custo/un.</th>
                  <th>Preço de venda</th>
                  <th>Lucro/un.</th>
                  <th>Markup / Margem %</th>
                  <th>Faturamento total</th>
                  <th>Custo total</th>
                  <th>Lucro total</th>
                </tr>
              </thead>
              <tbody>
                {data.menuEngineering.topByProfitability.length === 0 ? (
                  <tr>
                    <td colSpan={8}>Nenhuma venda no período.</td>
                  </tr>
                ) : (
                  data.menuEngineering.topByProfitability.map((product) => (
                    <tr key={`profit-${product.productId}`}>
                      <td>{product.productName}</td>
                      <td>{formatCurrency(product.unitCost)}</td>
                      <td>{formatCurrency(product.avgSalePrice)}</td>
                      <td>{formatCurrency(product.profitPerUnit)}</td>
                      <td>{formatPercent(product.markupPercent)}</td>
                      <td>{formatCurrency(product.totalRevenue)}</td>
                      <td>{formatCurrency(product.totalCost)}</td>
                      <td>{formatCurrency(product.totalProfit)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <ConfigModal
        title="Deduções de Vendas"
        open={activeModal === 'salesTaxes'}
        onClose={closeModal}
        onSave={handleSaveSalesTaxes}
        saving={saving}
      >
        <p className="fin-modal-hint">
          As taxas são aplicadas sobre as vendas do mês de acordo com a forma de pagamento confirmada
          no pedido. Se muitos pedidos ainda não têm pagamento informado, use o campo abaixo ou confirme
          no painel atendente.
        </p>
        <FormField label="Taxa máquina de crédito (%)">
          <input
            type="number"
            min="0"
            step="0.01"
            value={salesTaxesForm.creditRate}
            onChange={(event) =>
              setSalesTaxesForm((prev) => ({ ...prev, creditRate: event.target.value }))
            }
          />
        </FormField>
        <FormField label="Taxa máquina de débito (%)">
          <input
            type="number"
            min="0"
            step="0.01"
            value={salesTaxesForm.debitRate}
            onChange={(event) =>
              setSalesTaxesForm((prev) => ({ ...prev, debitRate: event.target.value }))
            }
          />
        </FormField>
        <FormField label="Taxa iFood (%)">
          <input
            type="number"
            min="0"
            step="0.01"
            value={salesTaxesForm.ifoodRate}
            onChange={(event) =>
              setSalesTaxesForm((prev) => ({ ...prev, ifoodRate: event.target.value }))
            }
          />
        </FormField>
        <FormField label="Taxa vendas sem pagamento informado (%)">
          <input
            type="number"
            min="0"
            step="0.01"
            value={salesTaxesForm.unassignedRate}
            onChange={(event) =>
              setSalesTaxesForm((prev) => ({ ...prev, unassignedRate: event.target.value }))
            }
          />
        </FormField>

        {salesTaxesForm.extras.map((item, index) => (
          <div key={item.id || index} className="fin-extra-row">
            <FormField label="Nome da taxa">
              <input
                type="text"
                value={item.label || ''}
                onChange={(event) => {
                  const extras = [...salesTaxesForm.extras];
                  extras[index] = { ...extras[index], label: event.target.value };
                  setSalesTaxesForm((prev) => ({ ...prev, extras }));
                }}
              />
            </FormField>
            <FormField label="Taxa (%)">
              <input
                type="number"
                min="0"
                step="0.01"
                value={item.ratePercent ?? ''}
                onChange={(event) => {
                  const extras = [...salesTaxesForm.extras];
                  extras[index] = { ...extras[index], ratePercent: event.target.value };
                  setSalesTaxesForm((prev) => ({ ...prev, extras }));
                }}
              />
            </FormField>
            <FormField label="Base de cálculo">
              <select
                value={item.base || 'all'}
                onChange={(event) => {
                  const extras = [...salesTaxesForm.extras];
                  extras[index] = { ...extras[index], base: event.target.value };
                  setSalesTaxesForm((prev) => ({ ...prev, extras }));
                }}
              >
                {PAYMENT_BASE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </FormField>
            <button
              type="button"
              className="fin-remove-btn"
              onClick={() =>
                setSalesTaxesForm((prev) => ({
                  ...prev,
                  extras: prev.extras.filter((_, extraIndex) => extraIndex !== index)
                }))
              }
            >
              Remover
            </button>
          </div>
        ))}

        <button
          type="button"
          className="fin-add-btn"
          onClick={() =>
            setSalesTaxesForm((prev) => ({
              ...prev,
              extras: [
                ...prev.extras,
                { id: newExtraId(), label: 'Outra taxa', ratePercent: '', base: 'all' }
              ]
            }))
          }
        >
          + Adicionar taxa
        </button>
      </ConfigModal>

      <ConfigModal
        title="CMV Real"
        open={activeModal === 'cmv'}
        onClose={closeModal}
        onSave={handleSaveCmv}
        saving={saving}
      >
        <p className="fin-modal-hint">CMV = Estoque inicial + Compras − Estoque final</p>
        <FormField label="Estoque inicial (R$)">
          <input
            type="number"
            min="0"
            step="0.01"
            value={cmvForm.initialStock}
            onChange={(event) =>
              setCmvForm((prev) => ({ ...prev, initialStock: event.target.value }))
            }
          />
        </FormField>
        <FormField label="Compras do período (R$)">
          <input
            type="number"
            min="0"
            step="0.01"
            value={cmvForm.purchases}
            onChange={(event) => setCmvForm((prev) => ({ ...prev, purchases: event.target.value }))}
          />
        </FormField>
        <FormField label="Estoque final (R$)">
          <input
            type="number"
            min="0"
            step="0.01"
            value={cmvForm.finalStock}
            onChange={(event) => setCmvForm((prev) => ({ ...prev, finalStock: event.target.value }))}
          />
        </FormField>
        <FormField label="CMV % estimado (sobre faturamento líquido)">
          <input
            type="number"
            min="0"
            max="100"
            step="0.1"
            value={cmvForm.targetPercent}
            onChange={(event) =>
              setCmvForm((prev) => ({ ...prev, targetPercent: event.target.value }))
            }
            placeholder="Ex.: 35 — usado na margem e ponto de equilíbrio"
          />
        </FormField>
      </ConfigModal>

      <ConfigModal
        title="Custos Ocupacionais"
        open={activeModal === 'occupational'}
        onClose={closeModal}
        onSave={handleSaveOccupational}
        saving={saving}
      >
        <FormField label="Energia (R$)">
          <input
            type="number"
            min="0"
            step="0.01"
            value={occupationalForm.energy}
            onChange={(event) =>
              setOccupationalForm((prev) => ({ ...prev, energy: event.target.value }))
            }
          />
        </FormField>
        <FormField label="Água (R$)">
          <input
            type="number"
            min="0"
            step="0.01"
            value={occupationalForm.water}
            onChange={(event) =>
              setOccupationalForm((prev) => ({ ...prev, water: event.target.value }))
            }
          />
        </FormField>

        {occupationalForm.extras.map((item, index) => (
          <div key={item.id || index} className="fin-extra-row">
            <FormField label="Descrição">
              <input
                type="text"
                value={item.label || ''}
                onChange={(event) => {
                  const extras = [...occupationalForm.extras];
                  extras[index] = { ...extras[index], label: event.target.value };
                  setOccupationalForm((prev) => ({ ...prev, extras }));
                }}
              />
            </FormField>
            <FormField label="Valor (R$)">
              <input
                type="number"
                min="0"
                step="0.01"
                value={item.value ?? ''}
                onChange={(event) => {
                  const extras = [...occupationalForm.extras];
                  extras[index] = { ...extras[index], value: event.target.value };
                  setOccupationalForm((prev) => ({ ...prev, extras }));
                }}
              />
            </FormField>
            <button
              type="button"
              className="fin-remove-btn"
              onClick={() =>
                setOccupationalForm((prev) => ({
                  ...prev,
                  extras: prev.extras.filter((_, extraIndex) => extraIndex !== index)
                }))
              }
            >
              Remover
            </button>
          </div>
        ))}

        <button
          type="button"
          className="fin-add-btn"
          onClick={() =>
            setOccupationalForm((prev) => ({
              ...prev,
              extras: [...prev.extras, { id: newExtraId(), label: 'Outro custo', value: '' }]
            }))
          }
        >
          + Adicionar custo
        </button>
      </ConfigModal>

      <ConfigModal
        title="Investimentos (Capex)"
        open={activeModal === 'capex'}
        onClose={closeModal}
        onSave={handleSaveCapex}
        saving={saving}
      >
        <FormField label="Valor do investimento no período (R$)">
          <input
            type="number"
            min="0"
            step="0.01"
            value={capexForm.value}
            onChange={(event) => setCapexForm({ value: event.target.value })}
          />
        </FormField>
      </ConfigModal>

      <ConfigModal
        title="Despesas Operacionais"
        open={activeModal === 'operating'}
        onClose={closeModal}
        onSave={handleSaveOperating}
        saving={saving}
      >
        {operatingForm.items.length === 0 && (
          <p className="fin-modal-hint">Adicione despesas variáveis do mês (embalagens, limpeza, etc.).</p>
        )}

        {operatingForm.items.map((item, index) => (
          <div key={item.id || index} className="fin-extra-row">
            {operatingForm.items.length > 1 && (
              <FormField label="Descrição (opcional)">
                <input
                  type="text"
                  value={item.label || ''}
                  onChange={(event) => {
                    const items = [...operatingForm.items];
                    items[index] = { ...items[index], label: event.target.value };
                    setOperatingForm((prev) => ({ ...prev, items }));
                  }}
                />
              </FormField>
            )}
            <FormField label="Valor (R$)">
              <input
                type="number"
                min="0"
                step="0.01"
                value={item.value ?? ''}
                onChange={(event) => {
                  const items = [...operatingForm.items];
                  items[index] = { ...items[index], value: event.target.value };
                  setOperatingForm((prev) => ({ ...prev, items }));
                }}
              />
            </FormField>
            <button
              type="button"
              className="fin-remove-btn"
              onClick={() =>
                setOperatingForm((prev) => ({
                  ...prev,
                  items: prev.items.filter((_, itemIndex) => itemIndex !== index)
                }))
              }
            >
              Remover
            </button>
          </div>
        ))}

        <button
          type="button"
          className="fin-add-btn"
          onClick={() =>
            setOperatingForm((prev) => ({
              ...prev,
              items: [...prev.items, { id: newExtraId(), label: 'Despesa', value: '' }]
            }))
          }
        >
          + Adicionar despesa
        </button>
      </ConfigModal>
    </div>
  );
}
