import { useCallback, useEffect, useState } from 'react';
import api from '../../api/axios.js';
import MetricCard from '../../components/MetricCard/MetricCard.jsx';
import {
  statusAbsenteeism,
  statusLaborPercent,
  statusMissedDaysRatio,
  statusPrepTimeDish,
  statusPrepTimeOrder,
  statusTicketVsAverage,
  statusTurnover,
  statusVolumePositive
} from '../../utils/metricStatus.js';
import { EMPLOYEES_TOOLTIPS } from './employeesTooltips.js';

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

const ROLE_LABELS = {
  salon: 'Atendimento / salão',
  kitchen: 'Cozinha',
  kitchen_assistant: 'Auxiliar de cozinha',
  other: 'Outro'
};

function BlockTitle({ title, subtitle }) {
  return (
    <div className="fin-block-title">
      <h2>{title}</h2>
      {subtitle && <p>{subtitle}</p>}
    </div>
  );
}

export default function EmployeesDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');

  const loadDashboard = useCallback((employeeId) => {
    setLoading(true);

    const params = employeeId ? { employeeId } : undefined;

    return api
      .get('/reports/employees-dashboard', { params })
      .then((response) => {
        setData(response.data);
        setError('');

        if (response.data.selectedEmployee) {
          setSelectedEmployeeId(String(response.data.selectedEmployee.id));
        }
      })
      .catch((err) =>
        setError(err.response?.data?.error || 'Erro ao carregar dashboard de funcionários.')
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const handleEmployeeChange = (event) => {
    const employeeId = event.target.value;
    setSelectedEmployeeId(employeeId);
    loadDashboard(employeeId);
  };

  if (loading && !data) {
    return <p>Carregando dashboard de funcionários...</p>;
  }

  if (error && !data) {
    return <p className="error-text">{error}</p>;
  }

  if (!data) {
    return <p className="error-text">Não foi possível carregar o dashboard de funcionários.</p>;
  }

  const employees = Array.isArray(data.employees) ? data.employees : [];
  const kpis = data.kpis || {};
  const periodLabel = data.period?.label || '—';
  const employee = data.selectedEmployee;
  const storeAvgTicket =
    data.reference?.grossRevenue && data.kpis?.headcount
      ? data.reference.grossRevenue / Math.max(data.kpis.headcount, 1) / 10
      : 50;

  if (!Array.isArray(data.employees)) {
    return (
      <div className="financial-dashboard employees-dashboard">
        <header className="fin-page-header">
          <div>
            <h1 className="page-title">Dashboard Funcionários</h1>
          </div>
        </header>
        <p className="error-text">
          Backend desatualizado: reinicie o servidor (`cd backend`, depois `npm start`) e recarregue a página (Ctrl+F5).
        </p>
      </div>
    );
  }

  return (
    <div className="financial-dashboard employees-dashboard">
      <header className="fin-page-header">
        <div>
          <h1 className="page-title">Dashboard Funcionários</h1>
          <p className="page-subtitle">Período: {periodLabel}</p>
        </div>
      </header>

      {error && <p className="error-text">{error}</p>}

      <section className="panel fin-block">
        <BlockTitle
          title="Bloco 1 — Visão Geral da Operação"
          subtitle="KPIs da equipe com base nos funcionários cadastrados"
        />
        <div className="fin-metrics-grid">
          <MetricCard
            label="Headcount (funcionários ativos)"
            value={formatNumber(kpis.headcount)}
            tooltip={EMPLOYEES_TOOLTIPS.headcount}
            status={kpis.headcount >= 3 ? 'ok' : kpis.headcount >= 1 ? 'warn' : 'danger'}
          />
          <MetricCard
            label="Custo Total da Folha de Pagamento"
            value={formatCurrency(kpis.payrollTotal)}
            tooltip={EMPLOYEES_TOOLTIPS.payrollTotal}
            status="neutral"
          />
          <MetricCard
            label="Labor Cost (Custo de Mão de Obra %)"
            value={formatPercent(kpis.laborCostPercent)}
            tooltip={EMPLOYEES_TOOLTIPS.laborCost}
            status={statusLaborPercent(kpis.laborCostPercent)}
          />
          <MetricCard
            label="Taxa de Turnover (%)"
            value={formatPercent(kpis.turnoverRate)}
            tooltip={EMPLOYEES_TOOLTIPS.turnover}
            status={statusTurnover(kpis.turnoverRate)}
          />
          <MetricCard
            label="Taxa de Absenteísmo (%)"
            value={formatPercent(kpis.absenteeismRate)}
            tooltip={EMPLOYEES_TOOLTIPS.absenteeism}
            status={statusAbsenteeism(kpis.absenteeismRate)}
          />
        </div>
        {data.dataNotes?.headcount && (
          <p className="fin-data-note fin-data-note-muted">{data.dataNotes.headcount}</p>
        )}
      </section>

      <section className="panel fin-block">
        <BlockTitle
          title="Bloco 2 — Desempenho por Funcionário"
          subtitle="Selecione um colaborador para ver presença, custos e produtividade"
        />

        <div className="employees-dashboard-select">
          <label htmlFor="employee-select">Funcionário</label>
          <select
            id="employee-select"
            value={selectedEmployeeId}
            onChange={handleEmployeeChange}
            disabled={loading || employees.length === 0}
          >
            {employees.length === 0 ? (
              <option value="">Nenhum funcionário cadastrado</option>
            ) : (
              employees.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} — {item.role}
                </option>
              ))
            )}
          </select>
        </div>

        {!employee ? (
          <p className="fin-data-note">Cadastre funcionários na aba Funcionários para ver detalhes.</p>
        ) : (
          <>
            <div className="employees-dashboard-meta">
              <span className="status-badge active-badge">{ROLE_LABELS[employee.roleCategory] || employee.role}</span>
              <span className={`status-badge ${employee.isPresentToday ? 'active-badge' : 'inactive-badge'}`}>
                {employee.isPresentToday ? 'Presente hoje' : 'Ausente hoje'}
              </span>
            </div>

            <div className="fin-metrics-grid">
              <MetricCard
                label="Dias trabalhados no mês"
                value={formatNumber(employee.workedDaysThisMonth)}
                tooltip={EMPLOYEES_TOOLTIPS.scheduledVsWorked}
                status={
                  employee.expectedDaysThisMonth
                    ? employee.workedDaysThisMonth / employee.expectedDaysThisMonth >= 0.9
                      ? 'ok'
                      : employee.workedDaysThisMonth / employee.expectedDaysThisMonth >= 0.7
                        ? 'warn'
                        : 'danger'
                    : 'neutral'
                }
              />
              <MetricCard
                label="Dias faltados no mês"
                value={formatNumber(employee.missedDaysThisMonth)}
                tooltip={EMPLOYEES_TOOLTIPS.absenteeism}
                status={statusMissedDaysRatio(
                  employee.missedDaysThisMonth,
                  employee.expectedDaysThisMonth
                )}
              />
              <MetricCard
                label="Dias esperados no mês"
                value={formatNumber(employee.expectedDaysThisMonth)}
                tooltip={EMPLOYEES_TOOLTIPS.scheduledVsWorked}
                status="neutral"
              />
              <MetricCard
                label="Custo mensal do funcionário"
                value={formatCurrency(employee.monthlyCost)}
                tooltip={EMPLOYEES_TOOLTIPS.payrollTotal}
                status="neutral"
              />
              <MetricCard
                label="Salário base"
                value={formatCurrency(employee.salary)}
                tooltip={EMPLOYEES_TOOLTIPS.payrollTotal}
                status="neutral"
              />
              <MetricCard
                label="Encargos / INSS / direitos"
                value={formatCurrency(employee.laborCharges)}
                tooltip={EMPLOYEES_TOOLTIPS.payrollTotal}
                status="neutral"
              />
            </div>

            {employee.roleCategory === 'salon' && employee.performance && (
              <div className="fin-metrics-grid fin-metrics-grid-compact">
                <MetricCard
                  label="Pedidos anotados"
                  value={formatNumber(employee.performance.ordersCount)}
                  tooltip={EMPLOYEES_TOOLTIPS.salonOrders}
                  status={statusVolumePositive(employee.performance.ordersCount)}
                />
                <MetricCard
                  label="Faturamento gerado"
                  value={formatCurrency(employee.performance.totalRevenue)}
                  tooltip={EMPLOYEES_TOOLTIPS.salonRevenue}
                  status={statusVolumePositive(employee.performance.ordersCount)}
                />
                <MetricCard
                  label="Ticket médio por comanda"
                  value={formatCurrency(employee.performance.avgTicketPerComanda)}
                  tooltip={EMPLOYEES_TOOLTIPS.salonTicket}
                  status={statusTicketVsAverage(
                    employee.performance.avgTicketPerComanda,
                    storeAvgTicket
                  )}
                />
              </div>
            )}

            {employee.roleCategory === 'kitchen' && employee.performance && (
              <div className="fin-metrics-grid fin-metrics-grid-compact">
                <MetricCard
                  label="Pedidos feitos"
                  value={formatNumber(employee.performance.ordersCompleted)}
                  tooltip={EMPLOYEES_TOOLTIPS.kitchenOrders}
                  status={statusVolumePositive(employee.performance.ordersCompleted)}
                />
                <MetricCard
                  label="Pratos produzidos"
                  value={formatNumber(employee.performance.dishesCount)}
                  tooltip={EMPLOYEES_TOOLTIPS.kitchenDishes}
                  status={statusVolumePositive(employee.performance.dishesCount)}
                />
                <MetricCard
                  label="Ticket médio por comanda"
                  value={formatCurrency(employee.performance.avgTicketPerComanda)}
                  tooltip={EMPLOYEES_TOOLTIPS.kitchenTicket}
                  status={statusTicketVsAverage(
                    employee.performance.avgTicketPerComanda,
                    storeAvgTicket
                  )}
                />
                <MetricCard
                  label="Tempo médio por pedido"
                  value={formatMinutes(employee.performance.avgPrepTimeMinutes)}
                  tooltip={EMPLOYEES_TOOLTIPS.avgPrepTime}
                  status={statusPrepTimeOrder(employee.performance.avgPrepTimeMinutes)}
                />
                <MetricCard
                  label="Tempo médio por prato"
                  value={formatMinutes(employee.performance.avgTimePerDishMinutes)}
                  tooltip={EMPLOYEES_TOOLTIPS.avgTimePerDish}
                  status={statusPrepTimeDish(employee.performance.avgTimePerDishMinutes)}
                />
              </div>
            )}

            {employee.roleCategory === 'kitchen_assistant' && (
              <p className="fin-data-note fin-data-note-muted">
                Auxiliar de cozinha: métricas de pedidos não se aplicam a esta função.
              </p>
            )}

            {data.dataNotes?.performance && (
              <p className="fin-data-note">{data.dataNotes.performance}</p>
            )}

            {employee.extraCosts?.length > 0 && (
              <div className="employees-cost-breakdown">
                <h3 className="fin-subsection-title">Custos extras do funcionário</h3>
                <ul>
                  {employee.extraCosts.map((item) => (
                    <li key={item.id}>
                      <span>{item.label}</span>
                      <strong>{formatCurrency(item.value)}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
