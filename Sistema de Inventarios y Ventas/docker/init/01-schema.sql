-- Schema mirroring the AppState shape used in src/app/App.tsx (users, products, sales).
-- This is the real persistence layer: the Vite dev middleware's GET/PUT /api/state
-- reads/writes these tables directly (see vite.config.ts).

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id                VARCHAR(40) PRIMARY KEY,
  name              VARCHAR(150) NOT NULL,
  username          VARCHAR(100) NOT NULL UNIQUE,
  password          VARCHAR(255) NOT NULL,
  role              ENUM('admin','warehouse','seller') NOT NULL,
  branch            VARCHAR(100) NOT NULL,
  commission_mode             ENUM('tiers','custom') NOT NULL DEFAULT 'tiers',
  custom_commission_percent   DECIMAL(5,2) NOT NULL DEFAULT 0,
  active            TINYINT(1) NOT NULL DEFAULT 1,
  avatar            VARCHAR(255) NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Branches are referenced by name (not id) everywhere else in the schema (users.branch,
-- sales.branch, variant_sizes.branch) — admin-managed via the Sucursales CRUD view.
CREATE TABLE IF NOT EXISTS branches (
  name          VARCHAR(100) PRIMARY KEY,
  sort_order    INT NOT NULL DEFAULT 0,
  logo_url      VARCHAR(255) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Single-row table for app-wide settings that aren't tied to any one entity.
CREATE TABLE IF NOT EXISTS app_settings (
  id                INT PRIMARY KEY DEFAULT 1,
  logo_url          VARCHAR(255) NULL,
  barcode_counter   INT NOT NULL DEFAULT 1000,
  sale_counter      INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Commission tiers: whichever bracket a seller's total sales for the chosen
-- period falls into determines their commission %, unless they use a custom
-- flat % instead (see users.commission_mode). max_amount NULL = no upper bound.
CREATE TABLE IF NOT EXISTS commission_tiers (
  id            VARCHAR(40) PRIMARY KEY,
  min_amount    DECIMAL(10,2) NOT NULL,
  max_amount    DECIMAL(10,2) NULL,
  percent       DECIMAL(5,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS products (
  id            VARCHAR(40) PRIMARY KEY,
  sku           VARCHAR(60) NOT NULL UNIQUE,
  barcode       VARCHAR(60) NOT NULL UNIQUE,
  name          VARCHAR(200) NOT NULL,
  description   TEXT NULL,
  category      VARCHAR(100) NOT NULL,
  gender        ENUM('men','women','unisex','accessories') NOT NULL,
  price         DECIMAL(10,2) NOT NULL,
  size_system   ENUM('sml','numeric','unica') NOT NULL DEFAULT 'sml',
  active        TINYINT(1) NOT NULL DEFAULT 1,
  created_at    DATE NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS product_images (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  product_id   VARCHAR(40) NOT NULL,
  position     INT NOT NULL DEFAULT 0,
  image_url    VARCHAR(255) NOT NULL,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  INDEX idx_product_images_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS product_variants (
  id           VARCHAR(60) PRIMARY KEY,
  product_id   VARCHAR(40) NOT NULL,
  color        VARCHAR(80) NOT NULL,
  color_hex    VARCHAR(7) NOT NULL,
  model        VARCHAR(100) NOT NULL,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  INDEX idx_variants_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- One row per (variant, size, branch): stock is tracked per branch, not globally —
-- a size may exist in some branches and not others.
CREATE TABLE IF NOT EXISTS variant_sizes (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  variant_id   VARCHAR(60) NOT NULL,
  size         VARCHAR(20) NOT NULL,
  branch       VARCHAR(100) NOT NULL,
  stock        INT NOT NULL DEFAULT 0,
  FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
  UNIQUE KEY uq_variant_size_branch (variant_id, size, branch)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sales (
  id                  VARCHAR(40) PRIMARY KEY,
  sale_date           DATETIME NOT NULL,
  seller_id           VARCHAR(40) NOT NULL,
  seller_name         VARCHAR(150) NOT NULL,
  branch              VARCHAR(100) NOT NULL,
  subtotal            DECIMAL(10,2) NOT NULL,
  total               DECIMAL(10,2) NOT NULL,
  payment_method      ENUM('cash','card','mixed') NOT NULL,
  cash_amount         DECIMAL(10,2) NULL,
  card_amount         DECIMAL(10,2) NULL,
  cash_given          DECIMAL(10,2) NULL,
  FOREIGN KEY (seller_id) REFERENCES users(id),
  INDEX idx_sales_seller (seller_id),
  INDEX idx_sales_date (sale_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sale_items (
  cart_id      VARCHAR(40) PRIMARY KEY,
  sale_id      VARCHAR(40) NOT NULL,
  product_id   VARCHAR(40) NULL,
  variant_id   VARCHAR(60) NULL,
  name         VARCHAR(200) NOT NULL,
  price        DECIMAL(10,2) NOT NULL,
  quantity     INT NOT NULL,
  color        VARCHAR(80) NULL,
  model        VARCHAR(100) NULL,
  size         VARCHAR(20) NULL,
  is_custom    TINYINT(1) NOT NULL DEFAULT 0,
  returned_qty INT NOT NULL DEFAULT 0,
  FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
  FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL,
  INDEX idx_sale_items_sale (sale_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- "Corte de caja" — a repeatable, non-destructive snapshot of a branch's sales for the current day
-- up to the moment it's generated (not a locking/closing operation; several can be made per day).
CREATE TABLE IF NOT EXISTS cortes (
  id             VARCHAR(40) PRIMARY KEY,
  branch         VARCHAR(100) NOT NULL,
  performed_at   DATETIME NOT NULL,
  performed_by   VARCHAR(150) NOT NULL,
  sales_count    INT NOT NULL,
  total_revenue  DECIMAL(10,2) NOT NULL,
  cash_total     DECIMAL(10,2) NOT NULL,
  card_total     DECIMAL(10,2) NOT NULL,
  sales_snapshot JSON NOT NULL,
  INDEX idx_cortes_branch_date (branch, performed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
