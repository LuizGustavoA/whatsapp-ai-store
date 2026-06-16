const employeeService = require('../services/employeeService');
const employeePanelService = require('../services/employeePanelService');

const listEmployees = async (req, res, next) => {
  try {
    const employees = await employeeService.listEmployees();
    return res.json({ employees });
  } catch (err) {
    return next(err);
  }
};

const getEmployee = async (req, res, next) => {
  try {
    const employee = await employeeService.getEmployeeDetails(req.params.id);

    if (!employee) {
      return res.status(404).json({ error: 'Funcionário não encontrado.' });
    }

    return res.json(employee);
  } catch (err) {
    return next(err);
  }
};

const hireEmployee = async (req, res, next) => {
  try {
    const employee = await employeeService.hireEmployee({
      name: req.body.name,
      role: req.body.role,
      salary: req.body.salary,
      laborCharges: req.body.labor_charges,
      extraCosts: req.body.extra_costs
    });

    return res.status(201).json(employee);
  } catch (err) {
    err.status = 400;
    return next(err);
  }
};

const updateAttendance = async (req, res, next) => {
  try {
    const employee = await employeeService.setAttendance(req.params.id, {
      date: req.body.date,
      isPresent: req.body.is_present
    });

    return res.json(employee);
  } catch (err) {
    err.status = 400;
    return next(err);
  }
};

const terminateEmployee = async (req, res, next) => {
  try {
    const employee = await employeeService.terminateEmployee(req.params.id);
    return res.json(employee);
  } catch (err) {
    err.status = 400;
    return next(err);
  }
};

const updatePanelAccess = async (req, res, next) => {
  try {
    const panelAccess = await employeePanelService.updatePanelAccess(req.params.id, {
      username: req.body.username,
      password: req.body.password,
      panel_access_enabled: req.body.panel_access_enabled,
      permissions: req.body.permissions
    });

    const employee = await employeeService.getEmployeeDetails(req.params.id);
    return res.json({ ...employee, ...panelAccess });
  } catch (err) {
    err.status = 400;
    return next(err);
  }
};

module.exports = {
  listEmployees,
  getEmployee,
  hireEmployee,
  updateAttendance,
  terminateEmployee,
  updatePanelAccess
};
