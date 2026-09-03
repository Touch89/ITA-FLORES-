// Schema/sanity check for the AppState blob PUT /api/state receives, run before replaceFullState
// touches the database (see db.mjs). Without this, replaceFullState trusted the client completely —
// negative prices/stock, out-of-range commission percentages, invalid enum values (role, gender,
// payment method, ...) all got inserted as-is. This isn't a full schema validator (doesn't check
// every string length or cross-entity reference, e.g. a sale's branch existing in state.branches —
// the DB itself doesn't enforce those either); it targets the concrete cases the audit called out
// plus whatever else would otherwise corrupt data or crash the insert loop.
export class ValidationError extends Error {}

function assert(cond, msg) {
  if (!cond) throw new ValidationError(msg)
}
const isStr = (v) => typeof v === 'string' && v.trim().length > 0
const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
const isNonNegNum = (v) => isNum(v) && v >= 0
const isNonNegInt = (v) => Number.isInteger(v) && v >= 0
const isBool = (v) => typeof v === 'boolean'
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

const ROLES = ['admin', 'warehouse', 'seller']
const COMMISSION_MODES = ['tiers', 'custom']
const GENDERS = ['men', 'women', 'unisex', 'accessories']
const SIZE_SYSTEMS = ['sml', 'numeric', 'unica']
const PAYMENT_METHODS = ['cash', 'card', 'mixed']

export function validateState(state) {
  assert(isObj(state), 'El estado recibido no tiene el formato esperado.')
  assert(Array.isArray(state.users), 'users debe ser un arreglo.')
  assert(Array.isArray(state.products), 'products debe ser un arreglo.')
  assert(Array.isArray(state.sales), 'sales debe ser un arreglo.')
  assert(Array.isArray(state.commissionTiers), 'commissionTiers debe ser un arreglo.')
  assert(Array.isArray(state.branches), 'branches debe ser un arreglo.')
  assert(state.cortes === undefined || Array.isArray(state.cortes), 'cortes debe ser un arreglo.')
  assert(isNonNegInt(state.barcodeCounter), 'barcodeCounter debe ser un entero no negativo.')
  assert(isNonNegInt(state.saleCounter), 'saleCounter debe ser un entero no negativo.')

  assert(state.branches.every(isStr), 'Cada sucursal debe ser un texto no vacío.')
  assert(new Set(state.branches).size === state.branches.length, 'Hay sucursales duplicadas.')

  for (const u of state.users) {
    assert(isStr(u.id), 'Un usuario no tiene id válido.')
    assert(isStr(u.name), `El usuario "${u.id}" no tiene nombre.`)
    assert(isStr(u.username), `El usuario "${u.id}" no tiene username.`)
    assert(ROLES.includes(u.role), `Rol inválido para "${u.name}".`)
    assert(isStr(u.branch), `Sucursal inválida para "${u.name}".`)
    assert(COMMISSION_MODES.includes(u.commissionMode), `commissionMode inválido para "${u.name}".`)
    assert(isNum(u.customCommissionPercent) && u.customCommissionPercent >= 0 && u.customCommissionPercent <= 100, `El % de comisión de "${u.name}" está fuera de rango (0-100).`)
    assert(isBool(u.active), `El campo "active" de "${u.name}" es inválido.`)
  }

  for (const t of state.commissionTiers) {
    assert(isStr(t.id), 'Un tier de comisión no tiene id.')
    assert(isNonNegNum(t.min), `El mínimo del tier "${t.id}" es inválido.`)
    assert(t.max === null || (isNonNegNum(t.max) && t.max >= t.min), `El máximo del tier "${t.id}" es inválido.`)
    assert(isNum(t.percent) && t.percent >= 0 && t.percent <= 100, `El % del tier "${t.id}" está fuera de rango (0-100).`)
  }

  for (const p of state.products) {
    assert(isStr(p.id), 'Un producto no tiene id.')
    assert(isStr(p.sku), `El producto "${p.id}" no tiene SKU.`)
    assert(isStr(p.barcode), `El producto "${p.id}" no tiene código de barras.`)
    assert(isStr(p.name), `El producto "${p.id}" no tiene nombre.`)
    assert(GENDERS.includes(p.gender), `Género inválido en "${p.name}".`)
    assert(isNonNegNum(p.price), `El precio de "${p.name}" es inválido o negativo.`)
    assert(SIZE_SYSTEMS.includes(p.sizeSystem), `sizeSystem inválido en "${p.name}".`)
    assert(isBool(p.active), `El campo "active" de "${p.name}" es inválido.`)
    assert(Array.isArray(p.variants), `Las variantes de "${p.name}" no son un arreglo.`)
    assert(p.images === undefined || (Array.isArray(p.images) && p.images.every((i) => typeof i === 'string')), `Las imágenes de "${p.name}" son inválidas.`)

    for (const v of p.variants) {
      assert(isStr(v.id), `Una variante de "${p.name}" no tiene id.`)
      assert(isStr(v.color), `La variante "${v.id}" no tiene color.`)
      assert(isStr(v.model), `La variante "${v.id}" no tiene modelo.`)
      assert(Array.isArray(v.sizes), `Las tallas de la variante "${v.id}" no son un arreglo.`)
      for (const sz of v.sizes) {
        assert(isStr(sz.size), `Una talla de la variante "${v.id}" no tiene nombre.`)
        const stockByBranch = sz.stockByBranch ?? {}
        assert(isObj(stockByBranch), `El stock por sucursal de la talla "${sz.size}" (variante "${v.id}") es inválido.`)
        for (const [branch, stock] of Object.entries(stockByBranch)) {
          assert(isNonNegInt(stock), `Stock inválido o negativo para "${p.name}" / ${v.color} / talla "${sz.size}" / sucursal "${branch}".`)
        }
      }
    }
  }

  for (const s of state.sales) {
    assert(isStr(s.id), 'Una venta no tiene id.')
    assert(isStr(s.sellerId), `La venta "${s.id}" no tiene vendedor.`)
    assert(isStr(s.branch), `La venta "${s.id}" no tiene sucursal.`)
    assert(PAYMENT_METHODS.includes(s.paymentMethod), `Método de pago inválido en la venta "${s.id}".`)
    assert(isNonNegNum(s.subtotal), `Subtotal inválido en la venta "${s.id}".`)
    assert(isNonNegNum(s.total), `Total inválido en la venta "${s.id}".`)
    assert(Array.isArray(s.items) && s.items.length > 0, `La venta "${s.id}" no tiene artículos.`)
    for (const it of s.items) {
      assert(isStr(it.cartId), `Un artículo de la venta "${s.id}" no tiene id.`)
      assert(isStr(it.name), `Un artículo de la venta "${s.id}" no tiene nombre.`)
      assert(isNonNegNum(it.price), `Precio inválido en "${it.name}" (venta "${s.id}").`)
      assert(Number.isInteger(it.quantity) && it.quantity > 0, `Cantidad inválida en "${it.name}" (venta "${s.id}").`)
      assert(
        it.returnedQty === undefined || (Number.isInteger(it.returnedQty) && it.returnedQty >= 0 && it.returnedQty <= it.quantity),
        `Cantidad devuelta inválida en "${it.name}" (venta "${s.id}").`
      )
    }
  }

  for (const c of state.cortes ?? []) {
    assert(isStr(c.id), 'Un corte no tiene id.')
    assert(isStr(c.branch), `El corte "${c.id}" no tiene sucursal.`)
    assert(isNonNegInt(c.salesCount), `salesCount inválido en el corte "${c.id}".`)
    assert(isNonNegNum(c.totalRevenue), `totalRevenue inválido en el corte "${c.id}".`)
    assert(isNonNegNum(c.cashTotal), `cashTotal inválido en el corte "${c.id}".`)
    assert(isNonNegNum(c.cardTotal), `cardTotal inválido en el corte "${c.id}".`)
  }
}
