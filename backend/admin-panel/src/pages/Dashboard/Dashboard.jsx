import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import api from '../../api/axios.js';
import ConfigModal from '../../components/ConfigModal/ConfigModal.jsx';
import InfoTip from '../../components/InfoTip/InfoTip.jsx';
import MetricCard from '../../components/MetricCard/MetricCard.jsx';
import {
  STATUS_LABELS,
  statusBigThreeCombined,
  statusCmvPercent,
  statusLaborPercent,
  statusOccupationalPercent,
  statusProfit,
  statusRecurringRate,
  statusServiceTime,
  statusTargetProgress,
  statusTodayVsDailyAvg,
  statusWastePercent
} from '../../utils/metricStatus.js';
import { OWNER_TOOLTIPS } from './ownerTooltips.js';

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

const formatMinutes = (value) => {
  if (value == null || Number.isNaN(value)) {
    return '—';
  }

  return `${Number(value).toFixed(1)} min`;
};

const CHANNEL_LABELS = {
  local: 'Salão',
  delivery: 'Delivery',
  whatsapp: 'Retirada / WhatsApp'
};

function BlockTitle({ title, subtitle }) {
  return (
    <div className="fin-block-title">
      <h2>{title}</h2>
      {subtitle && <p>{subtitle}</p>}
    </div>
  );
}

function CostGauge({ label, value, targetLabel, tooltip, status }) {
  const display = value != null ? formatPercent(value) : '—';
  const statusLabel = STATUS_LABELS[status];

  return (
    <div className={`owner-cost-gauge fin-metric-${status || 'neutral'}`}>
      <div className="owner-cost-gauge-header">
        <span>{label}</span>
        <InfoTip text={tooltip} />
      </div>
      <strong className="owner-cost-gauge-value">{display}</strong>
      {targetLabel && <small>{targetLabel}</small>}
      {statusLabel && <span className={`fin-metric-status fin-metric-status-${status}`}>{statusLabel}</span>}
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingGoal, setSavingGoal] = useState(false);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [goalValue, setGoalValue] = useState('');

  const loadDashboard = useCallback(() => {
    setLoading(true);

    return api
      .get('/reports/dashboard')
      .then((response) => {
        setData(response.data);
        setError('');
      })
      .catch((err) => setError(err.response?.data?.error || 'Erro ao carregar painel do dono.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const openGoalModal = () => {
    setGoalValue(data?.survival?.revenueTarget != null ? String(data.survival.revenueTarget) : '');
    setShowGoalModal(true);
  };

  const saveGoal = () => {
    const monthlyRevenueTarget = goalValue === '' ? null : Number(goalValue);

    if (goalValue !== '' && (!Number.isFinite(monthlyRevenueTarget) || monthlyRevenueTarget < 0)) {
      setError('Informe um valor válido para a meta mensal.');
      return;
    }

    setSavingGoal(true);
    setError('');

    api
      .put('/reports/financial-config', { goals: { monthlyRevenueTarget } })
      .then(() => {
        setShowGoalModal(false);
        return loadDashboard();
      })
      .catch((err) => setError(err.response?.data?.error || 'Erro ao salvar meta do mês.'))
      .finally(() => setSavingGoal(false));
  };

  if (loading && !data) {
    return <p>Carregando painel do dono...</p>;
  }

  if (error && !data) {
    return <p className="error-text">{error}</p>;
  }

  if (!data?.survival) {
    if (data?.month) {
      return (
        <div className="financial-dashboard owner-dashboard">
          <h1 className="page-title">Dashboard Geral</h1>
          <p className="error-text">
            Backend desatualizado: pare o processo na porta 3000 e reinicie com{' '}
            <code>cd backend</code> e <code>npm start</code>, depois Ctrl+F5.
          </p>
        </div>
      );
    }

    return <p className="error-text">Não foi possível carregar o painel do dono.</p>;
  }

  const { survival, bigThree, operations, channelsAndClients } = data;
  const breakEvenProgress = Math.min(100, survival.breakEvenProgressPercent || 0);
  const dailyAvg =
    survival.daysElapsed > 0
      ? survival.grossRevenueAccumulated / survival.daysElapsed
      : null;

  const goalModal = createPortal(
    <ConfigModal
      title="Meta de faturamento do mês"
      open={showGoalModal}
      onClose={() => !savingGoal && setShowGoalModal(false)}
      onSave={saveGoal}
      saving={savingGoal}
    >
      <label className="fin-form-field">
        <span>Valor da meta (R$)</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={goalValue}
          onChange={(event) => setGoalValue(event.target.value)}
          placeholder="Ex: 50000"
        />
      </label>
      <p className="fin-data-note fin-data-note-muted">
        Deixe em branco para usar o ponto de equilíbrio como referência.
      </p>
    </ConfigModal>,
    document.body
  );

  return (
    <div className="financial-dashboard owner-dashboard">
      {goalModal}

      <header className="fin-page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Visão geral · Período: {data.period?.label}</p>
        </div>
      </header>

      {error && <p className="error-text">{error}</p>}

      <section className="panel fin-block">
        <BlockTitle
          title="Bloco 1 — Resumo Financeiro de Sobrevivência"
          subtitle="Pulso financeiro da empresa hoje e no acumulado do mês"
        />
        <div className="fin-metrics-grid">
          <MetricCard
            label="Faturamento bruto acumulado"
            value={formatCurrency(survival.grossRevenueAccumulated)}
            tooltip={OWNER_TOOLTIPS.grossRevenue}
            status={statusTargetProgress(
              survival.targetProgressPercent,
              survival.daysElapsed,
              survival.daysInMonth
            )}
          />
          <MetricCard
            label="Meta do mês"
            value={
              survival.targetProgressPercent != null
                ? `${formatPercent(survival.targetProgressPercent)} · ${formatCurrency(survival.revenueTarget)}`
                : formatCurrency(survival.revenueTarget)
            }
            tooltip={OWNER_TOOLTIPS.grossRevenue}
            status={statusTargetProgress(
              survival.targetProgressPercent,
              survival.daysElapsed,
              survival.daysInMonth
            )}
            onEdit={openGoalModal}
            editLabel="Editar meta"
          />
          <MetricCard
            label="Faturamento hoje"
            value={formatCurrency(survival.todayRevenue)}
            tooltip={OWNER_TOOLTIPS.todayRevenue}
            status={statusTodayVsDailyAvg(survival.todayRevenue, dailyAvg)}
          />
          <MetricCard
            label="Faturamento ontem"
            value={formatCurrency(survival.yesterdayRevenue)}
            tooltip={OWNER_TOOLTIPS.yesterdayRevenue}
            status={statusTodayVsDailyAvg(survival.yesterdayRevenue, dailyAvg)}
          />
          <MetricCard
            label="Lucro líquido estimado"
            value={formatCurrency(survival.estimatedNetProfit)}
            tooltip={OWNER_TOOLTIPS.estimatedNetProfit}
            status={statusProfit(survival.estimatedNetProfit)}
          />
        </div>

        <div className="owner-break-even">
          <div className="owner-break-even-header">
            <span>Ponto de equilíbrio (termômetro)</span>
            <InfoTip text={OWNER_TOOLTIPS.breakEven} />
          </div>
          <div className="owner-thermometer">
            <div
              className={`owner-thermometer-fill${survival.breakEvenReached ? ' reached' : ''}`}
              style={{ width: `${breakEvenProgress}%` }}
            />
          </div>
          <div className="owner-break-even-meta">
            <span>
              {survival.breakEvenProgressPercent != null
                ? `${formatPercent(survival.breakEvenProgressPercent)} do ponto de equilíbrio`
                : 'Configure custos no Dashboard Financeiro'}
            </span>
            {survival.breakEvenMonthly != null && (
              <span>Meta mínima: {formatCurrency(survival.breakEvenMonthly)}</span>
            )}
          </div>
          {survival.breakEvenProgressPercent != null && (
            <span
              className={`fin-metric-status fin-metric-status-${statusTargetProgress(
                survival.breakEvenProgressPercent,
                survival.daysElapsed,
                survival.daysInMonth
              )}`}
            >
              {STATUS_LABELS[
                statusTargetProgress(
                  survival.breakEvenProgressPercent,
                  survival.daysElapsed,
                  survival.daysInMonth
                )
              ]}
            </span>
          )}
        </div>
      </section>

      <section className="panel fin-block">
        <BlockTitle
          title="Bloco 2 — Os Três Grandes Custos"
          subtitle="CMV, mão de obra e estrutura — lado a lado em %"
        />
        <div className="owner-big-three">
          <CostGauge
            label="CMV %"
            value={bigThree.cmvPercent}
            targetLabel="Alvo: 28% a 35%"
            tooltip={OWNER_TOOLTIPS.cmv}
            status={statusCmvPercent(bigThree.cmvPercent)}
          />
          <CostGauge
            label="Labor Cost %"
            value={bigThree.laborPercent}
            targetLabel="Alvo: 20% a 26%"
            tooltip={OWNER_TOOLTIPS.labor}
            status={statusLaborPercent(bigThree.laborPercent)}
          />
          <CostGauge
            label="Custos ocupacionais %"
            value={bigThree.occupationalPercent}
            targetLabel="Alvo: máx. 10%"
            tooltip={OWNER_TOOLTIPS.occupational}
            status={statusOccupationalPercent(bigThree.occupationalPercent)}
          />
        </div>
        {bigThree.combinedPercent != null && (
          <p
            className={`owner-alert${statusBigThreeCombined(bigThree.combinedPercent) === 'danger' ? '' : ' owner-alert-muted'}`}
          >
            Soma dos três custos: {formatPercent(bigThree.combinedPercent)} —{' '}
            {STATUS_LABELS[statusBigThreeCombined(bigThree.combinedPercent)]}
            <InfoTip text={OWNER_TOOLTIPS.bigThreeAlert} />
          </p>
        )}
      </section>

      <section className="panel fin-block">
        <BlockTitle
          title="Bloco 3 — Operação e Eficiência de Fluxo"
          subtitle="Volume, ticket médio, velocidade e desperdício"
        />
        <div className="fin-metrics-grid">
          <MetricCard
            label="Comandas no salão"
            value={formatNumber(operations.localComandas)}
            tooltip={OWNER_TOOLTIPS.tableTurns}
            status={operations.localComandas >= 5 ? 'ok' : operations.localComandas >= 1 ? 'warn' : 'danger'}
          />
          <MetricCard
            label="Pedidos delivery"
            value={formatNumber(operations.deliveryOrders)}
            tooltip={OWNER_TOOLTIPS.tableTurns}
            status={operations.deliveryOrders >= 5 ? 'ok' : operations.deliveryOrders >= 1 ? 'warn' : 'neutral'}
          />
          <MetricCard
            label="Pedidos retirada / WhatsApp"
            value={formatNumber(operations.whatsappOrders)}
            tooltip={OWNER_TOOLTIPS.tableTurns}
            status={operations.whatsappOrders >= 5 ? 'ok' : operations.whatsappOrders >= 1 ? 'warn' : 'neutral'}
          />
          <MetricCard
            label="Ticket médio geral"
            value={formatCurrency(operations.avgTicketGeneral)}
            tooltip={OWNER_TOOLTIPS.avgTicket}
            status={operations.avgTicketGeneral >= 50 ? 'ok' : operations.avgTicketGeneral >= 35 ? 'warn' : 'danger'}
          />
          <MetricCard
            label="Tempo médio de atendimento"
            value={formatMinutes(operations.avgServiceTimeMinutes)}
            tooltip={OWNER_TOOLTIPS.serviceTime}
            status={statusServiceTime(operations.avgServiceTimeMinutes)}
          />
          <MetricCard
            label="Índice de desperdício"
            value={formatCurrency(operations.wasteIndex?.estimatedWasteValue)}
            tooltip={OWNER_TOOLTIPS.waste}
            status={statusWastePercent(
              operations.wasteIndex?.estimatedWasteValue,
              survival.grossRevenueAccumulated
            )}
          />
        </div>
      </section>

      <section className="panel fin-block">
        <BlockTitle
          title="Bloco 4 — Canais de Venda e Satisfação do Cliente"
          subtitle="Mix de vendas, avaliação e fidelidade"
        />
        <div className="fin-metrics-grid fin-metrics-grid-compact">
          <MetricCard
            label="Avaliação média"
            value={channelsAndClients.averageRating ?? '—'}
            tooltip={OWNER_TOOLTIPS.rating}
            status="neutral"
          />
          <MetricCard
            label="Clientes recorrentes"
            value={formatPercent(channelsAndClients.recurringCustomersRate)}
            tooltip={OWNER_TOOLTIPS.recurring}
            status={statusRecurringRate(channelsAndClients.recurringCustomersRate)}
          />
          <MetricCard
            label="Clientes únicos no mês"
            value={formatNumber(channelsAndClients.totalCustomers)}
            tooltip={OWNER_TOOLTIPS.recurring}
            status={channelsAndClients.totalCustomers >= 10 ? 'ok' : channelsAndClients.totalCustomers >= 3 ? 'warn' : 'neutral'}
          />
        </div>

        <div className="owner-channel-mix">
          <h3 className="fin-subsection-title">Mix de canais</h3>
          {channelsAndClients.channelMix?.length === 0 ? (
            <p className="fin-data-note">Nenhuma venda no período.</p>
          ) : (
            channelsAndClients.channelMix.map((item) => (
              <div key={item.channel} className="owner-channel-row">
                <div className="owner-channel-row-header">
                  <span>{CHANNEL_LABELS[item.channel] || item.channel}</span>
                  <strong>{formatPercent(item.sharePercent)}</strong>
                </div>
                <div className="owner-channel-bar-track">
                  <div
                    className={`owner-channel-bar owner-channel-${item.channel}`}
                    style={{ width: `${Math.max(item.sharePercent, 2)}%` }}
                  />
                </div>
                <small>
                  {formatCurrency(item.revenue)} · {formatNumber(item.orderCount)} pedidos
                </small>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
