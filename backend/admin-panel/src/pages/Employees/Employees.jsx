import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../api/axios.js';

const emptyHireForm = {
  name: '',
  role: '',
  salary: '',
  labor_charges: '',
  extra_costs: []
};

const newExtraId = () => `extra-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const PANEL_PERMISSION_OPTIONS = [
  { key: 'create_order', label: 'Anotar pedido' },
  { key: 'receive_payment', label: 'Receber pagamento' },
  { key: 'set_preparing', label: 'Alterar para preparando' },
  { key: 'set_out_for_delivery', label: 'Alterar para em entrega' }
];

const emptyPanelForm = {
  panel_access_enabled: false,
  username: '',
  password: '',
  permissions: {
    create_order: false,
    receive_payment: false,
    set_preparing: false,
    set_out_for_delivery: false
  }
};

const buildPanelForm = (employee) => ({
  panel_access_enabled: employee.panelAccessEnabled === true,
  username: employee.username || employee.name || '',
  password: '',
  permissions: {
    create_order: Boolean(employee.permissions?.create_order),
    receive_payment: Boolean(employee.permissions?.receive_payment),
    set_preparing: Boolean(employee.permissions?.set_preparing),
    set_out_for_delivery: Boolean(employee.permissions?.set_out_for_delivery)
  }
});

const getPanelSaveError = (err) => {
  if (!err.response) {
    return 'Não foi possível conectar ao servidor. Reinicie o backend (cd backend && npm start).';
  }

  if (err.response.status === 404) {
    return 'Rota não encontrada. Reinicie o backend com a versão atualizada (cd backend && npm start).';
  }

  const data = err.response.data;

  if (typeof data?.error === 'string') {
    return data.error;
  }

  return 'Erro ao salvar acesso ao painel.';
};

const formatCurrency = (value) => {
  if (value == null || Number.isNaN(value)) {
    return '—';
  }

  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const formatDate = (value) => {
  if (!value) {
    return '—';
  }

  const [year, month, day] = String(value).slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
};

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showHireModal, setShowHireModal] = useState(false);
  const [hireForm, setHireForm] = useState(emptyHireForm);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [panelForm, setPanelForm] = useState(emptyPanelForm);
  const [panelFormError, setPanelFormError] = useState('');
  const [panelSaving, setPanelSaving] = useState(false);

  const hireTotalCost = useMemo(() => {
    const salary = Number(hireForm.salary) || 0;
    const labor = Number(hireForm.labor_charges) || 0;
    const extras = hireForm.extra_costs.reduce(
      (sum, item) => sum + (Number(item.value) || 0),
      0
    );

    return salary + labor + extras;
  }, [hireForm]);

  const loadEmployees = useCallback(() => {
    setLoading(true);
    return api
      .get('/employees')
      .then((response) => {
        setEmployees(response.data.employees || []);
        setError('');
      })
      .catch((err) => setError(err.response?.data?.error || 'Erro ao carregar funcionários.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  const openHireModal = () => {
    setHireForm(emptyHireForm);
    setFormError('');
    setShowHireModal(true);
  };

  const closeHireModal = () => {
    if (!saving) {
      setShowHireModal(false);
      setHireForm(emptyHireForm);
      setFormError('');
    }
  };

  const handleHireChange = (event) => {
    const { name, value } = event.target;
    setHireForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleHireSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFormError('');

    try {
      await api.post('/employees', {
        name: hireForm.name.trim(),
        role: hireForm.role.trim(),
        salary: Number(hireForm.salary),
        labor_charges: Number(hireForm.labor_charges) || 0,
        extra_costs: hireForm.extra_costs.map((item) => ({
          id: item.id || newExtraId(),
          label: item.label || 'Outro custo',
          value: Number(item.value) || 0
        }))
      });

      closeHireModal();
      loadEmployees();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Erro ao contratar funcionário.');
    } finally {
      setSaving(false);
    }
  };

  const togglePresence = async (employee) => {
    setError('');

    try {
      await api.patch(`/employees/${employee.id}/attendance`, {
        is_present: !employee.isPresentToday
      });
      loadEmployees();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao atualizar presença.');
    }
  };

  const openDetails = async (employeeId) => {
    setSelectedEmployee(null);
    setDetailLoading(true);
    setError('');

    try {
      const { data } = await api.get(`/employees/${employeeId}`);
      setSelectedEmployee(data);
      setPanelForm(buildPanelForm(data));
      setPanelFormError('');
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao carregar detalhes.');
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetails = () => {
    setSelectedEmployee(null);
    setPanelForm(emptyPanelForm);
    setPanelFormError('');
  };

  const handlePanelPermissionChange = (permissionKey, checked) => {
    setPanelForm((prev) => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [permissionKey]: checked
      }
    }));
  };

  const handleSavePanelAccess = async (event) => {
    event.preventDefault();

    if (!selectedEmployee) {
      return;
    }

    setPanelSaving(true);
    setPanelFormError('');

    try {
      const loginUsername =
        panelForm.username.trim() || selectedEmployee.name.trim();

      const payload = {
        panel_access_enabled: panelForm.panel_access_enabled,
        username: loginUsername,
        permissions: panelForm.permissions
      };

      if (panelForm.password) {
        payload.password = panelForm.password;
      }

      const { data } = await api.patch(
        `/employees/${selectedEmployee.id}/panel-access`,
        payload
      );

      setSelectedEmployee(data);
      setPanelForm(buildPanelForm(data));
      loadEmployees();
    } catch (err) {
      setPanelFormError(getPanelSaveError(err));
    } finally {
      setPanelSaving(false);
    }
  };

  const handleTerminate = async (employee) => {
    if (
      !window.confirm(
        `Deseja demitir ${employee.name}? Essa ação remove o funcionário da lista ativa.`
      )
    ) {
      return;
    }

    setError('');

    try {
      await api.patch(`/employees/${employee.id}/terminate`);
      closeDetails();
      loadEmployees();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao demitir funcionário.');
    }
  };

  if (loading) {
    return <p>Carregando funcionários...</p>;
  }

  return (
    <div className="employees-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Funcionários</h1>
          <p className="page-subtitle">Controle de equipe, presença diária e custos</p>
        </div>
        <button type="button" className="btn-secondary" onClick={openHireModal}>
          + Contratar novo funcionário
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="panel employees-table-panel">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Função</th>
              <th>Presente hoje</th>
              <th>Faltas no mês</th>
              <th>Custo mensal</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 ? (
              <tr>
                <td colSpan={6}>Nenhum funcionário ativo. Clique em contratar para adicionar.</td>
              </tr>
            ) : (
              employees.map((employee) => (
                <tr key={employee.id}>
                  <td>
                    <strong>{employee.name}</strong>
                  </td>
                  <td>{employee.role}</td>
                  <td>
                    <button
                      type="button"
                      className={`presence-toggle ${employee.isPresentToday ? 'present' : 'absent'}`}
                      onClick={() => togglePresence(employee)}
                    >
                      {employee.isPresentToday ? 'Presente' : 'Ausente'}
                    </button>
                  </td>
                  <td>{employee.missedDaysThisMonth}</td>
                  <td>{formatCurrency(employee.monthlyCost)}</td>
                  <td className="actions-cell">
                    <button type="button" className="btn-link" onClick={() => openDetails(employee.id)}>
                      Detalhes
                    </button>
                    <button
                      type="button"
                      className="btn-link danger"
                      onClick={() => handleTerminate(employee)}
                    >
                      Demitir
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showHireModal && (
        <div className="modal-overlay" onClick={closeHireModal}>
          <div className="modal-card employees-hire-modal" onClick={(event) => event.stopPropagation()}>
            <h2>Contratar novo funcionário</h2>
            {formError && <p className="error-text">{formError}</p>}

            <form onSubmit={handleHireSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="name">Nome *</label>
                  <input
                    id="name"
                    name="name"
                    value={hireForm.name}
                    onChange={handleHireChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="role">Função *</label>
                  <input
                    id="role"
                    name="role"
                    value={hireForm.role}
                    onChange={handleHireChange}
                    placeholder="Garçom, cozinheiro..."
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="salary">Salário (R$) *</label>
                  <input
                    id="salary"
                    name="salary"
                    type="number"
                    min="0"
                    step="0.01"
                    value={hireForm.salary}
                    onChange={handleHireChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="labor_charges">Encargos / INSS / direitos (R$)</label>
                  <input
                    id="labor_charges"
                    name="labor_charges"
                    type="number"
                    min="0"
                    step="0.01"
                    value={hireForm.labor_charges}
                    onChange={handleHireChange}
                    placeholder="FGTS, férias, 13º, INSS..."
                  />
                </div>
              </div>

              {hireForm.extra_costs.map((item, index) => (
                <div key={item.id || index} className="employees-extra-row">
                  <div className="form-group">
                    <label>Descrição do custo</label>
                    <input
                      type="text"
                      value={item.label || ''}
                      onChange={(event) => {
                        const extraCosts = [...hireForm.extra_costs];
                        extraCosts[index] = { ...extraCosts[index], label: event.target.value };
                        setHireForm((prev) => ({ ...prev, extra_costs: extraCosts }));
                      }}
                    />
                  </div>
                  <div className="form-group">
                    <label>Valor (R$)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.value ?? ''}
                      onChange={(event) => {
                        const extraCosts = [...hireForm.extra_costs];
                        extraCosts[index] = { ...extraCosts[index], value: event.target.value };
                        setHireForm((prev) => ({ ...prev, extra_costs: extraCosts }));
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    className="fin-remove-btn"
                    onClick={() =>
                      setHireForm((prev) => ({
                        ...prev,
                        extra_costs: prev.extra_costs.filter((_, extraIndex) => extraIndex !== index)
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
                  setHireForm((prev) => ({
                    ...prev,
                    extra_costs: [
                      ...prev.extra_costs,
                      { id: newExtraId(), label: 'Vale transporte', value: '' }
                    ]
                  }))
                }
              >
                + Adicionar custo
              </button>

              <div className="employees-hire-total">
                <span>Custo mensal estimado</span>
                <strong>{formatCurrency(hireTotalCost)}</strong>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={closeHireModal} disabled={saving}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary inline" disabled={saving}>
                  {saving ? 'Salvando...' : 'Contratar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {(detailLoading || selectedEmployee) && (
        <div className="modal-overlay" onClick={closeDetails}>
          <div
            className="modal-card modal-card-wide employees-detail-modal"
            onClick={(event) => event.stopPropagation()}
          >
            {detailLoading ? (
              <p>Carregando detalhes...</p>
            ) : (
              selectedEmployee && (
                <>
                  <h2>{selectedEmployee.name}</h2>
                  <p className="employees-detail-role">{selectedEmployee.role}</p>

                  <div className="employees-detail-grid">
                    <div className="employees-detail-card">
                      <span>Dias presentes no mês</span>
                      <strong>{selectedEmployee.presentDaysThisMonth}</strong>
                    </div>
                    <div className="employees-detail-card">
                      <span>Dias faltados no mês</span>
                      <strong>{selectedEmployee.missedDaysThisMonth}</strong>
                    </div>
                    <div className="employees-detail-card">
                      <span>Dias esperados no mês</span>
                      <strong>{selectedEmployee.expectedDaysThisMonth}</strong>
                    </div>
                    <div className="employees-detail-card">
                      <span>Presente hoje</span>
                      <strong>{selectedEmployee.isPresentToday ? 'Sim' : 'Não'}</strong>
                    </div>
                  </div>

                  <div className="employees-cost-breakdown">
                    <h3>Custos mensais</h3>
                    <ul>
                      <li>
                        <span>Salário</span>
                        <strong>{formatCurrency(selectedEmployee.salary)}</strong>
                      </li>
                      <li>
                        <span>Encargos / INSS / direitos</span>
                        <strong>{formatCurrency(selectedEmployee.laborCharges)}</strong>
                      </li>
                      {selectedEmployee.extraCosts.map((item) => (
                        <li key={item.id}>
                          <span>{item.label}</span>
                          <strong>{formatCurrency(item.value)}</strong>
                        </li>
                      ))}
                      <li className="employees-cost-total">
                        <span>Total mensal</span>
                        <strong>{formatCurrency(selectedEmployee.monthlyCost)}</strong>
                      </li>
                    </ul>
                  </div>

                  {selectedEmployee.attendance.length > 0 && (
                    <div className="employees-attendance-list">
                      <h3>Registro do mês</h3>
                      <ul>
                        {selectedEmployee.attendance.map((item) => (
                          <li key={item.date}>
                            <span>{formatDate(item.date)}</span>
                            <strong className={item.isPresent ? 'present-text' : 'absent-text'}>
                              {item.isPresent ? 'Presente' : 'Falta'}
                            </strong>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <form className="employees-panel-access" onSubmit={handleSavePanelAccess}>
                    <h3>Acesso ao painel atendente</h3>
                    <p className="employees-panel-access-hint">
                      O login pode ser o nome da pessoa (ex.: Maria). Não precisa ser e-mail.
                    </p>

                    {panelFormError && <p className="error-text">{panelFormError}</p>}

                    <label className="employees-panel-toggle">
                      <input
                        type="checkbox"
                        checked={panelForm.panel_access_enabled}
                        onChange={(event) => {
                          const enabled = event.target.checked;
                          setPanelForm((prev) => ({
                            ...prev,
                            panel_access_enabled: enabled,
                            username:
                              enabled && !prev.username.trim()
                                ? selectedEmployee.name
                                : prev.username
                          }));
                        }}
                      />
                      Habilitar login no painel atendente
                    </label>

                    {panelForm.panel_access_enabled && (
                      <>
                        <div className="form-row">
                          <div className="form-group">
                            <label htmlFor="panelUsername">Login *</label>
                            <input
                              id="panelUsername"
                              type="text"
                              autoComplete="off"
                              value={panelForm.username}
                              onChange={(event) =>
                                setPanelForm((prev) => ({ ...prev, username: event.target.value }))
                              }
                              placeholder={selectedEmployee.name || 'Nome do funcionário'}
                            />
                          </div>
                          <div className="form-group">
                            <label htmlFor="panelPassword">
                              Senha {selectedEmployee.hasPassword ? '(deixe em branco para manter)' : '*'}
                            </label>
                            <input
                              id="panelPassword"
                              type="password"
                              autoComplete="new-password"
                              value={panelForm.password}
                              onChange={(event) =>
                                setPanelForm((prev) => ({ ...prev, password: event.target.value }))
                              }
                              placeholder={
                                selectedEmployee.hasPassword ? 'Nova senha (opcional)' : 'Mínimo 4 caracteres'
                              }
                              required={!selectedEmployee.hasPassword}
                            />
                          </div>
                        </div>

                        <fieldset className="employees-panel-permissions">
                          <legend>Permissões no painel</legend>
                          {PANEL_PERMISSION_OPTIONS.map((option) => (
                            <label key={option.key} className="employees-panel-permission">
                              <input
                                type="checkbox"
                                checked={panelForm.permissions[option.key]}
                                onChange={(event) =>
                                  handlePanelPermissionChange(option.key, event.target.checked)
                                }
                              />
                              {option.label}
                            </label>
                          ))}
                        </fieldset>
                      </>
                    )}

                    <div className="employees-panel-actions">
                      <button type="submit" className="btn-primary inline" disabled={panelSaving}>
                        {panelSaving ? 'Salvando...' : 'Salvar acesso ao painel'}
                      </button>
                    </div>
                  </form>

                  <div className="modal-actions">
                    <button
                      type="button"
                      className="btn-link danger"
                      onClick={() => handleTerminate(selectedEmployee)}
                    >
                      Demitir funcionário
                    </button>
                    <button type="button" className="btn-secondary" onClick={closeDetails}>
                      Fechar
                    </button>
                  </div>
                </>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
