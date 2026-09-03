// Dev-only data API backing store: reads/writes the MariaDB tables in docker/init/*.sql.
// Mounted into Vite's dev server as middleware (see vite.config.ts) — GET/PUT /api/state.
import mysql from 'mysql2/promise'
import bcrypt from 'bcryptjs'
import { validateState, ValidationError } from './validateState.mjs'

export { ValidationError }

// Thrown when an authenticated caller (see server/session.mjs) tries something their session
// doesn't authorize — distinct from a plain Error so the API layer (vite.config.ts) can answer
// 403 instead of 500.
export class ForbiddenError extends Error {}

// Thrown when a save's `stateVersion` no longer matches the DB's — someone else's save landed
// first. Distinct from a plain Error so the API layer can answer 409 instead of 500/silently
// overwriting. See the version check in replaceFullState below.
export class ConflictError extends Error {}

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

// Self-migrating: `docker-entrypoint-initdb.d` (01-schema.sql) only runs against a brand-new DB
// volume, so a column added there never reaches an already-existing dev database on its own (see
// the Docker section of CLAUDE.md). Running this once per server process means state_version shows
// up on both a fresh `docker compose up` and an existing volume, no manual ALTER TABLE needed.
let schemaEnsured = null
function ensureSchema(db) {
  if (!schemaEnsured) {
    schemaEnsured = db.query('ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS state_version INT NOT NULL DEFAULT 0')
  }
  return schemaEnsured
}

// "2026-07-20T10:31:00.000Z" or "2026-07-08T10:30:00" -> "2026-07-20 10:31:00"
// (no timezone math — treated as a literal wall-clock stamp, matching how the app already handles dates)
function toMysqlDatetime(isoStr) {
  const m = String(isoStr).match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/)
  return m ? `${m[1]} ${m[2]}` : isoStr
}

export async function getFullState() {
  const db = getPool()
  await ensureSchema(db)
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
  const settings = settingsRows[0] || { logo_url: null, barcode_counter: 1000, sale_counter: 0, state_version: 0 }

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
    stateVersion: settings.state_version ?? 0,
  }
}

// `caller` is the { id, role } embedded in the requester's session cookie (see server/session.mjs
// / vite.config.ts's requireSession) — required so this can tell "an admin edited someone" apart
// from "someone edited themselves" apart from "someone edited someone else", since PUT /api/state
// is otherwise just a full-table replace with no per-field ownership of its own.
export async function replaceFullState(state, caller) {
  // Pure structural/sanity checks (no DB needed) — reject before ever taking a connection out of
  // the pool, so a malformed payload can't tie one up.
  validateState(state)

  const db = getPool()
  await ensureSchema(db)
  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    await conn.query('SET FOREIGN_KEY_CHECKS=0')

    // Optimistic-concurrency check: PUT /api/state is a full-table replace with no per-entity
    // granularity, so this row's version is the only thing that can tell "I'm overwriting what I
    // just read" apart from "I'm overwriting someone else's save that landed after I loaded my
    // copy". FOR UPDATE locks the settings row for the rest of this transaction, so two concurrent
    // saves against the same version genuinely serialize here instead of both reading "not stale
    // yet" and both proceeding — the second one blocks until the first commits, then correctly sees
    // itself as stale. Without this, two sellers finishing a sale near-simultaneously (or a sale
    // racing an inventory edit) could silently clobber each other via last-write-wins; with it, the
    // loser gets a clean 409 instead of a silently lost sale or oversold stock.
    const [[settingsRow]] = await conn.query('SELECT state_version FROM app_settings WHERE id = 1 FOR UPDATE')
    const currentVersion = settingsRow?.state_version ?? 0
    if (state.stateVersion !== currentVersion) {
      throw new ConflictError('Los datos cambiaron desde que los cargaste (alguien más guardó primero). Recarga la página e intenta de nuevo.')
    }
    const newVersion = currentVersion + 1

    // The client never receives password hashes (see getFullState), so a user object round-tripped
    // through GET -> edit -> PUT has no `password` field unless the caller is actively setting a new
    // one. Capture the existing hashes first so the delete-and-reinsert below doesn't wipe them.
    const [existingUsers] = await conn.query('SELECT id, password, role FROM users')
    const existingPasswordById = new Map(existingUsers.map((u) => [u.id, u.password]))
    const existingRoleById = new Map(existingUsers.map((u) => [u.id, u.role]))

    // Authorization check, up front, before anything is touched: PUT /api/state carries the whole
    // users table on every save (not just what the caller meant to change), so this is the one
    // place that can tell a real edit from a forged one. Only an admin may create a user or change
    // anyone's role (role must NEVER be self-service — that's exactly the escalation this closes:
    // a non-admin flipping their own `role` to "admin"). A password may be changed by an admin or
    // by the account's own owner, since that's the one self-service case that's actually safe.
    for (const u of state.users) {
      const existingRole = existingRoleById.get(u.id)
      const isNewUser = existingRole === undefined
      const roleChanged = !isNewUser && u.role !== existingRole
      if ((isNewUser || roleChanged) && caller.role !== 'admin') {
        throw new ForbiddenError(
          isNewUser ? 'Solo un administrador puede crear usuarios.' : 'Solo un administrador puede cambiar el rol de un usuario.'
        )
      }
      const newPlainPassword = (u.password || '').trim()
      if (newPlainPassword && caller.role !== 'admin' && caller.id !== u.id) {
        throw new ForbiddenError('Solo puedes cambiar tu propia contraseña, o ser administrador para cambiar la de alguien más.')
      }
    }

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
      'INSERT INTO app_settings (id, logo_url, barcode_counter, sale_counter, state_version) VALUES (1, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE logo_url=VALUES(logo_url), barcode_counter=VALUES(barcode_counter), sale_counter=VALUES(sale_counter), state_version=VALUES(state_version)',
      [state.logoUrl ?? null, state.barcodeCounter, state.saleCounter, newVersion]
    )

    await conn.query('SET FOREIGN_KEY_CHECKS=1')
    await conn.commit()
    return newVersion
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}

// Verifies username+password against the stored bcrypt hash. Returns { id, role } on success, or
// null on any failure (unknown username, wrong password, inactive account) — deliberately not
// distinguishing which, so the login form can't be used to enumerate valid usernames. The role is
// embedded in the session cookie (see server/session.mjs) so per-request auth checks don't need a
// DB round trip just to know who's asking.
export async function authenticateUser(username, plainPassword) {
  const db = getPool()
  const [rows] = await db.query('SELECT id, password, role, active FROM users WHERE username = ?', [username])
  const user = rows[0]
  if (!user || !user.active) return null
  const matches = await bcrypt.compare(plainPassword || '', user.password)
  return matches ? { id: user.id, role: user.role } : null
}
