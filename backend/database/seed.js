const fs = require('fs');

const path = require('path');

const bcrypt = require('bcrypt');

const pool = require('./connection');



const DEFAULT_ADMIN = {

  username: 'admin',

  password: 'admin123',

  name: 'Administrador',

  role: 'admin'

};

const DEFAULT_ATTENDANT = {
  username: 'atendente',
  password: 'atendente123',
  name: 'Atendente',
  role: 'attendant'
};



async function seedAdmin() {

  const existing = await pool.query('SELECT id FROM admins WHERE username = $1', [

    DEFAULT_ADMIN.username

  ]);



  if (existing.rows.length > 0) {

    console.log('Administrador padrão já existe — seed de admin ignorado.');

  } else {

    const passwordHash = await bcrypt.hash(DEFAULT_ADMIN.password, 10);

    await pool.query(

      `INSERT INTO admins (username, password_hash, name, role)

       VALUES ($1, $2, $3, $4)`,

      [DEFAULT_ADMIN.username, passwordHash, DEFAULT_ADMIN.name, DEFAULT_ADMIN.role]

    );

    console.log(

      `Administrador criado: usuário "${DEFAULT_ADMIN.username}" (altere a senha após o primeiro login).`

    );

  }

  await pool.query(
    `UPDATE admins SET role = 'admin' WHERE role IS NULL OR role = ''`
  );
}

async function seedAttendant() {
  const existing = await pool.query('SELECT id FROM admins WHERE username = $1', [
    DEFAULT_ATTENDANT.username
  ]);

  if (existing.rows.length > 0) {
    console.log('Atendente padrão já existe — seed de atendente ignorado.');
    return;
  }

  const passwordHash = await bcrypt.hash(DEFAULT_ATTENDANT.password, 10);

  await pool.query(
    `INSERT INTO admins (username, password_hash, name, role)
     VALUES ($1, $2, $3, $4)`,
    [
      DEFAULT_ATTENDANT.username,
      passwordHash,
      DEFAULT_ATTENDANT.name,
      DEFAULT_ATTENDANT.role
    ]
  );

  console.log(
    `Atendente criado: usuário "${DEFAULT_ATTENDANT.username}" (altere a senha após o primeiro login).`
  );
}



async function seedDemoData() {
  const marker = await pool.query(
    `SELECT id FROM customers WHERE phone_number = $1`,
    ['5511999990001']
  );

  if (marker.rows.length > 0) {
    console.log('Dados de demonstração (clientes/pedidos) já existem — seed ignorado.');
    return;
  }

  const products = await pool.query(
    `SELECT id, name, price, is_promotion, promotion_price
     FROM products
     WHERE is_active = true
     ORDER BY id
     LIMIT 4`
  );

  if (products.rows.length < 2) {
    console.log('Produtos insuficientes para seed de pedidos — execute migrate/seed de produtos primeiro.');
    return;
  }

  const [pizzaCalabresa, pizzaMargherita, refri, agua] = products.rows;

  const effectivePrice = (product) =>
    product.is_promotion && product.promotion_price != null
      ? Number(product.promotion_price)
      : Number(product.price);

  const demoCustomers = [
    { name: 'Maria Silva', phone: '5511999990001', orders: 3 },
    { name: 'João Santos', phone: '5511999990002', orders: 2 },
    { name: 'Ana Costa', phone: '5511999990003', orders: 1 },
    { name: 'Pedro Lima', phone: '5511999990004', orders: 4 },
    { name: null, phone: '5511999990005', orders: 0 }
  ];

  const orderStatuses = ['delivered', 'paid', 'preparing', 'pending', 'ready'];

  const orderTemplates = [
    [
      { product: pizzaCalabresa, qty: 1 },
      { product: refri, qty: 1 }
    ],
    [
      { product: pizzaMargherita, qty: 2 }
    ],
    [
      { product: pizzaCalabresa, qty: 1 },
      { product: agua, qty: 2 }
    ],
    [
      { product: refri, qty: 2 },
      { product: pizzaMargherita, qty: 1 }
    ]
  ];

  let ordersCreated = 0;

  for (const customer of demoCustomers) {
    const convResult = await pool.query(
      `INSERT INTO conversations (phone_number, status)
       VALUES ($1, 'active')
       ON CONFLICT (phone_number) DO UPDATE SET phone_number = EXCLUDED.phone_number
       RETURNING id`,
      [customer.phone]
    );

    const conversationId = convResult.rows[0].id;

    await pool.query(
      `INSERT INTO customers (name, phone_number, cashback_balance)
       VALUES ($1, $2, $3)
       ON CONFLICT (phone_number) DO UPDATE SET name = EXCLUDED.name`,
      [customer.name, customer.phone, customer.orders > 1 ? 5.5 : 0]
    );

    for (let i = 0; i < customer.orders; i += 1) {
      const items = orderTemplates[(customer.orders + i) % orderTemplates.length];
      const subtotal = items.reduce(
        (sum, item) => sum + effectivePrice(item.product) * item.qty,
        0
      );
      const status = orderStatuses[(customer.orders + i) % orderStatuses.length];

      const orderResult = await pool.query(
        `INSERT INTO orders (
           conversation_id, subtotal_amount, discount_amount,
           cashback_used, total_amount, status, created_at
         )
         VALUES ($1, $2, 0, 0, $2, $3, NOW() - ($4 || ' days')::interval)
         RETURNING id`,
        [conversationId, subtotal, status, String(i)]
      );

      const orderId = orderResult.rows[0].id;

      for (const item of items) {
        await pool.query(
          `INSERT INTO order_items (order_id, product_id, quantity, unit_price)
           VALUES ($1, $2, $3, $4)`,
          [orderId, item.product.id, item.qty, effectivePrice(item.product)]
        );
      }

      ordersCreated += 1;
    }
  }

  console.log(
    `Dados de demonstração criados: ${demoCustomers.length} clientes, ${ordersCreated} pedidos.`
  );
}

async function seed() {

  const seedPath = path.join(__dirname, 'seed.sql');

  const seedSql = fs.readFileSync(seedPath, 'utf8');



  await pool.query(seedSql);

  console.log('Produtos de exemplo inseridos com sucesso.');



  await seedAdmin();

  await seedAttendant();

  await seedDemoData();

  await pool.end();

}



seed().catch((err) => {

  console.error('Erro ao executar seed:', err);

  process.exit(1);

});

