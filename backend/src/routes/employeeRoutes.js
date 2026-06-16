const express = require('express');
const employeeController = require('../controllers/employeeController');
const { requireRole } = require('../middlewares/roleMiddleware');

const router = express.Router();

router.get('/', requireRole('admin'), employeeController.listEmployees);
router.get('/:id', requireRole('admin'), employeeController.getEmployee);
router.post('/', requireRole('admin'), employeeController.hireEmployee);
router.patch('/:id/attendance', requireRole('admin'), employeeController.updateAttendance);
router.patch('/:id/panel-access', requireRole('admin'), employeeController.updatePanelAccess);
router.patch('/:id/terminate', requireRole('admin'), employeeController.terminateEmployee);

module.exports = router;
