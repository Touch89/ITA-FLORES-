-- Seed data mirroring INIT_USERS / INIT_PRODUCTS / INIT_SALES in src/app/App.tsx.
-- Note: sale line items are linked to the actual product/variant ids below
-- (the in-app demo data uses ad-hoc ids for sale items that don't match its own
-- variant ids; here they're corrected so foreign keys stay valid).

SET NAMES utf8mb4;

-- ── BRANCHES ───────────────────────────────────────────────────────────────
INSERT INTO branches (name, sort_order) VALUES
  ('Ita Flores', 0), ('Mexicane', 1), ('Dos corazones', 2), ('Don Carlos', 3);

-- ── APP SETTINGS ───────────────────────────────────────────────────────────
INSERT INTO app_settings (id, logo_url, barcode_counter, sale_counter) VALUES (1, '/uploads/logos/italogo.png', 1008, 4);

-- ── USERS ──────────────────────────────────────────────────────────────────
-- password column holds bcrypt hashes (cost 10), not plaintext — the demo passwords below
-- are: admin123, almacen123, vendedor123, ana123 respectively.
INSERT INTO users (id, name, username, password, role, branch, commission_mode, custom_commission_percent, active) VALUES
  ('u1', 'Carlos Pasos',   'admin',     '$2b$10$Agm2ZGImy1.cPllFgxVY9.D3VtWAiAmLSag9AJmz2yVIWKzWWj1By', 'admin',     'Ita Flores', 'tiers',  5, 1),
  ('u2', 'Sofía Ramírez',  'almacen',   '$2b$10$x7YuJyhRU.gGOECB6WDca.hI/rmEpXq8GYeWwAc3o3cLli8Ko.I.2', 'warehouse', 'Mexicane',  'tiers',  3, 1),
  ('u3', 'Miguel Torres',  'vendedor',  '$2b$10$/xa87vlY0Ob8oIeL3v9XOOlcRpj2qmhmuG3eZhTBDqDQrplvuPHkW', 'seller',    'Ita Flores', 'tiers',  5, 1),
  ('u4', 'Ana García',     'ana',       '$2b$10$W97t0Ag.n8qQHd/f2ZbO2OYXizsNKwWwPv7DuREE/Toi4CoRF4hmG', 'seller',    'Mexicane',  'custom', 4, 1);

-- ── COMMISSION TIERS ───────────────────────────────────────────────────────
INSERT INTO commission_tiers (id, min_amount, max_amount, percent) VALUES
  ('tier-1', 0,     10000, 3),
  ('tier-2', 10000, 20000, 5),
  ('tier-3', 20000, 30000, 7),
  ('tier-4', 30000, NULL,  10);

-- ── PRODUCTS ───────────────────────────────────────────────────────────────
INSERT INTO products (id, sku, barcode, name, description, category, gender, price, size_system, active, created_at) VALUES
  ('p1', 'CAM-001', '7890000001001', 'Camiseta Slim Fit Premium', 'Algodón 100% peinado, corte slim moderno',        'Camisetas',  'men',         299,  'sml',     1, '2025-01-15'),
  ('p2', 'VES-001', '7890000001002', 'Vestido Floral Verano',     'Vestido ligero con estampado floral, tela chiffon','Vestidos',   'women',       599,  'sml',     1, '2025-01-20'),
  ('p3', 'REL-001', '7890000001003', 'Reloj Elegance Classic',    'Correa de cuero genuino, esfera minimalista chapada','Relojes',  'accessories', 1299, 'unica',   1, '2025-02-01'),
  ('p4', 'BOL-001', '7890000001004', 'Bolso Tote Cuero',          'Cuero sintético premium con múltiples compartimentos','Bolsos',  'accessories', 899,  'unica',   1, '2025-02-05'),
  ('p5', 'PAN-001', '7890000001005', 'Pantalón Chino Clásico',    'Algodón stretch de corte recto, cómodo y versátil','Pantalones', 'men',         499,  'numeric', 1, '2025-02-10'),
  ('p6', 'BLU-001', '7890000001006', 'Blusa Seda Drapeada',       'Seda artificial con caída elegante, varios escotes','Blusas',    'women',       449,  'sml',     1, '2025-02-15'),
  ('p7', 'JOY-001', '7890000001007', 'Collar Perlas Naturales',   'Perlas de agua dulce con cierre de plata .925',   'Joyería',    'accessories', 750,  'unica',   1, '2025-03-01');

-- ── PRODUCT VARIANTS ───────────────────────────────────────────────────────
INSERT INTO product_variants (id, product_id, color, color_hex, model) VALUES
  ('v1-blanco', 'p1', 'Blanco',      '#F5F5F0', 'Slim Fit'),
  ('v1-negro',  'p1', 'Negro',       '#1a1a1a', 'Slim Fit'),
  ('v1-marino', 'p1', 'Azul Marino', '#1B3A6B', 'Regular Fit'),

  ('v2-rosa',   'p2', 'Rosa',        '#FF69B4', 'A-line Floral'),
  ('v2-menta',  'p2', 'Verde Menta', '#80CBC4', 'A-line Floral'),
  ('v2-blanco', 'p2', 'Blanco',      '#F5F5F0', 'A-line Floral'),

  ('v3-dorado',   'p3', 'Dorado',    '#FFD700', 'Classic Leather'),
  ('v3-plateado', 'p3', 'Plateado',  '#C0C0C0', 'Classic Leather'),
  ('v3-negro',    'p3', 'Negro',     '#1a1a1a', 'Sport'),

  ('v4-negro',  'p4', 'Negro',       '#1a1a1a', 'Tote Grande'),
  ('v4-cafe',   'p4', 'Café',        '#795548', 'Tote Grande'),
  ('v4-beige',  'p4', 'Beige',       '#D4B896', 'Tote Mediano'),

  ('v5-beige',  'p5', 'Beige',       '#D4B896', 'Chino Recto'),
  ('v5-marino', 'p5', 'Azul Marino', '#1B3A6B', 'Chino Recto'),
  ('v5-gris',   'p5', 'Gris',        '#9E9E9E', 'Chino Slim'),

  ('v6-blanco', 'p6', 'Blanco',      '#F5F5F0', 'V-neck Drapeada'),
  ('v6-negro',  'p6', 'Negro',       '#1a1a1a', 'V-neck Drapeada'),
  ('v6-morado', 'p6', 'Morado',      '#9C27B0', 'Round Drapeada'),

  ('v7-blanco',   'p7', 'Blanco',    '#F5F5F0', 'Clásico 42cm'),
  ('v7-plateado', 'p7', 'Plateado',  '#C0C0C0', 'Choker 35cm');

-- ── VARIANT SIZES / STOCK PER BRANCH ───────────────────────────────────────
-- A size may be stocked in some branches and absent in others (e.g. v1-negro
-- size L only exists in Mexicane, not in Ita Flores).
INSERT INTO variant_sizes (variant_id, size, branch, stock) VALUES
  ('v1-blanco', 'S', 'Ita Flores', 10), ('v1-blanco', 'S', 'Mexicane', 5),
  ('v1-blanco', 'M', 'Ita Flores', 12), ('v1-blanco', 'M', 'Dos corazones', 8),
  ('v1-blanco', 'L', 'Ita Flores', 8),
  ('v1-negro',  'M', 'Ita Flores', 7),  ('v1-negro',  'M', 'Don Carlos', 5),
  ('v1-negro',  'L', 'Mexicane', 6),
  ('v1-marino', 'M', 'Ita Flores', 6),  ('v1-marino', 'M', 'Dos corazones', 4),
  ('v1-marino', 'L', 'Ita Flores', 4),

  ('v2-rosa',   'XS', 'Ita Flores', 6),
  ('v2-rosa',   'S',  'Ita Flores', 5),  ('v2-rosa',   'S', 'Mexicane', 4),
  ('v2-rosa',   'M',  'Dos corazones', 3),
  ('v2-menta',  'S',  'Ita Flores', 5),
  ('v2-menta',  'M',  'Mexicane', 4),
  ('v2-blanco', 'S',  'Ita Flores', 4),  ('v2-blanco', 'S', 'Don Carlos', 3),
  ('v2-blanco', 'M',  'Ita Flores', 2),

  ('v3-dorado',   'Única', 'Ita Flores', 3), ('v3-dorado',   'Única', 'Mexicane', 2),
  ('v3-plateado', 'Única', 'Ita Flores', 4), ('v3-plateado', 'Única', 'Dos corazones', 3),
  ('v3-negro',    'Única', 'Don Carlos', 3),

  ('v4-negro', 'Única', 'Ita Flores', 5), ('v4-negro', 'Única', 'Mexicane', 3),
  ('v4-cafe',  'Única', 'Ita Flores', 5),
  ('v4-beige', 'Única', 'Ita Flores', 4), ('v4-beige', 'Única', 'Dos corazones', 3), ('v4-beige', 'Única', 'Don Carlos', 3),

  ('v5-beige',  '30', 'Ita Flores', 7),  ('v5-beige',  '30', 'Mexicane', 5),
  ('v5-beige',  '32', 'Ita Flores', 10), ('v5-beige',  '32', 'Dos corazones', 5),
  ('v5-beige',  '34', 'Ita Flores', 8),
  ('v5-marino', '30', 'Mexicane', 6),
  ('v5-marino', '32', 'Ita Flores', 6),  ('v5-marino', '32', 'Don Carlos', 4),
  ('v5-gris',   '30', 'Ita Flores', 5),  ('v5-gris',   '30', 'Dos corazones', 3),
  ('v5-gris',   '32', 'Ita Flores', 5),

  ('v6-blanco', 'S', 'Ita Flores', 5), ('v6-blanco', 'S', 'Mexicane', 3),
  ('v6-blanco', 'M', 'Ita Flores', 4),
  ('v6-negro',  'M', 'Dos corazones', 6),
  ('v6-negro',  'L', 'Ita Flores', 2),
  ('v6-morado', 'S', 'Ita Flores', 4),
  ('v6-morado', 'M', 'Don Carlos', 3),

  ('v7-blanco',   'Única', 'Ita Flores', 4), ('v7-blanco',   'Única', 'Mexicane', 2),
  ('v7-plateado', 'Única', 'Ita Flores', 4);

-- ── SALES ──────────────────────────────────────────────────────────────────
INSERT INTO sales (id, sale_date, seller_id, seller_name, branch, subtotal, total, payment_method, cash_amount, card_amount) VALUES
  ('sale-001', '2026-07-08 10:30:00', 'u3', 'Miguel Torres', 'Ita Flores', 1097, 1097, 'card',  NULL, NULL),
  ('sale-002', '2026-07-11 14:15:00', 'u4', 'Ana García',    'Mexicane',  1498, 1498, 'cash',  NULL, NULL),
  ('sale-003', '2026-07-15 09:00:00', 'u3', 'Miguel Torres', 'Ita Flores', 1299, 1299, 'mixed', 500,  799),
  ('sale-004', '2026-07-18 11:45:00', 'u4', 'Ana García',    'Mexicane',  800,  800,  'card',  NULL, NULL);

-- ── SALE ITEMS ─────────────────────────────────────────────────────────────
INSERT INTO sale_items (cart_id, sale_id, product_id, variant_id, name, price, quantity, color, model, size, is_custom) VALUES
  ('ci1', 'sale-001', 'p1', 'v1-blanco', 'Camiseta Slim Fit Premium', 299, 2, 'Blanco', 'Slim Fit',      'M',      0),
  ('ci2', 'sale-001', 'p5', 'v5-beige',  'Pantalón Chino Clásico',    499, 1, 'Beige',  'Chino Recto',   '32',     0),

  ('ci3', 'sale-002', 'p2', 'v2-rosa',   'Vestido Floral Verano',     599, 1, 'Rosa',   'A-line Floral', 'S',      0),
  ('ci4', 'sale-002', 'p4', 'v4-beige',  'Bolso Tote Cuero',          899, 1, 'Beige',  'Tote Mediano',  'Única',  0),

  ('ci5', 'sale-003', 'p3', 'v3-dorado', 'Reloj Elegance Classic',    1299, 1, 'Dorado', 'Classic Leather', 'Única', 0),

  ('ci6', 'sale-004', 'p7', 'v7-blanco', 'Collar Perlas Naturales',   750, 1, 'Blanco', 'Clásico 42cm', 'Única',  0),
  ('ci7', 'sale-004', NULL, NULL,        'Envolver regalo',           50,  1, NULL,     NULL,           NULL,     1);
