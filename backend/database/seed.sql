INSERT INTO products (name, description, price, category, is_promotion, promotion_price, is_active)
SELECT * FROM (VALUES
  ('Pizza de Calabresa', 'Molho, mussarela e calabresa fatiada', 45.90, 'Pizzas', true, 39.90, true),
  ('Pizza Margherita', 'Molho, mussarela, tomate e manjericão', 42.90, 'Pizzas', false, NULL, true),
  ('Refrigerante 2L', 'Coca-Cola, Guaraná ou Fanta', 12.00, 'Bebidas', false, NULL, true),
  ('Água Mineral 500ml', 'Água sem gás', 4.50, 'Bebidas', false, NULL, true)
) AS seed(name, description, price, category, is_promotion, promotion_price, is_active)
WHERE NOT EXISTS (SELECT 1 FROM products LIMIT 1);
