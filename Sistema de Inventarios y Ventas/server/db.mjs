// Dev-only data API backing store: reads/writes the MariaDB tables in docker/init/*.sql.
// Mounted into Vite's dev server as middleware (see vite.config.ts) — GET/PUT /api/state.
import mysql from 'mysql2/promise'
import bcrypt from 'bcryptjs'

let pool

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: 3306, // the mariadb container's internal port — always 3306 regardless of the host-mapped DB_PORT
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 5,
      dateStrings: true, // avoid JS Date/timezone round-tripping; work with plain "YYYY-MM-DD[ HH:MM:SS]" strings
    })
  }
  return pool
}

// "2026-07-20T10:31:00.000Z" or "2026-07-08T10:30:00" -> "2026-07-20 10:31:00"
// (no timezone math — treated as a literal wall-clock stamp, matching how the app already handles dates)
function toMysqlDatetime(isoStr) {
  const m = String(isoStr).match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/)
  return m ? `${m[1]} ${m[2]}` : isoStr
}

export async function getFullState() {
  const db = getPool()
  const [[users], [tiers], [products], [images], [variants], [sizes], [sales], [items], [settingsRows], [branches], [cortes]] = await Promise.all([
    db.query('SELECT * FROM users ORDER BY created_at'),
    db.query('SELECT * FROM commission_tiers ORDER BY min_amount'),
    db.query('SELECT * FROM products ORDER BY created_at'),
    db.query('SELECT * FROM product_images ORDER BY product_id, position'),
    db.query('SELECT * FROM product_variants ORDER BY product_id, id'),
    db.query('SELECT * FROM variant_sizes'),
    db.query('SELECT * FROM sales ORDER BY sale_date DESC'),
    db.query('SELECT * FROM sale_items ORDER BY sale_id'),
    db.query('SELECT * FROM app_settings WHERE id = 1'),
    db.query('SELECT name, logo_url FROM branches ORDER BY sort_order, name'),
    db.query('SELECT * FROM cortes ORDER BY performed_at DESC'),
  ])
  const settings = settingsRows[0] || { logo_url: null, barcode_counter: 1000, sale_counter: 0 }

  const sizesByVariant = new Map()
  for (const sz of sizes) {
    if (!sizesByVariant.has(sz.variant_id)) sizesByVariant.set(sz.variant_id, new Map())
    const sizeMap = sizesByVariant.get(sz.variant_id)
    if (!sizeMap.has(sz.size)) sizeMap.set(sz.size, {})
    sizeMap.get(sz.size)[sz.branch] = sz.stock
  }

  const variantsByProduct = new Map()
  for (const v of variants) {
    const sizeMap = sizesByVariant.get(v.id) ?? new Map()
    const sizesArr = [...sizeMap.entries()].map(([size, stockByBranch]) => ({ size, stockByBranch }))
    const variant = { id: v.id, color: v.color, colorHex: v.color_hex, model: v.model, sizes: sizesArr }
    if (!variantsByProduct.has(v.product_id)) variantsByProduct.set(v.product_id, [])
    variantsByProduct.get(v.product_id).push(variant)
  }

  const imagesByProduct = new Map()
  for (const img of images) {
    if (!imagesByProduct.has(img.product_id)) imagesByProduct.set(img.product_id, [])
    imagesByProduct.get(img.product_id).push(img.image_url)
  }

  const productsOut = products.map((p) => ({
    id: p.id, sku: p.sku, barcode: p.barcode, name: p.name, description: p.description ?? '',
    category: p.category, gender: p.gender, price: Number(p.price), sizeSystem: p.size_system,
    variants: variantsByProduct.get(p.id) ?? [],
    images: imagesByProduct.get(p.id) ?? [],
    active: !!p.active, createdAt: p.created_at,
  }))

  const itemsBySale = new Map()
  for (const it of items) {
    const item = {
      cartId: it.cart_id,
      ...(it.product_id ? { productId: it.product_id } : {}),
      ...(it.variant_id ? { variantId: it.variant_id } : {}),
      name: it.name, price: Number(it.price), quantity: it.quantity,
      ...(it.color ? { color: it.color } : {}),
      ...(it.model ? { model: it.model } : {}),
      ...(it.size ? { size: it.size } : {}),
      ...(it.is_custom ? { isCustom: true } : {}),
      ...(it.returned_qty ? { returnedQty: it.returned_qty } : {}),
    }
    if (!itemsBySale.has(it.sale_id)) itemsBySale.set(it.sale_id, [])
    itemsBySale.get(it.sale_id).push(item)
  }

  const salesOut = sales.map((s) => ({
    id: s.id, date: s.sale_date.replace(' ', 'T'), sellerId: s.seller_id, sellerName: s.seller_name, branch: s.branch,
    items: itemsBySale.get(s.id) ?? [],
    subtotal: Number(s.subtotal), total: Number(s.total), paymentMethod: s.payment_method,
    ...(s.cash_amount != null ? { cashAmount: Number(s.cash_amount) } : {}),
    ...(s.card_amount != null ? { cardAmount: Number(s.card_amount) } : {}),
    ...(s.cash_given != null ? { cashGiven: Number(s.cash_given) } : {}),
  }))

  // Password hashes never leave the server — omitted entirely, not just blanked out.
  const usersOut = users.map((u) => ({
    id: u.id, name: u.name, username: u.username, role: u.role, branch: u.branch,
    commissionMode: u.commission_mode, customCommissionPercent: Number(u.custom_commission_percent),
    active: !!u.active, ...(u.avatar ? { avatar: u.avatar } : {}),
  }))

  const tiersOut = tiers.map((t) => ({
    id: t.id, min: Number(t.min_amount), max: t.max_amount == null ? null : Number(t.max_amount), percent: Number(t.percent),
  }))

  const cortesOut = cortes.map((c) => ({
    id: c.id, branch: c.branch, performedAt: c.performed_at.replace(' ', 'T'), performedBy: c.performed_by,
    salesCount: c.sales_count, totalRevenue: Number(c.total_revenue), cashTotal: Number(c.cash_total), cardTotal: Number(c.card_total),
    sales: typeof c.sales_snapshot === 'string' ? JSON.parse(c.sales_snapshot) : (c.sales_snapshot ?? []),
  }))

  return {
    users: usersOut, products: productsOut, sales: salesOut, commissionTiers: tiersOut,
    branches: branches.map((b) => b.name),
    branchLogos: Object.fromEntries(branches.filter((b) => b.logo_url).map((b) => [b.name, b.logo_url])),
    cortes: cortesOut,
    logoUrl: settings.logo_url ?? undefined,
    barcodeCounter: settings.barcode_counter,
    saleCounter: settings.sale_counter,
  }
}

export async function replaceFullState(state) {
  const db = getPool()
  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    await conn.query('SET FOREIGN_KEY_CHECKS=0')

    // The client never receives password hashes (see getFullState), so a user object round-tripped
    // through GET -> edit -> PUT has no `password` field unless the caller is actively setting a new
    // one. Capture the existing hashes first so the delete-and-reinsert below doesn't wipe them.
    const [existingUsers] = await conn.query('SELECT id, password FROM users')
    const existingPasswordById = new Map(existingUsers.map((u) => [u.id, u.password]))

    for (const table of ['sale_items', 'sales', 'variant_sizes', 'product_variants', 'product_images', 'products', 'commission_tiers', 'users', 'branches', 'cortes']) {
      await conn.query(`DELETE FROM ${table}`)
    }

    for (const u of state.users) {
      const newPlainPassword = (u.password || '').trim()
      const passwordHash = newPlainPassword
        ? await bcrypt.hash(newPlainPassword, 10)
        : existingPasswordById.get(u.id)
      if (!passwordHash) {
        throw new Error(`El usuario "${u.name}" no tiene contraseña asignada`)
      }
      await conn.query(
        'INSERT INTO users (id,name,username,password,role,branch,commission_mode,custom_commission_percent,active,avatar) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [u.id, u.name, u.username, passwordHash, u.role, u.branch, u.commissionMode, u.customCommissionPercent, u.active ? 1 : 0, u.avatar ?? null]
      )
    }

    for (const t of state.commissionTiers) {
      await conn.query('INSERT INTO commission_tiers (id,min_amount,max_amount,percent) VALUES (?,?,?,?)', [t.id, t.min, t.max, t.percent])
    }

    const branchNames = state.branches ?? []
    for (let i = 0; i < branchNames.length; i++) {
      await conn.query('INSERT INTO branches (name, sort_order, logo_url) VALUES (?,?,?)', [branchNames[i], i, state.branchLogos?.[branchNames[i]] ?? null])
    }

    for (const c of state.cortes ?? []) {
      await conn.query(
        'INSERT INTO cortes (id,branch,performed_at,performed_by,sales_count,total_revenue,cash_total,card_total,sales_snapshot) VALUES (?,?,?,?,?,?,?,?,?)',
        [c.id, c.branch, toMysqlDatetime(c.performedAt), c.performedBy, c.salesCount, c.totalRevenue, c.cashTotal, c.cardTotal, JSON.stringify(c.sales ?? [])]
      )
    }

    for (const p of state.products) {
      await conn.query(
        'INSERT INTO products (id,sku,barcode,name,description,category,gender,price,size_system,active,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        [p.id, p.sku, p.barcode, p.name, p.description, p.category, p.gender, p.price, p.sizeSystem, p.active ? 1 : 0, p.createdAt]
      )
      const images = p.images ?? []
      for (let i = 0; i < images.length; i++) {
        await conn.query('INSERT INTO product_images (product_id, position, image_url) VALUES (?,?,?)', [p.id, i, images[i]])
      }
      for (const v of p.variants) {
        await conn.query('INSERT INTO product_variants (id,product_id,color,color_hex,model) VALUES (?,?,?,?,?)', [v.id, p.id, v.color, v.colorHex, v.model])
        for (const sz of v.sizes) {
          for (const [branch, stock] of Object.entries(sz.stockByBranch ?? {})) {
            await conn.query('INSERT INTO variant_sizes (variant_id,size,branch,stock) VALUES (?,?,?,?)', [v.id, sz.size, branch, stock])
          }
        }
      }
    }

    for (const s of state.sales) {
      await conn.query(
        'INSERT INTO sales (id,sale_date,seller_id,seller_name,branch,subtotal,total,payment_method,cash_amount,card_amount,cash_given) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        [s.id, toMysqlDatetime(s.date), s.sellerId, s.sellerName, s.branch, s.subtotal, s.total, s.paymentMethod, s.cashAmount ?? null, s.cardAmount ?? null, s.cashGiven ?? null]
      )
      for (const it of s.items) {
        await conn.query(
          'INSERT INTO sale_items (cart_id,sale_id,product_id,variant_id,name,price,quantity,color,model,size,is_custom,returned_qty) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
          [it.cartId, s.id, it.productId ?? null, it.variantId ?? null, it.name, it.price, it.quantity, it.color ?? null, it.model ?? null, it.size ?? null, it.isCustom ? 1 : 0, it.returnedQty ?? 0]
        )
      }
    }

    await conn.query(
      'INSERT INTO app_settings (id, logo_url, barcode_counter, sale_counter) VALUES (1, ?, ?, ?) ON DUPLICATE KEY UPDATE logo_url=VALUES(logo_url), barcode_counter=VALUES(barcode_counter), sale_counter=VALUES(sale_counter)',
      [state.logoUrl ?? null, state.barcodeCounter, state.saleCounter]
    )

    await conn.query('SET FOREIGN_KEY_CHECKS=1')
    await conn.commit()
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}

// Verifies username+password against the stored bcrypt hash. Returns the user's id on success,
// or null on any failure (unknown username, wrong password, inactive account) — deliberately not
// distinguishing which, so the login form can't be used to enumerate valid usernames.
export async function authenticateUser(username, plainPassword) {
  const db = getPool()
  const [rows] = await db.query('SELECT id, password, active FROM users WHERE username = ?', [username])
  const user = rows[0]
  if (!user || !user.active) return null
  const matches = await bcrypt.compare(plainPassword || '', user.password)
  return matches ? user.id : null
}
