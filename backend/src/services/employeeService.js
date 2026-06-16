const db = require('../../database/connection');
const employeePanelService = require('./employeePanelService');

const TIMEZONE = process.env.STORE_TIMEZONE || 'America/Sao_Paulo';
const SHIFT_HOURS = Number(process.env.STORE_SHIFT_HOURS) || 8;
const PAID_STATUSES = ['paid', 'preparing', 'ready', 'out_for_delivery', 'delivered'];
const KITCHEN_DONE_STATUSES = ['ready', 'out_for_delivery', 'delivered'];

const formatDateInput = (date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);

const parseDateInput = (value) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const normalizeExtras = (list) => {
  if (!Array.isArray(list)) {
    return [];
  }

  return list
    .map((item, index) => ({
      id: item.id || `extra-${index}-${Date.now()}`,
      label: String(item.label || 'Outro custo').trim() || 'Outro custo',
      value: Math.max(0, Number(item.value) || 0)
    }))
    .filter((item) => item.label);
};

const sumExtras = (extras) =>
  normalizeExtras(extras).reduce((sum, item) => sum + item.value, 0);

const calculateMonthlyCost = (employee) => {
  const salary = Number(employee.salary) || 0;
  const laborCharges = Number(employee.labor_charges) || 0;
  const extrasTotal = sumExtras(employee.extra_costs);

  return Number((salary + laborCharges + extrasTotal).toFixed(2));
};

const mapEmployee = (row, extras = {}) => ({
  id: row.id,
  name: row.name,
  role: row.role,
  salary: Number(row.salary),
  laborCharges: Number(row.labor_charges),
  extraCosts: normalizeExtras(row.extra_costs),
  monthlyCost: calculateMonthlyCost(row),
  status: row.status,
  hiredAt: row.hired_at,
  terminatedAt: row.terminated_at,
  createdAt: row.created_at,
  ...employeePanelService.mapPanelAccess(row),
  ...extras
});

const eachDateInRange = (startDate, endDate) => {
  const dates = [];
  const cursor = new Date(startDate);
  const end = new Date(endDate);

  while (cursor <= end) {
    dates.push(formatDateInput(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
};

const getMonthRange = (referenceDate = new Date()) => {
  const todayStr = formatDateInput(referenceDate);
  const [year, month] = todayStr.split('-').map(Number);
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;

  return { monthStart, today: todayStr, year, month };
};

const getAttendanceStats = async (employeeId, hiredAt, referenceDate = new Date()) => {
  const { monthStart, today } = getMonthRange(referenceDate);
  const hireDate = formatDateInput(new Date(hiredAt));
  const rangeStart = hireDate > monthStart ? hireDate : monthStart;

  if (rangeStart > today) {
    return {
      monthStart,
      today,
      expectedDays: 0,
      presentDays: 0,
      missedDays: 0,
      attendanceToday: false
    };
  }

  const [attendanceResult, todayResult] = await Promise.all([
    db.query(
      `SELECT attendance_date::text AS attendance_date, is_present
       FROM employee_attendance
       WHERE employee_id = $1
         AND attendance_date >= $2::date
         AND attendance_date <= $3::date`,
      [employeeId, rangeStart, today]
    ),
    db.query(
      `SELECT is_present
       FROM employee_attendance
       WHERE employee_id = $1 AND attendance_date = $2::date`,
      [employeeId, today]
    )
  ]);

  const attendanceMap = new Map(
    attendanceResult.rows.map((row) => [row.attendance_date, row.is_present])
  );

  const expectedDates = eachDateInRange(parseDateInput(rangeStart), parseDateInput(today));
  let presentDays = 0;

  for (const date of expectedDates) {
    if (attendanceMap.get(date) === true) {
      presentDays += 1;
    }
  }

  const expectedDays = expectedDates.length;
  const missedDays = expectedDays - presentDays;
  const attendanceToday = todayResult.rows[0]?.is_present === true;

  return {
    monthStart,
    today,
    expectedDays,
    presentDays,
    missedDays,
    attendanceToday
  };
};

const listEmployees = async () => {
  const result = await db.query(
    `SELECT *
     FROM employees
     WHERE status = 'active'
     ORDER BY name ASC`
  );

  const employees = await Promise.all(
    result.rows.map(async (row) => {
      const stats = await getAttendanceStats(row.id, row.hired_at);
      return mapEmployee(row, {
        isPresentToday: stats.attendanceToday,
        missedDaysThisMonth: stats.missedDays,
        presentDaysThisMonth: stats.presentDays
      });
    })
  );

  return employees;
};

const getEmployeeDetails = async (employeeId) => {
  const result = await db.query('SELECT * FROM employees WHERE id = $1', [employeeId]);

  if (result.rows.length === 0) {
    return null;
  }

  const employee = result.rows[0];
  const stats = await getAttendanceStats(employee.id, employee.hired_at);

  const attendanceResult = await db.query(
    `SELECT attendance_date::text AS attendance_date, is_present
     FROM employee_attendance
     WHERE employee_id = $1
       AND attendance_date >= $2::date
       AND attendance_date <= $3::date
     ORDER BY attendance_date DESC`,
    [employeeId, stats.monthStart, stats.today]
  );

  return {
    ...mapEmployee(employee, {
      isPresentToday: stats.attendanceToday,
      missedDaysThisMonth: stats.missedDays,
      presentDaysThisMonth: stats.presentDays,
      expectedDaysThisMonth: stats.expectedDays
    }),
    attendance: attendanceResult.rows.map((row) => ({
      date: row.attendance_date,
      isPresent: row.is_present
    }))
  };
};

const hireEmployee = async ({
  name,
  role,
  salary,
  laborCharges = 0,
  extraCosts = []
}) => {
  if (!name?.trim()) {
    throw new Error('Nome do funcionário é obrigatório.');
  }

  if (!role?.trim()) {
    throw new Error('Função do funcionário é obrigatória.');
  }

  const parsedSalary = Number(salary);

  if (!Number.isFinite(parsedSalary) || parsedSalary < 0) {
    throw new Error('Salário inválido.');
  }

  const parsedLabor = Number(laborCharges) || 0;

  if (!Number.isFinite(parsedLabor) || parsedLabor < 0) {
    throw new Error('Encargos trabalhistas inválidos.');
  }

  const result = await db.query(
    `INSERT INTO employees (
       name, role, salary, labor_charges, extra_costs, status, hired_at
     )
     VALUES ($1, $2, $3, $4, $5::jsonb, 'active', CURRENT_DATE)
     RETURNING *`,
    [
      name.trim(),
      role.trim(),
      parsedSalary,
      parsedLabor,
      JSON.stringify(normalizeExtras(extraCosts))
    ]
  );

  return getEmployeeDetails(result.rows[0].id);
};

const setAttendance = async (employeeId, { date, isPresent }) => {
  const employee = await db.query(
    `SELECT id FROM employees WHERE id = $1 AND status = 'active'`,
    [employeeId]
  );

  if (employee.rows.length === 0) {
    throw new Error('Funcionário não encontrado ou já demitido.');
  }

  const attendanceDate = date || formatDateInput();

  await db.query(
    `INSERT INTO employee_attendance (employee_id, attendance_date, is_present)
     VALUES ($1, $2::date, $3)
     ON CONFLICT (employee_id, attendance_date)
     DO UPDATE SET is_present = EXCLUDED.is_present, updated_at = CURRENT_TIMESTAMP`,
    [employeeId, attendanceDate, isPresent === true]
  );

  return getEmployeeDetails(employeeId);
};

const terminateEmployee = async (employeeId) => {
  const result = await db.query(
    `UPDATE employees
     SET status = 'terminated',
         terminated_at = CURRENT_TIMESTAMP,
         username = NULL,
         password_hash = NULL,
         panel_access_enabled = false,
         panel_permissions = $2::jsonb,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND status = 'active'
     RETURNING *`,
    [employeeId, JSON.stringify(employeePanelService.DEFAULT_PANEL_PERMISSIONS)]
  );

  if (result.rows.length === 0) {
    throw new Error('Funcionário não encontrado ou já demitido.');
  }

  return mapEmployee(result.rows[0]);
};

const normalizeRole = (role) =>
  String(role || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const getRoleCategory = (role) => {
  const value = normalizeRole(role);

  if (value.includes('auxiliar') && value.includes('cozinha')) {
    return 'kitchen_assistant';
  }

  if (value.includes('cozinheiro') || value.includes('cozinha')) {
    return 'kitchen';
  }

  if (value.includes('garcom') || value.includes('atendente') || value.includes('salao')) {
    return 'salon';
  }

  return 'other';
};

const listActiveEmployeesBrief = async () => {
  const result = await db.query(
    `SELECT id, name, role
     FROM employees
     WHERE status = 'active'
     ORDER BY name ASC`
  );

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    role: row.role,
    roleCategory: getRoleCategory(row.role)
  }));
};

const getEmployeePerformance = async (
  employeeId,
  monthStart,
  monthEnd,
  roleCategory,
  presentDaysThisMonth = 0
) => {
  if (roleCategory === 'salon') {
    const result = await db.query(
      `SELECT
         COUNT(*)::int AS order_count,
         COALESCE(SUM(total_amount), 0)::float AS revenue
       FROM orders
       WHERE attendant_employee_id = $1
         AND status = ANY($2::text[])
         AND created_at >= $3
         AND created_at <= $4`,
      [employeeId, PAID_STATUSES, monthStart, monthEnd]
    );

    const orderCount = result.rows[0].order_count;
    const revenue = Number(result.rows[0].revenue);

    return {
      type: 'salon',
      label: 'Pedidos anotados',
      ordersCount: orderCount,
      totalRevenue: revenue,
      avgTicketPerComanda:
        orderCount > 0 ? Number((revenue / orderCount).toFixed(2)) : null
    };
  }

  if (roleCategory === 'kitchen') {
    const [ordersResult, dishesResult] = await Promise.all([
      db.query(
        `SELECT
           COUNT(*)::int AS order_count,
           COALESCE(SUM(total_amount), 0)::float AS revenue,
           COALESCE(
             SUM(EXTRACT(EPOCH FROM (updated_at - created_at)) / 60),
             0
           )::float AS total_prep_minutes,
           AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 60)::float AS avg_prep_minutes
         FROM orders
         WHERE kitchen_employee_id = $1
           AND status = ANY($2::text[])
           AND created_at >= $3
           AND created_at <= $4
           AND updated_at > created_at`,
        [employeeId, KITCHEN_DONE_STATUSES, monthStart, monthEnd]
      ),
      db.query(
        `SELECT COALESCE(SUM(oi.quantity), 0)::int AS dishes_count
         FROM order_items oi
         INNER JOIN orders o ON o.id = oi.order_id
         WHERE o.kitchen_employee_id = $1
           AND o.status = ANY($2::text[])
           AND o.created_at >= $3
           AND o.created_at <= $4
           AND o.updated_at > o.created_at`,
        [employeeId, KITCHEN_DONE_STATUSES, monthStart, monthEnd]
      )
    ]);

    const orderCount = ordersResult.rows[0].order_count;
    const revenue = Number(ordersResult.rows[0].revenue);
    const totalPrepMinutes = Number(ordersResult.rows[0].total_prep_minutes);
    const avgPrep = ordersResult.rows[0].avg_prep_minutes;
    const dishesCount = dishesResult.rows[0].dishes_count;
    const totalWorkMinutes = presentDaysThisMonth * SHIFT_HOURS * 60;
    const workMinutesForDishes =
      totalWorkMinutes > 0 ? totalWorkMinutes : totalPrepMinutes > 0 ? totalPrepMinutes : null;

    return {
      type: 'kitchen',
      label: 'Pedidos feitos',
      ordersCompleted: orderCount,
      dishesCount,
      totalRevenue: revenue,
      avgTicketPerComanda:
        orderCount > 0 ? Number((revenue / orderCount).toFixed(2)) : null,
      avgPrepTimeMinutes:
        avgPrep != null && orderCount > 0 ? Number(Number(avgPrep).toFixed(1)) : null,
      avgTimePerDishMinutes:
        dishesCount > 0 && workMinutesForDishes != null
          ? Number((workMinutesForDishes / dishesCount).toFixed(1))
          : null
    };
  }

  return null;
};

const getEmployeeDashboardProfile = async (employeeId, referenceDate = new Date()) => {
  const result = await db.query('SELECT * FROM employees WHERE id = $1', [employeeId]);

  if (result.rows.length === 0) {
    return null;
  }

  const employee = result.rows[0];
  const roleCategory = getRoleCategory(employee.role);
  const stats = await getAttendanceStats(employee.id, employee.hired_at, referenceDate);
  const monthStartDate = new Date(stats.monthStart);
  const monthEndDate = new Date(stats.today);
  monthEndDate.setHours(23, 59, 59, 999);

  const performance = await getEmployeePerformance(
    employee.id,
    monthStartDate,
    monthEndDate,
    roleCategory,
    stats.presentDays
  );

  return {
    ...mapEmployee(employee, {
      roleCategory,
      isPresentToday: stats.attendanceToday,
      presentDaysThisMonth: stats.presentDays,
      missedDaysThisMonth: stats.missedDays,
      expectedDaysThisMonth: stats.expectedDays,
      workedDaysThisMonth: stats.presentDays
    }),
    performance
  };
};

const getEmployeesDashboardOverview = async (referenceDate = new Date()) => {
  const now = referenceDate;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const [activeResult, terminatedResult, revenueResult] = await Promise.all([
    db.query(`SELECT * FROM employees WHERE status = 'active' ORDER BY name ASC`),
    db.query(
      `SELECT COUNT(*)::int AS terminated_count
       FROM employees
       WHERE status = 'terminated'
         AND terminated_at >= $1
         AND terminated_at <= $2`,
      [monthStart, monthEnd]
    ),
    db.query(
      `SELECT COALESCE(SUM(total_amount), 0)::float AS gross_revenue
       FROM orders
       WHERE status = ANY($1::text[])
         AND created_at >= $2
         AND created_at <= $3`,
      [PAID_STATUSES, monthStart, monthEnd]
    )
  ]);

  const activeEmployees = activeResult.rows;
  const payrollTotal = activeEmployees.reduce(
    (sum, row) => sum + calculateMonthlyCost(row),
    0
  );

  let totalExpectedDays = 0;
  let totalMissedDays = 0;

  const employees = await Promise.all(
    activeEmployees.map(async (row) => {
      const stats = await getAttendanceStats(row.id, row.hired_at, referenceDate);
      totalExpectedDays += stats.expectedDays;
      totalMissedDays += stats.missedDays;

      return {
        id: row.id,
        name: row.name,
        role: row.role,
        roleCategory: getRoleCategory(row.role),
        monthlyCost: calculateMonthlyCost(row),
        isPresentToday: stats.attendanceToday,
        missedDaysThisMonth: stats.missedDays,
        presentDaysThisMonth: stats.presentDays
      };
    })
  );

  const grossRevenue = Number(revenueResult.rows[0].gross_revenue);
  const terminatedCount = terminatedResult.rows[0].terminated_count;
  const headcount = activeEmployees.length;
  const absenteeismRate =
    totalExpectedDays > 0
      ? Number(((totalMissedDays / totalExpectedDays) * 100).toFixed(1))
      : null;
  const turnoverRate =
    headcount + terminatedCount > 0
      ? Number(((terminatedCount / (headcount + terminatedCount)) * 100).toFixed(1))
      : null;
  const laborCostPercent =
    grossRevenue > 0 ? Number(((payrollTotal / grossRevenue) * 100).toFixed(1)) : null;

  return {
    period: {
      label: `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`,
      from: monthStart.toISOString(),
      to: monthEnd.toISOString()
    },
    kpis: {
      headcount,
      payrollTotal: payrollTotal > 0 ? Number(payrollTotal.toFixed(2)) : null,
      laborCostPercent,
      turnoverRate,
      absenteeismRate
    },
    employees,
    reference: {
      grossRevenue
    }
  };
};

module.exports = {
  listEmployees,
  getEmployeeDetails,
  hireEmployee,
  setAttendance,
  terminateEmployee,
  formatDateInput,
  getRoleCategory,
  listActiveEmployeesBrief,
  getEmployeeDashboardProfile,
  getEmployeesDashboardOverview
};
