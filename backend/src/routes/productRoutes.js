const express = require('express');
const productController = require('../controllers/productController');
const { requireRole } = require('../middlewares/roleMiddleware');

const router = express.Router();

router.get('/', productController.getProducts);
router.get('/:id', productController.getProductById);
router.post('/', requireRole('admin'), productController.createProduct);
router.put('/:id', requireRole('admin'), productController.updateProduct);
router.delete('/:id', requireRole('admin'), productController.deleteProduct);

module.exports = router;
