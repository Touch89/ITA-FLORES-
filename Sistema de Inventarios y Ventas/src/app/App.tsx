import React, {
  useState, useContext, createContext, useEffect, useRef, useMemo,
} from "react";
import {
  ShoppingCart, Package, ClipboardList, Users, LayoutDashboard,
  Plus, Minus, Trash2, Search, X, ChevronDown, LogOut, Edit2,
  Eye, EyeOff, Clock, CreditCard, Banknote, ArrowLeft,
  Save, Hash, Layers, MapPin, ChevronRight, ChevronLeft, Tag, Check,
  Filter, SlidersHorizontal, AlertCircle, Store, Calendar,
  TrendingUp, Boxes, RotateCcw, Printer, UserCog, ShieldCheck,
  Warehouse, ChevronUp, Circle, Barcode, ImageIcon, ArrowLeftRight, Combine, Percent, Loader2,
} from "lucide-react";
import { Toaster, toast } from "sonner";

// ─── TYPES ───────────────────────────────────────────────────────────────────

type UserRole = "admin" | "warehouse" | "seller";
type Gender = "men" | "women" | "unisex" | "accessories";
type PaymentMethod = "cash" | "card" | "mixed";
type View = "pos" | "inventory" | "history" | "users" | "commissions" | "branches";

interface User {
  id: string;
  name: string;
  username: string;
  // Never sent by the server (see server/db.mjs getFullState) — only present on the client
  // when actively setting a new password (new user, or a password change in UsersView).
  password?: string;
  role: UserRole;
  branch: string;
  commissionMode: "tiers" | "custom";
  customCommissionPercent: number;
  active: boolean;
  avatar?: string;
}

interface CommissionTier {
  id: string;
  min: number;
  max: number | null; // null = sin límite superior
  percent: number;
}

interface VariantSize {
  size: string;
  stockByBranch: Record<string, number>;
}

interface ProductVariant {
  id: string;
  color: string;
  colorHex: string;
  model: string;
  sizes: VariantSize[];
}

type SizeSystem = "sml" | "numeric" | "unica";

interface Product {
  id: string;
  sku: string;
  barcode: string;
  name: string;
  description: string;
  category: string;
  gender: Gender;
  price: number;
  sizeSystem: SizeSystem;
  variants: ProductVariant[];
  images: string[];
  active: boolean;
  createdAt: string;
}

interface CartItem {
  cartId: string;
  productId?: string;
  variantId?: string;
  name: string;
  price: number;
  quantity: number;
  color?: string;
  model?: string;
  size?: string;
  isCustom?: boolean;
  returnedQty?: number;
}

interface Sale {
  id: string;
  date: string;
  sellerId: string;
  sellerName: string;
  branch: string;
  items: CartItem[];
  subtotal: number;
  total: number;
  paymentMethod: PaymentMethod;
  cashAmount?: number;
  cardAmount?: number;
  // Only set for a plain "cash" sale — how much the customer handed over, so the receipt can show
  // "Efectivo recibido"/"Cambio" the same way the payment modal does live before confirming.
  cashGiven?: number;
}

// A frozen per-sale line within a Corte — snapshotted at cut time so a corte's breakdown stays
// accurate even if the underlying Sale is later edited, returned against, or deleted.
interface CorteSaleSummary {
  id: string;
  branch: string;
  total: number;
  paymentMethod: PaymentMethod;
  itemsLabel: string;
}

// A "corte de caja" is a repeatable, non-destructive snapshot of a branch's sales for the current
// day up to the moment it's generated — not a locking/closing operation, so staff can run another
// one later the same day (e.g. a last-minute sale after an earlier cut) without anything breaking.
interface Corte {
  id: string;
  branch: string;
  performedAt: string;
  performedBy: string;
  salesCount: number;
  totalRevenue: number;
  cashTotal: number;
  cardTotal: number;
  sales: CorteSaleSummary[];
  // Snapshotted at cut time (not re-derived later) — same reasoning as `sales` above: editing the
  // day's fondo or adding a movimiento after this corte was made shouldn't rewrite its history.
  fondoAmount: number;
  entradas: number;
  salidas: number;
}

// One opening cash float per branch per calendar day ("YYYY-MM-DD"), freely editable all day (no
// lock) — a corte just snapshots whatever it was at the moment the cut was made, so an edit here
// never retroactively changes a past corte's printed numbers.
interface CajaFondo {
  id: string;
  branch: string;
  date: string;
  amount: number;
  setBy: string;
  setAt: string;
}

// An ad-hoc cash movement against a branch's till — a manual top-up ("in") or a cash expense paid
// straight out of the drawer ("out", e.g. cleaning supplies) — factored into the corte's expected
// cash total alongside the fondo and the day's cash sales.
interface CajaMovimiento {
  id: string;
  branch: string;
  type: "in" | "out";
  amount: number;
  concept: string;
  performedBy: string;
  performedAt: string;
}

interface AppState {
  users: User[];
  products: Product[];
  sales: Sale[];
  commissionTiers: CommissionTier[];
  branches: string[];
  branchLogos: Record<string, string>;
  cortes: Corte[];
  cajaFondos: CajaFondo[];
  cajaMovimientos: CajaMovimiento[];
  logoUrl?: string;
  barcodeCounter: number;
  saleCounter: number;
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  "Camisetas","Pantalones","Vestidos","Blusas","Faldas","Chaquetas",
  "Abrigos","Ropa Interior","Deportiva","Relojes","Joyería","Bolsos",
  "Cinturones","Accesorios",
];
const GENDERS: { value: Gender; label: string }[] = [
  { value: "men", label: "Hombre" },
  { value: "women", label: "Mujer" },
  { value: "unisex", label: "Unisex" },
  { value: "accessories", label: "Accesorios" },
];
const SIZES = ["XS","S","M","L","XL","XXL","Única","28","30","32","34","36","38","40","42","44"];
const SIZE_SYSTEMS: { value: SizeSystem; label: string; desc: string; sizes: string[] }[] = [
  { value: "sml",     label: "S / M / L",  desc: "XS · S · M · L · XL · XXL",              sizes: ["XS","S","M","L","XL","XXL"] },
  { value: "numeric", label: "Numérico",   desc: "28 · 30 · 32 · 34 · 36 · 38 · 40 · 42 · 44", sizes: ["28","30","32","34","36","38","40","42","44"] },
  { value: "unica",   label: "Talla Única",desc: "Una sola talla",                           sizes: ["Única"] },
];
const sizesForSystem = (sys: SizeSystem): string[] => SIZE_SYSTEMS.find((s) => s.value === sys)?.sizes ?? ["S","M","L"];
const PRESET_COLORS = [
  { name: "Negro", hex: "#1a1a1a" },
  { name: "Blanco", hex: "#F5F5F0" },
  { name: "Gris", hex: "#9E9E9E" },
  { name: "Azul Marino", hex: "#1B3A6B" },
  { name: "Azul Cielo", hex: "#64B5F6" },
  { name: "Rojo", hex: "#E53935" },
  { name: "Rosa", hex: "#FF69B4" },
  { name: "Verde", hex: "#4CAF50" },
  { name: "Verde Menta", hex: "#80CBC4" },
  { name: "Amarillo", hex: "#FDD835" },
  { name: "Naranja", hex: "#FF7043" },
  { name: "Morado", hex: "#9C27B0" },
  { name: "Beige", hex: "#D4B896" },
  { name: "Café", hex: "#795548" },
  { name: "Dorado", hex: "#FFD700" },
  { name: "Plateado", hex: "#C0C0C0" },
];

const STORE = {
  name: "ITA FLORES",
  slogan: "Viste con estilo · Vive con clase",
  location: "Plaza Americana",
  address: "Hotel Fiesta, Americana, C. 56-A 451-Loc 24 interior, Zona Paseo Montejo, Centro, 97000 Mérida, Yuc.",
  phone: "999 149 3433",
  email: "ventas@modaelite.com",
};

// Seed/demo data used to live here as JS constants; it's now exclusively in
// docker/init/02-seed.sql — MariaDB is the source of truth via GET/PUT /api/state.

// ─── PERSISTENCE ──────────────────────────────────────────────────────────────
// Business data (users, products, sales, commission tiers, logo/settings) lives in MariaDB,
// served through the dev-only GET/PUT /api/state middleware (see vite.config.ts + server/db.mjs).
// The only thing still in localStorage is which user is logged in on this browser — session
// state, not business data.

const AUTH_KEY = "moda_auth_v2";

const loadState = async (): Promise<AppState> => {
  const res = await fetch("/api/state");
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "No se pudo cargar la información desde la base de datos");
  }
  return res.json();
};

// PUT /api/state rewrites every table on each call, so two overlapping requests can conflict
// against each other in MariaDB (observed as "Record has changed since last read" / ER_CHECKREAD)
// if the caller fires saveState several times in quick succession (e.g. adding a few branches back
// to back). Serializing so only one PUT is ever in flight — with later calls collapsing into just
// the most recent state once it's free — avoids that without changing any of the ~30 call sites.
let saveInFlight: Promise<void> | null = null;
let pendingSaveState: AppState | null = null;

const performSave = (s: AppState): Promise<void> =>
  fetch("/api/state", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(s),
  })
    .then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Error al guardar en la base de datos");
      }
    })
    .catch((err) => toast.error(err instanceof Error ? err.message : "Error al guardar los cambios"));

const saveState = (s: AppState) => {
  if (saveInFlight) {
    pendingSaveState = s;
    return;
  }
  saveInFlight = performSave(s).then(() => {
    saveInFlight = null;
    if (pendingSaveState) {
      const next = pendingSaveState;
      pendingSaveState = null;
      saveState(next);
    }
  });
};

// ─── CONTEXT ──────────────────────────────────────────────────────────────────

interface Ctx {
  state: AppState;
  currentUser: User | null;
  login: (username: string, pw: string) => Promise<boolean>;
  logout: () => void;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}
const AppCtx = createContext<Ctx>(null!);
const useApp = () => useContext(AppCtx);

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d: string) =>
  new Date(d).toLocaleString("es-MX", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" });

// Local (not UTC) "YYYY-MM-DD" — matches what an <input type="date"> reads/writes, so a sale's
// timestamp and the picker's value can be compared directly regardless of timezone offset.
const dateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const todayDateStr = () => dateStr(new Date());

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

// Whole-pesos-only numeric text input: strips anything non-digit, then any leading zero that isn't
// the whole value (so typing over a stray "0" can't produce "0500" instead of "500").
const digitsOnly = (v: string) => v.replace(/\D/g, "").replace(/^0+(?=\d)/, "");

type UploadCategory = "articulos" | "logos" | "usuarios";

const uploadImage = async (file: File, category: UploadCategory, previousUrl?: string): Promise<string> => {
  const formData = new FormData();
  formData.append("file", file);
  if (previousUrl) formData.append("previousUrl", previousUrl);
  const res = await fetch(`/api/upload/${category}`, { method: "POST", body: formData });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Error al subir la imagen");
  return data.url as string;
};

const sizeStockAt = (sz: VariantSize, branch: string) => sz.stockByBranch?.[branch] ?? 0;
const sizeStockTotal = (sz: VariantSize) => Object.values(sz.stockByBranch ?? {}).reduce((a, b) => a + b, 0);
const totalVariantStock = (v: ProductVariant, branch?: string) =>
  (v.sizes ?? []).reduce((s, sz) => s + (branch ? sizeStockAt(sz, branch) : sizeStockTotal(sz)), 0);
const totalProductStock = (p: Product, branch?: string) => p.variants.reduce((s, v) => s + totalVariantStock(v, branch), 0);

const gLabel = (g: Gender) => ({ men:"Hombre", women:"Mujer", unisex:"Unisex", accessories:"Accesorios" }[g]);
const rLabel = (r: UserRole) => ({ admin:"Administrador", warehouse:"Jefe Almacén", seller:"Vendedor" }[r]);
const pLabel = (p: PaymentMethod) => ({ cash:"Efectivo", card:"Tarjeta", mixed:"Efectivo + Tarjeta" }[p] ?? "—");

const roleBadge = (r: UserRole) => ({
  admin: "bg-rose-500/20 text-rose-400 border border-rose-500/30",
  warehouse: "bg-amber-500/20 text-amber-400 border border-amber-500/30",
  seller: "bg-sky-500/20 text-sky-400 border border-sky-500/30",
}[r]);

const genderBadge = (g: Gender) => ({
  men: "bg-sky-500/20 text-sky-400",
  women: "bg-pink-500/20 text-pink-400",
  unisex: "bg-violet-500/20 text-violet-400",
  accessories: "bg-amber-500/20 text-amber-400",
}[g]);

const BRANCH_STROKE = "[-webkit-text-stroke:0.6px_black] [paint-order:stroke_fill]";

const BranchLabel = ({ branch, className = "" }: { branch: string; className?: string }) => {
  if (branch === "Mexicane") {
    return (
      <span className={className}>
        <span className={`text-emerald-500 ${BRANCH_STROKE}`}>Mex</span>
        <span className={`text-white ${BRANCH_STROKE}`}>ica</span>
        <span className={`text-red-500 ${BRANCH_STROKE}`}>ne</span>
      </span>
    );
  }
  const color = {
    "Ita Flores": "text-amber-400",
    "Dos corazones": "text-rose-500",
    "Don Carlos": "text-orange-500",
  }[branch] ?? "";
  return <span className={`${color} ${BRANCH_STROKE} ${className}`}>{branch}</span>;
};

// ─── UI PRIMITIVES ────────────────────────────────────────────────────────────

const Btn = ({
  children, onClick, variant = "primary", size = "md", className = "", disabled = false, type = "button",
}: {
  children: React.ReactNode; onClick?: () => void; variant?: "primary"|"secondary"|"ghost"|"danger"|"outline";
  size?: "sm"|"md"|"lg"; className?: string; disabled?: boolean; type?: "button"|"submit";
}) => {
  const base = "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-150 select-none";
  const sizes = { sm:"px-3 py-1.5 text-xs", md:"px-4 py-2.5 text-sm", lg:"px-6 py-3 text-base" };
  const variants = {
    primary: "bg-primary text-white hover:bg-rose-600 active:scale-95 shadow-lg shadow-rose-900/30",
    secondary: "bg-secondary text-foreground hover:bg-accent active:scale-95",
    ghost: "text-muted-foreground hover:text-foreground hover:bg-accent active:scale-95",
    danger: "bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 active:scale-95",
    outline: "border border-border text-foreground hover:bg-accent active:scale-95",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${sizes[size]} ${variants[variant]} ${disabled ? "opacity-40 cursor-not-allowed" : ""} ${className}`}
    >
      {children}
    </button>
  );
};

const Input = ({
  label, value, onChange, placeholder, type = "text", className = "", icon, min, step, inputMode, onFocus,
}: {
  label?: string; value: string | number; onChange: (v: string) => void; placeholder?: string;
  type?: string; className?: string; icon?: React.ReactNode; min?: number; step?: number;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]; onFocus?: React.FocusEventHandler<HTMLInputElement>;
}) => (
  <div className={`flex flex-col gap-1.5 ${className}`}>
    {label && <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</label>}
    <div className="relative">
      {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{icon}</span>}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        placeholder={placeholder}
        min={min}
        step={step}
        inputMode={inputMode}
        className={`w-full bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 transition-all ${icon ? "pl-9" : ""}`}
      />
    </div>
  </div>
);

const Select = ({
  label, value, onChange, options, className = "",
}: {
  label?: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; className?: string;
}) => (
  <div className={`flex flex-col gap-1.5 ${className}`}>
    {label && <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</label>}
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 appearance-none pr-8"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
    </div>
  </div>
);

const Modal = ({
  open, onClose, title, children, wide = false, closeOnBackdrop = true,
}: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean; closeOnBackdrop?: boolean;
}) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closeOnBackdrop ? onClose : undefined} />
      <div className={`relative z-10 bg-card border border-border rounded-t-2xl sm:rounded-2xl w-full ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"} max-h-[92vh] flex flex-col shadow-2xl`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <h3 className="font-semibold text-base text-foreground">{title}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-accent transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto scrollbar-visible flex-1">{children}</div>
      </div>
    </div>
  );
};

const Badge = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${className}`}>{children}</span>
);

const StockBadge = ({ stock }: { stock: number }) => {
  if (stock === 0) return <Badge className="bg-red-500/20 text-red-400">Sin stock</Badge>;
  if (stock <= 5) return <Badge className="bg-amber-500/20 text-amber-400">{stock} pzs</Badge>;
  return <Badge className="bg-emerald-500/20 text-emerald-400">{stock} pzs</Badge>;
};

const EmptyState = ({ icon: Icon, title, desc }: { icon: React.ElementType; title: string; desc?: string }) => (
  <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
    <div className="p-4 rounded-2xl bg-secondary"><Icon size={28} className="text-muted-foreground" /></div>
    <div>
      <p className="font-semibold text-foreground">{title}</p>
      {desc && <p className="text-sm text-muted-foreground mt-0.5">{desc}</p>}
    </div>
  </div>
);

// ─── IMAGE UPLOAD ─────────────────────────────────────────────────────────────

const ImageUpload = ({
  images, onChange,
}: {
  images: string[]; onChange: (imgs: string[]) => void;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const urls = await Promise.all(Array.from(files).map((file) => uploadImage(file, "articulos")));
      onChange([...images, ...urls]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al subir la imagen");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2 flex-wrap">
        {images.map((img, i) => (
          <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-border group flex-shrink-0">
            <img src={img} alt="" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(images.filter((_, j) => j !== i))}
              className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white"
            >
              <X size={16} />
            </button>
            {i === 0 && (
              <span className="absolute bottom-1 left-1 text-[9px] bg-primary text-white px-1 rounded font-bold">PRINCIPAL</span>
            )}
          </div>
        ))}
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="w-20 h-20 rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 flex flex-col items-center justify-center text-muted-foreground hover:text-primary transition-all gap-1 flex-shrink-0 disabled:opacity-50 disabled:cursor-wait"
        >
          <ImageIcon size={18} />
          <span className="text-[10px] font-semibold">{uploading ? "Subiendo…" : "Agregar"}</span>
        </button>
      </div>
      <p className="text-xs text-muted-foreground">La primera imagen es la principal. Soporta JPG, PNG y WebP.</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
};

// ─── AVATAR ───────────────────────────────────────────────────────────────────

const Avatar = ({
  user, size = "md",
}: {
  user: Pick<User, "name" | "avatar">; size?: "xs" | "sm" | "md" | "lg" | "xl";
}) => {
  const sizes = { xs: "w-6 h-6 text-[10px]", sm: "w-8 h-8 text-xs", md: "w-10 h-10 text-sm", lg: "w-14 h-14 text-lg", xl: "w-20 h-20 text-2xl" };
  const initials = user.name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <div className={`${sizes[size]} rounded-full flex-shrink-0 overflow-hidden border border-border bg-secondary`}>
      {user.avatar ? (
        <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center font-bold text-foreground bg-gradient-to-br from-primary/30 to-primary/10">
          {initials}
        </div>
      )}
    </div>
  );
};

const AvatarUpload = ({
  avatar, name, onChange,
}: {
  avatar?: string; name: string; onChange: (img: string | undefined) => void;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImage(file, "usuarios");
      onChange(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al subir la foto");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="flex items-center gap-4">
      <div className="relative group cursor-pointer" onClick={() => !uploading && inputRef.current?.click()}>
        <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-border bg-secondary flex items-center justify-center">
          {avatar ? (
            <img src={avatar} alt={name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/30 to-primary/10 font-bold text-2xl text-foreground">
              {name.split(" ").slice(0, 2).map((w) => w[0] ?? "").join("").toUpperCase() || "?"}
            </div>
          )}
        </div>
        <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <ImageIcon size={18} className="text-white" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Btn size="sm" variant="outline" disabled={uploading} onClick={() => inputRef.current?.click()}>
          <ImageIcon size={13} /> {uploading ? "Subiendo…" : avatar ? "Cambiar foto" : "Subir foto"}
        </Btn>
        {avatar && (
          <Btn size="sm" variant="danger" onClick={() => onChange(undefined)}>
            <X size={13} /> Quitar foto
          </Btn>
        )}
        <p className="text-xs text-muted-foreground">JPG, PNG o WebP</p>
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files)} />
    </div>
  );
};

// ─── PRODUCT DETAIL MODAL ─────────────────────────────────────────────────────

const ProductDetailModal = ({
  product, onClose, onAddToCart,
}: {
  product: Product; onClose: () => void; onAddToCart?: (p: Product) => void;
}) => {
  const { state } = useApp();
  const [imgIdx, setImgIdx] = useState(0);
  const totalStock = totalProductStock(product);
  const colors = [...new Set(product.variants.map((v) => v.color))];

  useEffect(() => { setImgIdx(0); }, [product.id]);

  return (
    <Modal open title="" onClose={onClose} wide>
      <div className="flex flex-col">
        {/* Image gallery */}
        <div className="relative bg-secondary/50 overflow-hidden" style={{ minHeight: 220 }}>
          {(product.images ?? []).length > 0 ? (
            <>
              <img
                src={(product.images ?? [])[imgIdx]}
                alt={product.name}
                className="w-full object-cover"
                style={{ maxHeight: 300, minHeight: 200, objectFit: "cover" }}
              />
              {(product.images ?? []).length > 1 && (
                <>
                  <button
                    onClick={() => setImgIdx((i) => Math.max(0, i - 1))}
                    disabled={imgIdx === 0}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center text-white transition-all disabled:opacity-30"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    onClick={() => setImgIdx((i) => Math.min((product.images ?? []).length - 1, i + 1))}
                    disabled={imgIdx === (product.images ?? []).length - 1}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center text-white transition-all disabled:opacity-30"
                  >
                    <ChevronRight size={18} />
                  </button>
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                    {(product.images ?? []).map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setImgIdx(i)}
                        className={`h-1.5 rounded-full transition-all ${i === imgIdx ? "bg-white w-4" : "bg-white/50 w-1.5"}`}
                      />
                    ))}
                  </div>
                </>
              )}
              {/* Thumbnail strip */}
              {(product.images ?? []).length > 1 && (
                <div className="absolute bottom-8 left-0 right-0 px-3 flex gap-2 overflow-x-auto">
                  {(product.images ?? []).map((img, i) => (
                    <button
                      key={i}
                      onClick={() => setImgIdx(i)}
                      className={`w-11 h-11 flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all ${i === imgIdx ? "border-primary" : "border-white/20 opacity-60 hover:opacity-100"}`}
                    >
                      <img src={img} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="w-full flex flex-col items-center justify-center text-muted-foreground/30 gap-3 py-16">
              <Package size={48} />
              <span className="text-sm">Sin imágenes</span>
            </div>
          )}
          <div className="absolute top-3 left-3">
            <Badge className={genderBadge(product.gender)}>{gLabel(product.gender)}</Badge>
          </div>
          <div className="absolute top-3 right-3">
            <StockBadge stock={totalStock} />
          </div>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-lg text-foreground leading-tight">{product.name}</h3>
              <p className="text-sm text-muted-foreground mt-1">{product.description}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="font-bold text-2xl text-primary">{fmt(product.price)}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Badge className="bg-secondary text-muted-foreground"><Tag size={10} /> {product.category}</Badge>
            <span className="font-mono text-xs bg-secondary border border-border text-muted-foreground px-2 py-1 rounded-lg">SKU: {product.sku}</span>
            <span className="font-mono text-xs bg-secondary border border-border text-muted-foreground px-2 py-1 rounded-lg">{product.barcode}</span>
          </div>

          {/* Colors */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Colores disponibles</p>
            <div className="flex gap-2 flex-wrap">
              {colors.map((color) => {
                const hex = product.variants.find((v) => v.color === color)?.colorHex ?? "#888";
                const stock = product.variants.filter((v) => v.color === color).reduce((s, v) => s + totalVariantStock(v), 0);
                return (
                  <div key={color} className="flex items-center gap-2 bg-secondary rounded-lg px-2.5 py-1.5">
                    <span className="w-3.5 h-3.5 rounded-full border border-white/20 flex-shrink-0" style={{ background: hex }} />
                    <span className="text-xs text-foreground">{color}</span>
                    <StockBadge stock={stock} />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Variants + per-branch/size stock breakdown */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Variantes, tallas y sucursales</p>
            <div className="bg-secondary rounded-xl overflow-hidden border border-border divide-y divide-border/50">
              {product.variants.map((v) => (
                <div key={v.id} className="px-3 py-2.5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="w-3.5 h-3.5 rounded-full flex-shrink-0 border border-white/10" style={{ background: v.colorHex }} />
                    <span className="text-xs font-semibold text-foreground flex-1">{v.color} · {v.model}</span>
                    <StockBadge stock={totalVariantStock(v)} />
                  </div>
                  <div className="pl-5 flex flex-col gap-1">
                    {v.sizes.map((sz) => {
                      const branchEntries = state.branches.map((b) => ({ b, qty: sizeStockAt(sz, b) })).filter((e) => e.qty > 0);
                      return (
                        <div key={sz.size} className="flex items-center gap-2 text-xs flex-wrap">
                          <span className="font-mono font-bold text-muted-foreground w-8 flex-shrink-0 uppercase">{sz.size}</span>
                          {branchEntries.length === 0 ? (
                            <span className="text-red-400">Sin stock en ninguna sucursal</span>
                          ) : branchEntries.map(({ b, qty }) => (
                            <span key={b} className="bg-background border border-border rounded-full px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                              {b.replace("Sucursal ", "")}: {qty}
                            </span>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <Btn onClick={onClose} variant="secondary" className="flex-1">Cerrar</Btn>
            {onAddToCart && totalStock > 0 && (
              <Btn onClick={() => { onClose(); onAddToCart(product); }} className="flex-1">
                <ShoppingCart size={15} /> Agregar al carrito
              </Btn>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};

// ─── LOGIN VIEW ───────────────────────────────────────────────────────────────

const LoginView = ({ onLogin }: { onLogin: (u: User) => void }) => {
  const { state, login } = useApp();
  const [username, setUsername] = useState("");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoggingIn(true);
    try {
      if (await login(username, pw)) {
        const u = state.users.find((u) => u.username === username && u.active)!;
        onLogin(u);
      } else {
        setError("Credenciales incorrectas o cuenta inactiva.");
      }
    } catch {
      setError("No se pudo conectar con el servidor. Intenta de nuevo.");
    } finally {
      setLoggingIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 mb-4 overflow-hidden">
            {state.logoUrl ? (
              <img src={state.logoUrl} alt={STORE.name} className="w-full h-full object-cover object-[85%_50%]" />
            ) : (
              <Store size={32} className="text-primary" />
            )}
          </div>
          <h1 className="text-2xl font-bold text-foreground">{STORE.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">{STORE.slogan}</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-6 shadow-xl shadow-black/30">
          <h2 className="text-lg font-semibold mb-5">Iniciar sesión</h2>
          <form onSubmit={handle} className="flex flex-col gap-4">
            <Input label="Usuario" value={username} onChange={setUsername} placeholder="usuario" icon={<UserCog size={15} />} />
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contraseña</label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 transition-all"
                />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
                <AlertCircle size={15} /> {error}
              </div>
            )}
            <Btn type="submit" size="lg" disabled={loggingIn} className="mt-1 w-full">{loggingIn ? "Entrando…" : "Entrar"}</Btn>
          </form>
          <div className="mt-5 pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground text-center mb-3">Cuentas de demostración:</p>
            <div className="flex flex-col gap-2">
              {[
                { username:"admin", pw:"admin123", role:"Administrador" },
                { username:"almacen", pw:"almacen123", role:"Jefe Almacén" },
                { username:"vendedor", pw:"vendedor123", role:"Vendedor" },
              ].map((d) => (
                <button key={d.username} onClick={() => { setUsername(d.username); setPw(d.pw); }} className="text-left text-xs bg-secondary hover:bg-accent border border-border rounded-lg px-3 py-2 transition-colors">
                  <span className="font-semibold text-foreground">{d.role}</span>
                  <span className="text-muted-foreground ml-2">{d.username}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── NAVIGATION ───────────────────────────────────────────────────────────────

const NAV_ITEMS: { view: View; label: string; icon: React.ElementType; roles: UserRole[] }[] = [
  { view:"pos",       label:"Venta",      icon:ShoppingCart,    roles:["admin","warehouse","seller"] },
  { view:"inventory", label:"Inventario", icon:Layers,          roles:["admin","warehouse","seller"] },
  { view:"history",   label:"Historial",  icon:ClipboardList,   roles:["admin","warehouse","seller"] },
  { view:"commissions", label:"Comisiones", icon:Percent,       roles:["admin"] },
  { view:"users",     label:"Usuarios",   icon:Users,           roles:["admin"] },
  { view:"branches",  label:"Sucursales", icon:Warehouse,       roles:["admin"] },
];

const BottomNav = ({ view, setView, role }: { view: View; setView: (v: View) => void; role: UserRole }) => {
  const items = NAV_ITEMS.filter((n) => n.roles.includes(role));
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-lg border-t border-border safe-area-pb">
      <div className="flex items-center justify-around px-2 py-1">
        {items.map((item) => {
          const active = view === item.view;
          return (
            <button
              key={item.view}
              onClick={() => setView(item.view)}
              className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-all ${
                active ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <item.icon size={20} strokeWidth={active ? 2.5 : 1.8} />
              <span className="text-[10px] font-semibold">{item.label}</span>
              {active && <span className="absolute bottom-1 w-1 h-1 rounded-full bg-primary" />}
            </button>
          );
        })}
      </div>
    </nav>
  );
};

const SideNav = ({ view, setView, role, user, onLogout, logoUrl, onChangeLogo }: {
  view: View; setView: (v: View) => void; role: UserRole; user: User; onLogout: () => void;
  logoUrl?: string; onChangeLogo?: (url: string | undefined) => void;
}) => {
  const items = NAV_ITEMS.filter((n) => n.roles.includes(role));
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const handleLogoFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file || !onChangeLogo) return;
    setUploadingLogo(true);
    try {
      onChangeLogo(await uploadImage(file, "logos", logoUrl));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al subir el logo");
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  };

  return (
    <aside className="hidden lg:flex flex-col w-56 h-screen bg-sidebar border-r border-sidebar-border fixed left-0 top-0 z-40">
      <div className="p-5 border-b border-sidebar-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <div
            className={`relative w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0 overflow-hidden group ${onChangeLogo ? "cursor-pointer" : ""}`}
            onClick={() => onChangeLogo && !uploadingLogo && logoInputRef.current?.click()}
            title={onChangeLogo ? "Cambiar logo" : undefined}
          >
            {logoUrl ? (
              <img src={logoUrl} alt={STORE.name} className="w-full h-full object-cover object-[85%_50%]" />
            ) : (
              <Store size={18} className="text-primary" />
            )}
            {onChangeLogo && (
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <ImageIcon size={14} className="text-white" />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="font-bold text-sm text-foreground leading-tight">{STORE.name}</p>
            <p className="text-xs text-muted-foreground truncate"><BranchLabel branch={user.branch} /></p>
          </div>
        </div>
        {onChangeLogo && (
          <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleLogoFile(e.target.files)} />
        )}
      </div>
      <nav className="flex-1 overflow-y-auto scrollbar-visible p-3 flex flex-col gap-1">
        {items.map((item) => {
          const active = view === item.view;
          return (
            <button
              key={item.view}
              onClick={() => setView(item.view)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left ${
                active ? "bg-primary/10 text-primary border border-primary/20" : "text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
            >
              <item.icon size={17} strokeWidth={active ? 2.5 : 1.8} />
              {item.label}
            </button>
          );
        })}
      </nav>
      <div className="p-3 border-t border-sidebar-border flex-shrink-0">
        <div className="flex items-center gap-3 px-2 py-2 mb-1">
          <Avatar user={user} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-foreground truncate">{user.name}</p>
            <Badge className={`${roleBadge(user.role)} text-[10px] px-1.5 py-0`}>{rLabel(user.role)}</Badge>
          </div>
        </div>
        <button onClick={onLogout} className="flex items-center gap-2 px-3 py-2 w-full rounded-xl text-sm text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all">
          <LogOut size={15} /> Cerrar sesión
        </button>
      </div>
    </aside>
  );
};

// ─── RECEIPT ──────────────────────────────────────────────────────────────────

// Printed tickets open in a bare popup window with none of the app's stylesheet loaded, so Tailwind
// classes on the printable content silently do nothing there (only affects on-screen rendering) —
// these plain inline styles are what actually reach the printed page via .innerHTML, and happen to
// double as the on-screen look too, which is fine since a "ticket" should read like paper either way.
const tk: Record<string, React.CSSProperties> = {
  wrap: { fontFamily: "'Courier New', monospace", fontSize: 12, color: "#000", lineHeight: 1.6 },
  center: { textAlign: "center" },
  bold: { fontWeight: 700 },
  semibold: { fontWeight: 600 },
  muted: { color: "#666" },
  row: { display: "flex", justifyContent: "space-between" },
  hr: { borderTop: "1px dashed #000", margin: "10px 0" },
  header: { fontSize: 16, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" },
  section: { fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 },
  small: { fontSize: 10 },
  base: { fontSize: 14 },
};

const ReceiptModal = ({ sale, onClose }: { sale: Sale; onClose: () => void }) => {
  const printRef = useRef<HTMLDivElement>(null);

  const doPrint = () => {
    const w = window.open("", "_blank", "width=400,height=700");
    if (!w || !printRef.current) return;
    w.document.write(`
      <!DOCTYPE html><html><head>
      <style>* { margin: 0; padding: 0; box-sizing: border-box; } body { background: #fff; padding: 10px; width: 300px; }</style>
      </head><body>${printRef.current.innerHTML}</body></html>`);
    w.document.close();
    w.focus();
    w.print();
    w.close();
  };

  return (
    <Modal open title="Ticket de Venta" onClose={onClose}>
      <div className="p-5">
        <div ref={printRef} style={tk.wrap}>
          <div style={{ ...tk.center, marginBottom: 12 }}>
            <p style={tk.header}>{sale.branch}</p>
            {sale.branch !== "Ita Flores" && <p style={tk.muted}>por Ita Flores</p>}
            <p style={{ ...tk.muted, marginTop: 4 }}>{STORE.location}</p>
            <p style={tk.muted}>{STORE.address}</p>
            <p style={tk.muted}>{STORE.phone}</p>
          </div>
          <div style={tk.hr} />
          <div style={{ ...tk.row, marginBottom: 4 }}>
            <span style={tk.muted}>Folio:</span>
            <span style={tk.semibold}>{sale.id.toUpperCase()}</span>
          </div>
          <div style={{ ...tk.row, marginBottom: 4 }}>
            <span style={tk.muted}>Fecha:</span>
            <span>{fmtDate(sale.date)}</span>
          </div>
          <div style={{ ...tk.row, marginBottom: 4 }}>
            <span style={tk.muted}>Vendedor:</span>
            <span>{sale.sellerName}</span>
          </div>
          <div style={{ ...tk.row, marginBottom: 4 }}>
            <span style={tk.muted}>Sucursal:</span>
            <span>{sale.branch}</span>
          </div>
          <div style={tk.hr} />
          <p style={tk.section}>Artículos</p>
          {sale.items.map((item) => (
            <div key={item.cartId} style={{ marginBottom: 8 }}>
              <div style={tk.row}>
                <span style={{ ...tk.semibold, flex: 1, paddingRight: 8 }}>{item.name}</span>
                <span style={tk.semibold}>{fmt(item.price * item.quantity)}</span>
              </div>
              <div style={{ ...tk.row, ...tk.muted }}>
                <span>{item.quantity} × {fmt(item.price)}{item.color ? ` · ${item.color}` : ""}{item.size && item.size !== "Único" ? ` / ${item.size}` : ""}</span>
              </div>
            </div>
          ))}
          <div style={tk.hr} />
          <div style={{ ...tk.row, marginBottom: 4, fontSize: 13 }}>
            <span style={tk.muted}>Subtotal</span>
            <span>{fmt(sale.subtotal)}</span>
          </div>
          <div style={{ ...tk.row, ...tk.bold, ...tk.base, marginTop: 8 }}>
            <span>TOTAL</span>
            <span>{fmt(sale.total)}</span>
          </div>
          <div style={{ ...tk.row, marginTop: 8 }}>
            <span style={tk.muted}>Pago</span>
            <span style={tk.semibold}>{pLabel(sale.paymentMethod)}</span>
          </div>
          {sale.paymentMethod === "mixed" && (
            <>
              <div style={tk.row}>
                <span style={tk.muted}>· Efectivo</span>
                <span>{fmt(sale.cashAmount ?? 0)}</span>
              </div>
              <div style={tk.row}>
                <span style={tk.muted}>· Tarjeta</span>
                <span>{fmt(sale.cardAmount ?? 0)}</span>
              </div>
            </>
          )}
          {sale.paymentMethod === "cash" && !!sale.cashGiven && (
            <>
              <div style={tk.row}>
                <span style={tk.muted}>Efectivo recibido</span>
                <span>{fmt(sale.cashGiven)}</span>
              </div>
              <div style={tk.row}>
                <span style={tk.muted}>Cambio</span>
                <span style={tk.semibold}>{fmt(sale.cashGiven - sale.total)}</span>
              </div>
            </>
          )}
          <div style={tk.hr} />
          <div style={{ ...tk.center, ...tk.muted }}>
            <p>¡Gracias por su compra!</p>
            <div style={{ display: "flex", justifyContent: "center", gap: 2, marginTop: 12 }}>
              {Array.from({ length: 36 }).map((_, i) => (
                <div key={i} style={{ width: i % 3 === 0 ? 3 : 1.5, height: 28, background: "#000", opacity: Math.random() > 0.3 ? 1 : 0 }} />
              ))}
            </div>
            <p style={{ marginTop: 4 }}>{sale.id.toUpperCase()}</p>
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <Btn onClick={onClose} variant="secondary" className="flex-1">Cerrar</Btn>
          <Btn onClick={doPrint} className="flex-1"><Printer size={15} /> Imprimir</Btn>
        </div>
      </div>
    </Modal>
  );
};

// ─── POS VIEW ─────────────────────────────────────────────────────────────────

const POSView = ({ user }: { user: User }) => {
  const { state, setState } = useApp();
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [tab, setTab] = useState<"search"|"cart">("search");
  const [variantModal, setVariantModal] = useState<Product | null>(null);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [customModal, setCustomModal] = useState(false);
  const [payModal, setPayModal] = useState(false);
  const [receipt, setReceipt] = useState<Sale | null>(null);
  const [filterGender, setFilterGender] = useState<Gender|"all">("all");
  const [filterCat, setFilterCat] = useState("all");

  // Variant selector state
  const [selColor, setSelColor] = useState("");
  const [selModel, setSelModel] = useState("");
  const [selSize, setSelSize] = useState("");
  const [selQty, setSelQty] = useState(1);

  // Custom item
  const [custName, setCustName] = useState("");
  const [custPrice, setCustPrice] = useState("");
  const [custQty, setCustQty] = useState(1);

  // Payment
  const [payMethod, setPayMethod] = useState<PaymentMethod>("cash");
  const [cashGiven, setCashGiven] = useState("");
  const [mixedCash, setMixedCash] = useState("");

  const filtered = useMemo(() => {
    let list = state.products.filter((p) => p.active);
    if (filterGender !== "all") list = list.filter((p) => p.gender === filterGender);
    if (filterCat !== "all") list = list.filter((p) => p.category === filterCat);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.barcode.includes(q)
      );
    }
    return list;
  }, [state.products, search, filterGender, filterCat]);

  const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);

  const openVariant = (p: Product) => {
    setVariantModal(p);
    setSelColor("");
    setSelModel("");
    setSelSize("");
    setSelQty(1);
  };

  // Derived from new grouped model
  const availableColors = useMemo(() => {
    if (!variantModal) return [];
    return [...new Set(variantModal.variants.map((v) => v.color))];
  }, [variantModal]);

  const availableModels = useMemo(() => {
    if (!variantModal || !selColor) return [];
    return [...new Set(variantModal.variants.filter((v) => v.color === selColor).map((v) => v.model))];
  }, [variantModal, selColor]);

  // The selected variant (color+model group)
  const selectedVariant = useMemo(() => {
    if (!variantModal || !selColor || !selModel) return null;
    return variantModal.variants.find((v) => v.color === selColor && v.model === selModel) ?? null;
  }, [variantModal, selColor, selModel]);

  // The selected size object within the variant
  const selectedSizeObj = useMemo(() => {
    if (!selectedVariant || !selSize) return null;
    return selectedVariant.sizes.find((sz) => sz.size === selSize) ?? null;
  }, [selectedVariant, selSize]);

  const addToCart = () => {
    if (!variantModal || !selectedVariant || !selSize) return;
    // Match by variantId + size
    const existing = cart.find((i) => i.variantId === selectedVariant.id && i.size === selSize);
    if (existing) {
      setCart(cart.map((i) => (i.variantId === selectedVariant.id && i.size === selSize)
        ? { ...i, quantity: i.quantity + selQty } : i));
    } else {
      setCart([...cart, {
        cartId: uid(),
        productId: variantModal.id,
        variantId: selectedVariant.id,
        name: variantModal.name,
        price: variantModal.price,
        quantity: selQty,
        color: selColor,
        model: selModel,
        size: selSize,
      }]);
    }
    setVariantModal(null);
    setTab("cart");
  };

  const addCustom = () => {
    if (!custName || !custPrice) return;
    setCart([...cart, {
      cartId: uid(),
      isCustom: true,
      name: custName,
      price: parseFloat(custPrice),
      quantity: custQty,
    }]);
    setCustName(""); setCustPrice(""); setCustQty(1);
    setCustomModal(false);
    setTab("cart");
  };

  const removeItem = (cartId: string) => setCart(cart.filter((i) => i.cartId !== cartId));
  const updateQty = (cartId: string, delta: number) => {
    setCart(cart.map((i) => i.cartId === cartId ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i).filter((i) => i.quantity > 0));
  };

  const confirmSale = () => {
    const nextCounter = state.saleCounter + 1;
    const sale: Sale = {
      id: String(nextCounter).padStart(4, "0"),
      date: new Date().toISOString(),
      sellerId: user.id,
      sellerName: user.name,
      branch: user.branch,
      items: cart,
      subtotal,
      total: subtotal,
      paymentMethod: payMethod,
      ...(payMethod === "mixed" ? { cashAmount: mixedCashAmount, cardAmount: mixedCardAmount } : {}),
      ...(payMethod === "cash" ? { cashGiven: parseInt(cashGiven || "0", 10) } : {}),
    };

    // Reduce stock at the seller's branch only (per variant + size)
    const updatedProducts = state.products.map((p) => ({
      ...p,
      variants: p.variants.map((v) => ({
        ...v,
        sizes: v.sizes.map((sz) => {
          const ci = cart.find((c) => c.variantId === v.id && c.size === sz.size);
          if (!ci) return sz;
          const current = sizeStockAt(sz, user.branch);
          return { ...sz, stockByBranch: { ...sz.stockByBranch, [user.branch]: Math.max(0, current - ci.quantity) } };
        }),
      })),
    }));

    setState((s) => {
      const ns = { ...s, products: updatedProducts, sales: [sale, ...s.sales], saleCounter: nextCounter };
      saveState(ns);
      return ns;
    });
    setReceipt(sale);
    setCart([]);
    setPayModal(false);
    setTab("search");
    setCashGiven("");
    setMixedCash("");
  };

  const change = payMethod === "cash" ? parseInt(cashGiven || "0", 10) - subtotal : 0;
  const mixedCashAmount = Math.min(subtotal, Math.max(0, parseFloat(mixedCash) || 0));
  const mixedCardAmount = subtotal - mixedCashAmount;

  return (
    <div className="flex flex-col h-full">
      {/* Desktop split, mobile tabs */}
      <div className="flex flex-1 overflow-hidden">
        {/* Product panel */}
        <div className={`flex flex-col flex-1 overflow-hidden ${tab === "cart" ? "hidden lg:flex" : "flex"}`}>
          {/* Filters */}
          <div className="flex-shrink-0 px-4 pt-4 pb-2 flex flex-col gap-2">
            <Input
              value={search} onChange={setSearch} placeholder="Buscar producto, SKU o código de barras…"
              icon={<Search size={15} />}
            />
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {[{value:"all",label:"Todo"}, ...GENDERS].map((g) => (
                <button
                  key={g.value}
                  onClick={() => setFilterGender(g.value as Gender | "all")}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filterGender === g.value ? "bg-primary text-white" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
                >
                  {g.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {["all", ...CATEGORIES].map((c) => (
                <button
                  key={c}
                  onClick={() => setFilterCat(c)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filterCat === c ? "bg-accent text-foreground border border-border" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {c === "all" ? "Todas" : c}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-visible px-4 pb-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-3 content-start">
            {/* Custom item card */}
            <button
              onClick={() => setCustomModal(true)}
              className="bg-card border-2 border-dashed border-border rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/5 transition-all min-h-[120px]"
            >
              <Plus size={22} />
              <span className="text-xs font-semibold text-center">Artículo personalizado</span>
            </button>

            {filtered.map((p) => {
              const totalStock = totalProductStock(p, user.branch);
              return (
                <div key={p.id} className="bg-card border border-border rounded-xl hover:border-primary/40 transition-all flex flex-col group">
                  {/* Image area → opens detail */}
                  <button
                    onClick={() => setDetailProduct(p)}
                    className="relative aspect-[4/5] bg-secondary/40 flex-shrink-0 overflow-hidden rounded-t-xl"
                  >
                    {p.images?.[0] ? (
                      <img
                        src={p.images?.[0]}
                        alt={p.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground/20 gap-2">
                        <Package size={28} />
                        <span className="text-[10px] font-semibold">Sin imagen</span>
                      </div>
                    )}
                    <div className="absolute top-2 left-2">
                      <Badge className={genderBadge(p.gender)}>{gLabel(p.gender)}</Badge>
                    </div>
                    <div className="absolute top-2 right-2">
                      <StockBadge stock={totalStock} />
                    </div>
                    {p.images?.length > 1 && (
                      <div className="absolute bottom-2 right-2 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded font-semibold">
                        +{p.images?.length - 1}
                      </div>
                    )}
                  </button>
                  {/* Info area → opens variant selector */}
                  <button
                    onClick={() => openVariant(p)}
                    className="p-3 text-left flex flex-col gap-1.5 flex-1 hover:bg-accent/20 transition-colors active:scale-95 rounded-b-xl"
                  >
                    <p className="text-sm font-semibold text-foreground leading-tight line-clamp-2">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.category}</p>
                    <div className="flex items-center justify-between mt-auto pt-1">
                      <span className="text-sm font-bold text-primary">{fmt(p.price)}</span>
                      <span className="text-xs font-mono text-muted-foreground/50">{p.sku}</span>
                    </div>
                  </button>
                </div>
              );
            })}

            {filtered.length === 0 && (
              <div className="col-span-full">
                <EmptyState icon={Package} title="Sin resultados" desc="Prueba con otro término de búsqueda" />
              </div>
            )}
          </div>
        </div>

        {/* Cart panel */}
        <div className={`flex flex-col lg:w-80 xl:w-96 bg-card border-l border-border overflow-hidden ${tab === "cart" ? "flex flex-1" : "hidden lg:flex"}`}>
          <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <ShoppingCart size={16} className="text-primary" />
              <span className="font-semibold text-sm">Carrito</span>
              {cart.length > 0 && (
                <span className="bg-primary text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">{cart.length}</span>
              )}
            </div>
            {cart.length > 0 && (
              <button onClick={() => setCart([])} className="text-xs text-muted-foreground hover:text-red-400 flex items-center gap-1 transition-colors">
                <RotateCcw size={12} /> Limpiar
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-visible">
            {cart.length === 0 ? (
              <EmptyState icon={ShoppingCart} title="Carrito vacío" desc="Agrega productos para comenzar" />
            ) : (
              <div className="p-3 flex flex-col gap-2">
                {cart.map((item) => (
                  <div key={item.cartId} className="bg-secondary/60 border border-border rounded-xl p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground leading-tight">{item.name}</p>
                        {(item.color || item.size) && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {[item.color, item.model !== item.color ? item.model : null, item.size !== "Único" ? item.size : null].filter(Boolean).join(" · ")}
                          </p>
                        )}
                        {item.isCustom && <Badge className="bg-violet-500/20 text-violet-400 mt-1">Personalizado</Badge>}
                      </div>
                      <button onClick={() => removeItem(item.cartId)} className="text-muted-foreground hover:text-red-400 p-1 transition-colors flex-shrink-0">
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="flex items-center justify-between mt-2.5">
                      <div className="flex items-center gap-2 bg-background rounded-lg border border-border">
                        <button onClick={() => updateQty(item.cartId, -1)} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"><Minus size={12} /></button>
                        <span className="text-sm font-semibold w-5 text-center">{item.quantity}</span>
                        <button onClick={() => updateQty(item.cartId, 1)} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"><Plus size={12} /></button>
                      </div>
                      <span className="font-bold text-sm text-primary">{fmt(item.price * item.quantity)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {cart.length > 0 && (
            <div className="border-t border-border p-4 flex-shrink-0">
              <div className="flex justify-between mb-1 text-sm text-muted-foreground">
                <span>{cart.reduce((s, i) => s + i.quantity, 0)} artículos</span>
                <span>Subtotal</span>
              </div>
              <div className="flex justify-between mb-4">
                <span className="font-bold text-lg text-foreground">Total</span>
                <span className="font-bold text-xl text-primary">{fmt(subtotal)}</span>
              </div>
              <Btn onClick={() => setPayModal(true)} className="w-full" size="lg">
                <CreditCard size={16} /> Cobrar
              </Btn>
            </div>
          )}
        </div>
      </div>

      {/* Mobile tab switcher */}
      <div className="lg:hidden flex-shrink-0 flex border-t border-border bg-card">
        <button
          onClick={() => setTab("search")}
          className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${tab === "search" ? "text-primary border-b-2 border-primary" : "text-muted-foreground"}`}
        >
          <Search size={15} /> Productos
        </button>
        <button
          onClick={() => setTab("cart")}
          className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${tab === "cart" ? "text-primary border-b-2 border-primary" : "text-muted-foreground"}`}
        >
          <ShoppingCart size={15} /> Carrito
          {cart.length > 0 && <span className="bg-primary text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center">{cart.length}</span>}
        </button>
      </div>

      {/* Variant selector modal */}
      <Modal open={!!variantModal} onClose={() => setVariantModal(null)} title={variantModal?.name ?? ""}>
        {variantModal && (
          <div className="p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <Badge className={genderBadge(variantModal.gender)}>{gLabel(variantModal.gender)}</Badge>
              <span className="font-bold text-lg text-primary">{fmt(variantModal.price)}</span>
            </div>
            <p className="text-xs text-muted-foreground">{variantModal.description}</p>

            {/* Color selector */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">Color</label>
              <div className="flex flex-wrap gap-2">
                {availableColors.map((color) => {
                  const hex = variantModal.variants.find((v) => v.color === color)?.colorHex ?? "#888";
                  return (
                    <button
                      key={color}
                      onClick={() => { setSelColor(color); setSelModel(""); setSelSize(""); }}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-all ${selColor === color ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border text-foreground hover:border-primary/40"}`}
                    >
                      <span className="w-3.5 h-3.5 rounded-full border border-white/20 flex-shrink-0" style={{ background: hex }} />
                      {color}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Model selector */}
            {selColor && (
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">Modelo</label>
                <div className="flex flex-wrap gap-2">
                  {availableModels.map((model) => (
                    <button
                      key={model}
                      onClick={() => { setSelModel(model); setSelSize(""); }}
                      className={`px-3 py-1.5 rounded-lg border text-sm transition-all ${selModel === model ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border text-foreground hover:border-primary/40"}`}
                    >
                      {model}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Size selector — from variant.sizes */}
            {selectedVariant && (
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-0.5">Talla / Tamaño</label>
                <p className="text-[10px] text-muted-foreground mb-2 flex items-center gap-1"><MapPin size={10} /> Stock en {user.branch}</p>
                <div className="flex flex-wrap gap-2">
                  {selectedVariant.sizes.map((sz) => {
                    const branchStock = sizeStockAt(sz, user.branch);
                    return (
                      <button
                        key={sz.size}
                        onClick={() => { setSelSize(sz.size); setSelQty(1); }}
                        disabled={branchStock === 0}
                        className={`px-3 py-2 rounded-lg border text-sm transition-all flex items-center gap-2 ${selSize === sz.size ? "border-primary bg-primary/10 text-primary font-bold" : branchStock === 0 ? "border-border/30 text-muted-foreground/30 cursor-not-allowed" : "border-border text-foreground hover:border-primary/40"}`}
                      >
                        <span className="font-semibold">{sz.size}</span>
                        {branchStock > 0 && branchStock <= 5
                          ? <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-1 rounded">{branchStock} pzs</span>
                          : branchStock === 0
                            ? <span className="text-[10px] text-red-400">Sin stock</span>
                            : <span className="text-[10px] text-muted-foreground">{branchStock} pzs</span>
                        }
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quantity — only when size is selected */}
            {selectedSizeObj && (
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">Cantidad</label>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-3 bg-secondary rounded-lg border border-border px-2 py-1">
                    <button onClick={() => setSelQty(Math.max(1, selQty - 1))} className="p-1.5 text-muted-foreground hover:text-foreground"><Minus size={14} /></button>
                    <span className="font-bold text-lg w-6 text-center">{selQty}</span>
                    <button onClick={() => setSelQty(Math.min(sizeStockAt(selectedSizeObj, user.branch), selQty + 1))} className="p-1.5 text-muted-foreground hover:text-foreground"><Plus size={14} /></button>
                  </div>
                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                    Stock: <StockBadge stock={sizeStockAt(selectedSizeObj, user.branch)} />
                  </div>
                </div>
                <p className="text-xs font-mono text-muted-foreground mt-2">SKU: {variantModal.sku} · {selectedVariant?.id}</p>
              </div>
            )}

            <div className="flex gap-3 mt-2">
              <Btn onClick={() => setVariantModal(null)} variant="secondary" className="flex-1">Cancelar</Btn>
              <Btn onClick={addToCart} disabled={!selectedSizeObj || sizeStockAt(selectedSizeObj, user.branch) === 0 || !selSize} className="flex-1">
                <ShoppingCart size={15} /> Agregar — {selectedSizeObj ? fmt(variantModal.price * selQty) : fmt(variantModal.price)}
              </Btn>
            </div>
          </div>
        )}
      </Modal>

      {/* Custom item modal */}
      <Modal open={customModal} onClose={() => setCustomModal(false)} title="Artículo personalizado">
        <div className="p-5 flex flex-col gap-4">
          <Input label="Nombre del artículo" value={custName} onChange={setCustName} placeholder="Ej. Bolsa de regalo" />
          <Input label="Precio unitario" value={custPrice} onChange={setCustPrice} type="number" min={0} step={0.01} placeholder="0.00" />
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">Cantidad</label>
            <div className="flex items-center gap-3 bg-secondary rounded-lg border border-border px-2 py-1 w-fit">
              <button onClick={() => setCustQty(Math.max(1, custQty - 1))} className="p-1.5 text-muted-foreground hover:text-foreground"><Minus size={14} /></button>
              <span className="font-bold text-lg w-6 text-center">{custQty}</span>
              <button onClick={() => setCustQty(custQty + 1)} className="p-1.5 text-muted-foreground hover:text-foreground"><Plus size={14} /></button>
            </div>
          </div>
          <div className="flex gap-3">
            <Btn onClick={() => setCustomModal(false)} variant="secondary" className="flex-1">Cancelar</Btn>
            <Btn onClick={addCustom} disabled={!custName || !custPrice} className="flex-1">
              <Plus size={15} /> Agregar
            </Btn>
          </div>
        </div>
      </Modal>

      {/* Payment modal — closeOnBackdrop disabled so an accidental click outside doesn't discard a checkout with money already entered; the X is the only way out besides Cancelar */}
      <Modal
        open={payModal}
        onClose={() => { setPayModal(false); setCashGiven(""); setMixedCash(""); }}
        title="Resumen y pago"
        closeOnBackdrop={false}
      >
        <div className="p-5 flex flex-col gap-4">
          <div className="bg-secondary rounded-xl p-4 flex flex-col gap-2">
            {cart.map((item) => (
              <div key={item.cartId} className="flex justify-between text-sm">
                <span className="text-foreground">
                  {item.name}
                  {item.color ? <span className="text-muted-foreground text-xs"> · {item.color}</span> : null}
                  {item.size && item.size !== "Único" ? <span className="text-muted-foreground text-xs"> / {item.size}</span> : null}
                  <span className="text-muted-foreground"> ×{item.quantity}</span>
                </span>
                <span className="font-semibold flex-shrink-0 ml-3">{fmt(item.price * item.quantity)}</span>
              </div>
            ))}
            <div className="border-t border-border mt-2 pt-2 flex justify-between font-bold">
              <span>Total</span>
              <span className="text-primary text-lg">{fmt(subtotal)}</span>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-3">Método de pago</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { m:"cash" as PaymentMethod, label:"Efectivo", icon:Banknote },
                { m:"card" as PaymentMethod, label:"Tarjeta", icon:CreditCard },
                { m:"mixed" as PaymentMethod, label:"Efectivo + Tarjeta", icon:Combine },
              ]).map(({ m, label, icon: Icon }) => (
                <button
                  key={m}
                  onClick={() => setPayMethod(m)}
                  className={`flex flex-col items-center gap-2 py-3 rounded-xl border transition-all ${payMethod === m ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/30"}`}
                >
                  <Icon size={20} />
                  <span className="text-xs font-semibold">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {payMethod === "cash" && (
            <div className="flex flex-col gap-2">
              <Input
                label="Efectivo recibido"
                value={cashGiven}
                onChange={(v) => setCashGiven(digitsOnly(v))}
                type="text"
                inputMode="numeric"
                placeholder="0"
              />
              {parseInt(cashGiven || "0", 10) >= subtotal && (
                <div className="flex justify-between bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-4 py-3 text-sm">
                  <span className="text-emerald-400 font-semibold">Cambio</span>
                  <span className="text-emerald-400 font-bold">{fmt(change)}</span>
                </div>
              )}
            </div>
          )}

          {payMethod === "mixed" && (
            <div className="flex flex-col gap-2">
              <Input
                label="Monto en efectivo"
                value={mixedCash}
                onChange={(v) => setMixedCash(digitsOnly(v))}
                type="text"
                inputMode="numeric"
                placeholder="0"
              />
              <div className="flex justify-between bg-secondary border border-border rounded-lg px-4 py-3 text-sm">
                <span className="text-muted-foreground font-semibold flex items-center gap-1.5"><CreditCard size={13} /> Resto en tarjeta</span>
                <span className="font-bold text-foreground">{fmt(mixedCardAmount)}</span>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <Btn onClick={() => { setPayModal(false); setCashGiven(""); setMixedCash(""); }} variant="secondary" className="flex-1">Cancelar</Btn>
            <Btn
              onClick={confirmSale}
              disabled={(payMethod === "cash" && parseInt(cashGiven || "0", 10) < subtotal) || (payMethod === "mixed" && (!mixedCash || mixedCashAmount <= 0 || mixedCashAmount >= subtotal))}
              className="flex-1"
            >
              <Check size={15} /> Confirmar venta
            </Btn>
          </div>
        </div>
      </Modal>

      {/* Receipt */}
      {receipt && <ReceiptModal sale={receipt} onClose={() => setReceipt(null)} />}

      {/* Product detail */}
      {detailProduct && (
        <ProductDetailModal
          product={detailProduct}
          onClose={() => setDetailProduct(null)}
          onAddToCart={(p) => { setDetailProduct(null); openVariant(p); }}
        />
      )}
    </div>
  );
};

// ─── INVENTORY VIEW (products + stock unified) ────────────────────────────────

const blankProduct = (): Omit<Product,"id"|"sku"|"barcode"|"createdAt"> => ({
  name:"", description:"", category:CATEGORIES[0], gender:"men", price:0, sizeSystem:"sml", variants:[], images:[], active:true,
});

const InventoryView = ({ user }: { user: User }) => {
  const { state, setState } = useApp();
  const canEdit = user.role === "admin" || user.role === "warehouse";

  // List filters
  const [search, setSearch] = useState("");
  const [filterGender, setFilterGender] = useState<Gender|"all">("all");
  const [filterCat, setFilterCat] = useState("all");
  // "all" shows a read-only per-branch breakdown; a specific branch shows editable steppers for that branch
  const [filterBranch, setFilterBranch] = useState<string>("all");

  // Expand/collapse product rows for stock editing
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [stockDraft, setStockDraft] = useState<Record<string, string>>({});

  // Product form
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(blankProduct());

  // Variant builder state
  const [vColor, setVColor] = useState("");
  const [vColorHex, setVColorHex] = useState("#888888");
  const [vModel, setVModel] = useState("");
  const [expandedVariantId, setExpandedVariantId] = useState<string | null>(null);

  // Barcode modal
  const [barcodeProduct, setBarcodeProduct] = useState<Product | null>(null);
  const barcodeRef = useRef<HTMLDivElement>(null);

  const printBarcode = () => {
    const w = window.open("", "_blank", "width=400,height=500");
    if (!w || !barcodeRef.current) return;
    w.document.write(`
      <!DOCTYPE html><html><head>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: system-ui, sans-serif; background: white; color: #000; padding: 24px; display: flex; justify-content: center; }
      </style></head><body>${barcodeRef.current.innerHTML}</body></html>`);
    w.document.close();
    w.focus();
    w.print();
    w.close();
  };

  // Transfer stock between branches
  const [transferTarget, setTransferTarget] = useState<{ productId: string; productName: string; variant: ProductVariant; size: string } | null>(null);
  const [transferFrom, setTransferFrom] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [transferQty, setTransferQty] = useState(1);

  // ── helpers ──────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = state.products;
    if (filterGender !== "all") list = list.filter((p) => p.gender === filterGender);
    if (filterCat !== "all") list = list.filter((p) => p.category === filterCat);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((p) =>
        p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.barcode.includes(q)
      );
    }
    return list;
  }, [state.products, search, filterGender, filterCat]);

  const toggleExpand = (id: string) =>
    setExpanded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const draftKey = (variantId: string, size: string, branch: string) => `${variantId}-${size}-${branch}`;

  const setStockAbsolute = (productId: string, variantId: string, size: string, branch: string, value: number) => {
    const clamped = Math.max(0, isNaN(value) ? 0 : value);
    setState((s) => {
      const ns = { ...s, products: s.products.map((p) => p.id !== productId ? p : {
        ...p, variants: p.variants.map((v) => v.id !== variantId ? v : {
          ...v, sizes: v.sizes.map((sz) => sz.size !== size ? sz : { ...sz, stockByBranch: { ...sz.stockByBranch, [branch]: clamped } }),
        }),
      })};
      saveState(ns); return ns;
    });
  };

  const adjustStock = (productId: string, variantId: string, size: string, branch: string, delta: number, currentStock: number) => {
    const next = Math.max(0, currentStock + delta);
    setStockDraft((d) => ({ ...d, [draftKey(variantId, size, branch)]: String(next) }));
    setStockAbsolute(productId, variantId, size, branch, next);
  };

  // ── transfer stock between branches ─────────────────────────────────────────

  const openTransfer = (productId: string, productName: string, variant: ProductVariant, size: string) => {
    const sz = variant.sizes.find((s) => s.size === size);
    const from = state.branches.find((b) => sz && sizeStockAt(sz, b) > 0) ?? state.branches[0];
    const to = state.branches.find((b) => b !== from) ?? state.branches[1];
    setTransferTarget({ productId, productName, variant, size });
    setTransferFrom(from);
    setTransferTo(to);
    setTransferQty(1);
  };

  const transferSizeObj = transferTarget?.variant.sizes.find((s) => s.size === transferTarget.size) ?? null;
  const transferAvailable = transferSizeObj && transferFrom ? sizeStockAt(transferSizeObj, transferFrom) : 0;

  const doTransfer = () => {
    if (!transferTarget || !transferFrom || !transferTo || transferFrom === transferTo) return;
    const qty = Math.max(0, Math.min(transferQty, transferAvailable));
    if (qty <= 0) return;
    setState((s) => {
      const ns = { ...s, products: s.products.map((p) => p.id !== transferTarget.productId ? p : {
        ...p, variants: p.variants.map((v) => v.id !== transferTarget.variant.id ? v : {
          ...v, sizes: v.sizes.map((sz) => sz.size !== transferTarget.size ? sz : {
            ...sz, stockByBranch: {
              ...sz.stockByBranch,
              [transferFrom]: sizeStockAt(sz, transferFrom) - qty,
              [transferTo]: sizeStockAt(sz, transferTo) + qty,
            },
          }),
        }),
      })};
      saveState(ns); return ns;
    });
    setTransferTarget(null);
  };

  // ── product CRUD ─────────────────────────────────────────────────────────────

  const generateSKU = (category: string, counter: number) =>
    `${category.slice(0, 3).toUpperCase()}-${String(counter).padStart(3, "0")}`;
  const generateBarcode = (counter: number) => `789${String(counter).padStart(10, "0")}`;

  const openNew = () => {
    setEditing(null);
    setForm(blankProduct());
    setVColor(""); setVModel(""); setExpandedVariantId(null);
    setFormOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({ name:p.name, description:p.description, category:p.category, gender:p.gender,
      price:p.price, sizeSystem:p.sizeSystem, variants:p.variants, images:p.images ?? [], active:p.active });
    setVColor(""); setVModel(""); setExpandedVariantId(null);
    setFormOpen(true);
  };

  const save = () => {
    if (!form.name || form.price <= 0) return;
    if (vColor || vModel) {
      toast.error(`Tienes una variante "${vColor || "?"} · ${vModel || "?"}" sin agregar. Presiona "Agregar" o borra esos campos antes de guardar.`);
      return;
    }
    // Drop draft variants that never got a single talla added — nothing useful to persist.
    const cleanVariants = form.variants.filter((v) => v.sizes.length > 0);
    setState((s) => {
      let ns: AppState;
      if (editing) {
        ns = { ...s, products: s.products.map((p) => p.id === editing.id ? { ...p, ...form, variants: cleanVariants } : p) };
      } else {
        const cnt = s.barcodeCounter + 1;
        ns = { ...s, barcodeCounter: cnt, products: [{ id: uid(), sku: generateSKU(form.category, cnt),
          barcode: generateBarcode(cnt), createdAt: new Date().toISOString().split("T")[0], ...form, variants: cleanVariants }, ...s.products] };
      }
      saveState(ns); return ns;
    });
    setFormOpen(false);
  };

  const deleteProduct = (id: string) => setState((s) => { const ns = { ...s, products: s.products.filter((p) => p.id !== id) }; saveState(ns); return ns; });
  const toggleActive = (id: string) => setState((s) => { const ns = { ...s, products: s.products.map((p) => p.id === id ? { ...p, active: !p.active } : p) }; saveState(ns); return ns; });

  const [confirmDeleteProduct, setConfirmDeleteProduct] = useState<Product | null>(null);
  const deleteProductNow = () => {
    if (!confirmDeleteProduct) return;
    deleteProduct(confirmDeleteProduct.id);
    setConfirmDeleteProduct(null);
  };

  // ── variant builder ───────────────────────────────────────────────────────────

  const availSizes = sizesForSystem(form.sizeSystem);
  const usedSizesForVariant = (variantId: string) => form.variants.find((v) => v.id === variantId)?.sizes.map((s) => s.size) ?? [];

  // Creates an empty variant shell (no tallas yet) and expands it immediately — from here on,
  // adding tallas and stock per branch happens directly in the same card used for existing variants.
  const createVariant = () => {
    if (!vColor || !vModel) return;
    const exists = form.variants.find((v) => v.color === vColor && v.model === vModel);
    if (exists) {
      toast.error("Ya existe una variante con ese color y modelo");
      setExpandedVariantId(exists.id);
      return;
    }
    const hex = PRESET_COLORS.find((c) => c.name === vColor)?.hex ?? vColorHex;
    const initialSizes = form.sizeSystem === "unica" ? [{ size: "Única", stockByBranch: {} }] : [];
    const newV: ProductVariant = { id: uid(), color: vColor, colorHex: hex, model: vModel, sizes: initialSizes };
    setForm((f) => ({ ...f, variants: [...f.variants, newV] }));
    setExpandedVariantId(newV.id);
    setVColor(""); setVModel("");
  };

  const addSizeToVariant = (variantId: string, sz: string) => {
    if (usedSizesForVariant(variantId).includes(sz)) return;
    setForm((f) => ({ ...f, variants: f.variants.map((v) =>
      v.id === variantId ? { ...v, sizes: [...v.sizes, { size: sz, stockByBranch: {} }] } : v) }));
  };

  const updateSizeStock = (variantId: string, size: string, branch: string, stock: number) =>
    setForm((f) => ({ ...f, variants: f.variants.map((v) =>
      v.id === variantId ? { ...v, sizes: v.sizes.map((s) => s.size === size ? { ...s, stockByBranch: { ...s.stockByBranch, [branch]: Math.max(0, isNaN(stock) ? 0 : stock) } } : s) } : v) }));

  const removeSizeFromVariant = (variantId: string, size: string) =>
    setForm((f) => ({ ...f, variants: f.variants.map((v) =>
      v.id === variantId ? { ...v, sizes: v.sizes.filter((s) => s.size !== size) } : v
    ) }));

  const removeVariant = (id: string) => setForm((f) => ({ ...f, variants: f.variants.filter((v) => v.id !== id) }));

  // Removing a variant or talla that still has stock asks for confirmation first; empty ones go
  // straight through since there's nothing to lose. For a single talla, the modal also offers a
  // partial "dar de baja" (write off N pieces from one branch) as an alternative to wiping it all.
  const [confirmDelete, setConfirmDelete] = useState<{ variantId: string; size?: string; label: string; stock: number; stockByBranch?: Record<string, number> } | null>(null);
  const [writeOffBranch, setWriteOffBranch] = useState("");
  const [writeOffQty, setWriteOffQty] = useState(1);

  const requestRemoveVariant = (v: ProductVariant) => {
    const stock = totalVariantStock(v);
    if (stock > 0) setConfirmDelete({ variantId: v.id, label: `${v.color} · ${v.model}`, stock });
    else removeVariant(v.id);
  };

  const requestRemoveSize = (variantId: string, sz: VariantSize) => {
    const stock = sizeStockTotal(sz);
    if (stock > 0) {
      setConfirmDelete({ variantId, size: sz.size, label: sz.size, stock, stockByBranch: sz.stockByBranch });
      const stocked = state.branches.filter((b) => (sz.stockByBranch?.[b] ?? 0) > 0);
      const top = stocked.reduce((best, b) => (sz.stockByBranch![b] > (sz.stockByBranch![best] ?? 0) ? b : best), stocked[0] ?? "");
      setWriteOffBranch(top);
      setWriteOffQty(1);
    } else removeSizeFromVariant(variantId, sz.size);
  };

  const confirmDeleteNow = () => {
    if (!confirmDelete) return;
    if (confirmDelete.size) removeSizeFromVariant(confirmDelete.variantId, confirmDelete.size);
    else removeVariant(confirmDelete.variantId);
    setConfirmDelete(null);
  };

  const writeOffStock = () => {
    if (!confirmDelete || !confirmDelete.size || !writeOffBranch) return;
    const current = confirmDelete.stockByBranch?.[writeOffBranch] ?? 0;
    const next = Math.max(0, current - writeOffQty);
    updateSizeStock(confirmDelete.variantId, confirmDelete.size, writeOffBranch, next);
    setConfirmDelete(null);
  };

  // ── render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex-shrink-0 p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Input value={search} onChange={setSearch} placeholder="Buscar producto, SKU o código de barras…"
            icon={<Search size={15} />} className="flex-1" />
          {canEdit && <Btn onClick={openNew} size="md"><Plus size={15} /> Nuevo</Btn>}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {[{value:"all",label:"Todo"}, ...GENDERS].map((g) => (
            <button key={g.value} onClick={() => setFilterGender(g.value as Gender|"all")}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filterGender === g.value ? "bg-primary text-white" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
              {g.label}
            </button>
          ))}
          <div className="w-px bg-border flex-shrink-0 mx-1" />
          {["all", ...CATEGORIES].map((c) => (
            <button key={c} onClick={() => setFilterCat(c)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filterCat === c ? "bg-accent text-foreground border border-border" : "text-muted-foreground hover:text-foreground"}`}>
              {c === "all" ? "Todas" : c}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          <MapPin size={13} className="text-muted-foreground flex-shrink-0" />
          {[{value:"all",label:"Todas las sucursales"}, ...state.branches.map((b) => ({value:b,label:b}))].map((b) => (
            <button key={b.value} onClick={() => setFilterBranch(b.value)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filterBranch === b.value ? "bg-primary text-white" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {/* Product list */}
      <div className="flex-1 overflow-y-auto scrollbar-visible px-4 pb-4 flex flex-col gap-3">
        {filtered.length === 0 && <EmptyState icon={Package} title="Sin productos" desc="Crea tu primer producto con el botón Nuevo" />}

        {filtered.map((p) => {
          const isOpen = expanded.has(p.id);
          const pStock = totalProductStock(p, filterBranch === "all" ? undefined : filterBranch);
          return (
            <div key={p.id} className={`bg-card border rounded-xl overflow-hidden transition-all flex-shrink-0 ${p.active ? "border-border" : "border-border/40 opacity-60"}`}>
              {/* Row: thumbnail + info + actions */}
              <div className="flex items-stretch">
                <button onClick={() => toggleExpand(p.id)}
                  className="relative w-24 h-24 self-center my-2 ml-2 rounded-lg flex-shrink-0 bg-secondary/40 hover:bg-secondary transition-colors overflow-hidden">
                  {p.images?.[0]
                    ? <img src={p.images[0]} alt={p.name} className="w-full h-full object-cover absolute inset-0" />
                    : <div className="w-full h-full flex items-center justify-center text-muted-foreground/20 absolute inset-0"><Package size={26} /></div>
                  }
                </button>

                <div className="flex-1 min-w-0 px-3 py-2.5 flex gap-2">
                  <button onClick={() => toggleExpand(p.id)} className="flex-1 min-w-0 text-left">
                    <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                      <Badge className={genderBadge(p.gender)}>{gLabel(p.gender)}</Badge>
                      <Badge className="bg-secondary text-muted-foreground text-[10px]">{p.category}</Badge>
                      {!p.active && <Badge className="bg-red-500/20 text-red-400 text-[10px]">Inactivo</Badge>}
                    </div>
                    <p className="font-semibold text-sm text-foreground leading-snug">{p.name}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="font-bold text-xs text-primary">{fmt(p.price)}</span>
                      <span className="text-[10px] font-mono text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">{p.sku}</span>
                      <StockBadge stock={pStock} />
                    </div>
                    {/* Color dots */}
                    <div className="flex items-center gap-1 mt-1.5">
                      {[...new Map(p.variants.map((v) => [v.color, v.colorHex])).entries()].slice(0, 8).map(([color, hex]) => (
                        <span key={color} title={color} className="w-3 h-3 rounded-full border border-white/20 flex-shrink-0" style={{ background: hex }} />
                      ))}
                    </div>
                  </button>

                  {/* Actions */}
                  {canEdit && (
                    <div className="flex flex-col gap-1 flex-shrink-0">
                      <Btn onClick={(e: React.MouseEvent) => { e.stopPropagation(); openEdit(p); }} variant="ghost" size="sm"><Edit2 size={12} /></Btn>
                      <Btn onClick={(e: React.MouseEvent) => { e.stopPropagation(); toggleActive(p.id); }} variant="ghost" size="sm" className={p.active ? "text-amber-400" : "text-emerald-400"}>
                        {p.active ? <EyeOff size={12} /> : <Eye size={12} />}
                      </Btn>
                      <Btn onClick={(e: React.MouseEvent) => { e.stopPropagation(); setBarcodeProduct(p); }} variant="ghost" size="sm"><Barcode size={12} /></Btn>
                      <Btn onClick={(e: React.MouseEvent) => { e.stopPropagation(); setConfirmDeleteProduct(p); }} variant="danger" size="sm"><Trash2 size={12} /></Btn>
                    </div>
                  )}
                </div>

                {/* Expand chevron */}
                <button onClick={() => toggleExpand(p.id)} className="px-2 flex items-center text-muted-foreground hover:text-foreground transition-colors">
                  <ChevronDown size={15} className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
                </button>
              </div>

              {/* Expanded: variants + size/branch stock */}
              {isOpen && (
                <div className="border-t border-border divide-y divide-border/40">
                  {p.variants.map((v) => {
                    const vStock = totalVariantStock(v, filterBranch === "all" ? undefined : filterBranch);
                    return (
                      <div key={v.id} className="px-4 py-3">
                        {/* Variant header: color · model  total-pzs */}
                        <div className="flex items-center gap-2 mb-2.5">
                          <span className="w-3.5 h-3.5 rounded-full flex-shrink-0 border border-white/15" style={{ background: v.colorHex }} />
                          <span className="text-xs font-bold text-foreground">{v.color}</span>
                          <span className="text-muted-foreground text-xs">·</span>
                          <span className="text-xs font-semibold text-foreground">{v.model}</span>
                          <span className={`ml-1 px-2 py-0.5 rounded-full text-xs font-bold ${vStock === 0 ? "bg-red-500/15 text-red-400" : vStock <= 5 ? "bg-amber-500/15 text-amber-400" : "bg-emerald-500/15 text-emerald-400"}`}>
                            {vStock} pzs{filterBranch !== "all" ? ` · ${filterBranch}` : ""}
                          </span>
                        </div>

                        {filterBranch === "all" ? (
                          /* Aggregate view: read-only indicator of pieces per size, broken down by branch */
                          <div className="pl-5 flex flex-col gap-1.5">
                            {v.sizes.map((sz) => {
                              const entries = state.branches.map((b) => ({ b, qty: sizeStockAt(sz, b) })).filter((e) => e.qty > 0);
                              return (
                                <div key={sz.size} className="flex items-center gap-2 bg-background border border-border rounded-xl px-2.5 py-1.5 flex-wrap">
                                  <span className="font-mono text-[11px] font-bold text-muted-foreground w-7 flex-shrink-0 uppercase">{sz.size}</span>
                                  <div className="flex items-center gap-1 flex-wrap flex-1">
                                    {entries.length === 0 ? (
                                      <span className="text-[10px] text-red-400">Sin stock en ninguna sucursal</span>
                                    ) : entries.map(({ b, qty }) => (
                                      <span key={b} className="text-[10px] font-semibold bg-secondary px-1.5 py-0.5 rounded-full text-muted-foreground">
                                        {b.replace("Sucursal ", "")}: {qty}
                                      </span>
                                    ))}
                                  </div>
                                  {canEdit && sizeStockTotal(sz) > 0 && (
                                    <button onClick={() => openTransfer(p.id, p.name, v, sz.size)}
                                      title="Transferir entre sucursales"
                                      className="text-muted-foreground hover:text-primary p-1 rounded-lg hover:bg-primary/10 transition-colors flex-shrink-0">
                                      <ArrowLeftRight size={12} />
                                    </button>
                                  )}
                                  <StockBadge stock={sizeStockTotal(sz)} />
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          /* Single-branch view: editable steppers for the selected branch */
                          <div className="pl-5 grid grid-cols-2 gap-1.5">
                            {v.sizes.map((sz) => {
                              const branchStock = sizeStockAt(sz, filterBranch);
                              const key = draftKey(v.id, sz.size, filterBranch);
                              const draftVal = stockDraft[key];
                              const displayVal = draftVal !== undefined ? draftVal : String(branchStock);
                              return (
                                <div key={sz.size} className="flex items-center gap-1.5 bg-background border border-border rounded-xl px-2.5 py-1.5">
                                  <span className="font-mono text-[11px] font-bold text-muted-foreground w-7 flex-shrink-0 uppercase">{sz.size}</span>
                                  <div className="flex items-center gap-1 flex-1 justify-end">
                                    <button onClick={() => adjustStock(p.id, v.id, sz.size, filterBranch, -1, branchStock)}
                                      disabled={!canEdit || branchStock === 0}
                                      className="w-6 h-6 flex items-center justify-center rounded-lg border border-border bg-secondary text-muted-foreground hover:text-red-400 hover:border-red-500/40 hover:bg-red-500/10 disabled:opacity-30 transition-all">
                                      <ChevronDown size={12} />
                                    </button>
                                    <input type="number" min={0} disabled={!canEdit} value={displayVal}
                                      onChange={(e) => setStockDraft((d) => ({ ...d, [key]: e.target.value }))}
                                      onBlur={(e) => {
                                        const parsed = parseInt(e.target.value, 10);
                                        setStockDraft((d) => { const n = { ...d }; delete n[key]; return n; });
                                        setStockAbsolute(p.id, v.id, sz.size, filterBranch, isNaN(parsed) ? branchStock : parsed);
                                      }}
                                      className={`w-10 text-center text-sm font-bold bg-transparent border-0 outline-none disabled:cursor-default [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${branchStock === 0 ? "text-red-400" : branchStock <= 5 ? "text-amber-400" : "text-emerald-400"}`}
                                    />
                                    <button onClick={() => adjustStock(p.id, v.id, sz.size, filterBranch, 1, branchStock)}
                                      disabled={!canEdit}
                                      className="w-6 h-6 flex items-center justify-center rounded-lg border border-border bg-secondary text-muted-foreground hover:text-emerald-400 hover:border-emerald-500/40 hover:bg-emerald-500/10 disabled:opacity-30 transition-all">
                                      <ChevronUp size={12} />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Product form modal ───────────────────────────────────────────────── */}
      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? "Editar producto" : "Nuevo producto"} wide>
        <div className="p-5 flex flex-col gap-5 overflow-y-auto max-h-[80vh]">

          {/* Basic info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Nombre" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="Nombre del producto" className="sm:col-span-2" />
            <Input label="Descripción" value={form.description} onChange={(v) => setForm((f) => ({ ...f, description: v }))} placeholder="Descripción breve" className="sm:col-span-2" />
            <Select label="Categoría" value={form.category} onChange={(v) => setForm((f) => ({ ...f, category: v }))} options={CATEGORIES.map((c) => ({ value: c, label: c }))} />
            <Select label="Género / Tipo" value={form.gender} onChange={(v) => setForm((f) => ({ ...f, gender: v as Gender }))} options={GENDERS.map((g) => ({ value: g.value, label: g.label }))} />
            <Input label="Precio (MXN)" value={form.price} onChange={(v) => setForm((f) => ({ ...f, price: parseFloat(v) || 0 }))} type="number" min={0} step={0.5} />
            {editing && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">SKU / Barras</label>
                <div className="bg-secondary border border-border rounded-lg px-3 py-2.5 text-xs font-mono text-muted-foreground">{editing.sku} · {editing.barcode}</div>
              </div>
            )}
          </div>

          {/* Images */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-3">Imágenes</label>
            <ImageUpload images={form.images ?? []} onChange={(imgs) => setForm((f) => ({ ...f, images: imgs as string[] }))} />
          </div>

          {/* Size system selector — locked once the product exists, so a variant edit can't silently
              orphan already-stocked sizes; only choosable at product creation. */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-3">Sistema de tallas</label>
            <div className="grid grid-cols-3 gap-2">
              {SIZE_SYSTEMS.map((sys) => (
                <button
                  key={sys.value}
                  disabled={!!editing}
                  onClick={() => {
                    if (editing || form.sizeSystem === sys.value) return;
                    setForm((f) => ({ ...f, sizeSystem: sys.value, variants: [] }));
                    setVSize(sys.sizes[0]);
                    setExpandedVariantId(null);
                  }}
                  className={`flex flex-col items-center gap-1 px-3 py-3 rounded-xl border text-center transition-all ${
                    form.sizeSystem === sys.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-secondary text-muted-foreground hover:text-foreground hover:border-border/70"
                  } ${editing ? "opacity-60 cursor-not-allowed hover:text-muted-foreground hover:border-border" : ""}`}
                >
                  <span className="font-bold text-sm">{sys.label}</span>
                  <span className="text-[10px] leading-tight opacity-70">{sys.desc}</span>
                </button>
              ))}
            </div>
            {editing ? (
              <p className="text-[11px] text-muted-foreground mt-2">El sistema de tallas se define al crear el producto y ya no puede cambiarse.</p>
            ) : form.variants.length > 0 ? (
              <p className="text-[11px] text-amber-400 mt-2">Cambiar el sistema elimina las variantes actuales.</p>
            ) : null}
          </div>

          {/* Variant builder */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Variantes — Color + Modelo</label>
            <p className="text-[10px] text-muted-foreground mb-3">Agrega un color y modelo, luego sus tallas y el stock por sucursal.</p>

            {/* Add-variant bar: creates an empty card below, expanded, ready for tallas */}
            <div className="flex items-end gap-2 mb-3">
              <Select label="Color" value={vColor}
                onChange={(c) => { setVColor(c); setVColorHex(PRESET_COLORS.find((p) => p.name === c)?.hex ?? "#888"); }}
                options={[{value:"",label:"— Seleccionar"}, ...PRESET_COLORS.map((c) => ({value:c.name,label:c.name}))]} className="flex-1" />
              <Input label="Modelo" value={vModel} onChange={setVModel} placeholder="Slim Fit, Regular…" className="flex-1" />
              <Btn onClick={createVariant} disabled={!vColor || !vModel} size="md" className="flex-shrink-0">
                <Plus size={14} /> Agregar
              </Btn>
            </div>

            {form.variants.length > 0 && (
              <div className="flex flex-col gap-2">
                {form.variants.map((v) => {
                  const isOpen = expandedVariantId === v.id;
                  const vTotalStock = totalVariantStock(v);
                  const usedSizes = v.sizes.map((s) => s.size);
                  const freeSizes = availSizes.filter((s) => !usedSizes.includes(s));
                  return (
                    <div key={v.id} className="border border-border rounded-xl overflow-hidden">
                      <div role="button" tabIndex={0} onClick={() => setExpandedVariantId(isOpen ? null : v.id)}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setExpandedVariantId(isOpen ? null : v.id); }}
                        className="flex items-center gap-2 w-full px-3 py-2.5 bg-secondary hover:bg-accent transition-colors text-left cursor-pointer">
                        <span className="w-3.5 h-3.5 rounded-full flex-shrink-0 border border-white/20" style={{ background: v.colorHex }} />
                        <span className="text-sm font-semibold text-foreground">{v.color}</span>
                        <span className="text-muted-foreground text-xs">·</span>
                        <span className="text-sm text-foreground">{v.model}</span>
                        <span className="ml-auto flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${vTotalStock === 0 ? "bg-red-500/15 text-red-400" : "bg-emerald-500/15 text-emerald-400"}`}>{vTotalStock} pzs</span>
                          <span className="text-xs text-muted-foreground">{v.sizes.length} tallas</span>
                          <ChevronDown size={13} className={`text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                        </span>
                        <button onClick={(e) => { e.stopPropagation(); requestRemoveVariant(v); }} className="text-muted-foreground hover:text-red-400 p-0.5 ml-1">
                          <X size={13} />
                        </button>
                      </div>
                      {isOpen && (
                        <div className="px-3 py-2.5 bg-background/50 flex flex-col gap-2.5">
                          {v.sizes.length > 0 && (
                            <div className="overflow-x-auto -mx-1 px-1">
                              <table className="text-xs border-separate border-spacing-x-1.5">
                                <thead>
                                  <tr>
                                    <th className="text-left font-semibold text-muted-foreground pb-1">Talla</th>
                                    {state.branches.map((b) => (
                                      <th key={b} className="text-center font-semibold text-muted-foreground pb-1 whitespace-nowrap px-1">{b}</th>
                                    ))}
                                    <th></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {v.sizes.map((sz) => (
                                    <tr key={sz.size}>
                                      <td className="font-mono font-bold text-foreground pr-1 whitespace-nowrap">{sz.size}</td>
                                      {state.branches.map((b) => (
                                        <td key={b} className="py-0.5">
                                          <input type="number" min={0} value={sizeStockAt(sz, b)}
                                            onChange={(e) => updateSizeStock(v.id, sz.size, b, parseInt(e.target.value) || 0)}
                                            className="w-14 text-center text-xs font-bold bg-secondary border border-border rounded-lg px-1 py-1.5 outline-none focus:ring-2 focus:ring-primary/40 text-foreground [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
                                        </td>
                                      ))}
                                      <td>
                                        <button onClick={() => requestRemoveSize(v.id, sz)} className="text-muted-foreground hover:text-red-400 p-1"><X size={12} /></button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                          {/* Add missing sizes */}
                          {freeSizes.length > 0 && (
                            <div className={v.sizes.length > 0 ? "pt-1.5 border-t border-border" : ""}>
                              <p className="text-[10px] text-muted-foreground mb-1.5">Agregar talla:</p>
                              <div className="flex flex-wrap gap-1">
                                {freeSizes.map((s) => (
                                  <button key={s} onClick={() => addSizeToVariant(v.id, s)}
                                    className="px-2 py-0.5 rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary text-xs transition-all">
                                    + {s}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <Btn onClick={() => setFormOpen(false)} variant="secondary" className="flex-1">Cancelar</Btn>
            <Btn onClick={save} disabled={!form.name || form.price <= 0} className="flex-1">
              <Save size={15} /> {editing ? "Guardar cambios" : "Crear producto"}
            </Btn>
          </div>
        </div>
      </Modal>

      {/* Confirm removing a variant/talla that still has stock */}
      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Eliminar con stock">
        {confirmDelete && (() => {
          const stockedBranches = confirmDelete.stockByBranch
            ? state.branches.filter((b) => (confirmDelete.stockByBranch![b] ?? 0) > 0)
            : [];
          const branchStock = confirmDelete.stockByBranch?.[writeOffBranch] ?? 0;
          return (
            <div className="p-5 flex flex-col gap-4">
              <p className="text-sm text-foreground">
                {confirmDelete.size ? <>La talla <span className="font-semibold">{confirmDelete.label}</span></> : <>La variante <span className="font-semibold">"{confirmDelete.label}"</span></>} tiene <span className="font-bold">{confirmDelete.stock} pzs</span> en stock. ¿Deseas eliminarla de todas formas?
              </p>

              {confirmDelete.size && stockedBranches.length > 0 && (
                <div className="bg-secondary/60 border border-border rounded-xl p-3 flex flex-col gap-2.5">
                  <p className="text-xs font-semibold text-muted-foreground">O dar de baja solo algunas piezas</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Select label="Sucursal" value={writeOffBranch} onChange={setWriteOffBranch}
                      options={stockedBranches.map((b) => ({ value: b, label: `${b} (${confirmDelete.stockByBranch![b]})` }))} />
                    <Input label="Piezas a dar de baja" value={writeOffQty} type="number" min={1} max={branchStock}
                      onChange={(v) => setWriteOffQty(Math.max(1, Math.min(branchStock, parseInt(v) || 1)))} />
                  </div>
                  <Btn onClick={writeOffStock} variant="outline" size="sm" disabled={!writeOffBranch || branchStock <= 0}>
                    <Minus size={13} /> Dar de baja {writeOffQty} pza{writeOffQty === 1 ? "" : "s"}
                  </Btn>
                </div>
              )}

              <div className="flex gap-3">
                <Btn onClick={() => setConfirmDelete(null)} variant="secondary" className="flex-1">Cancelar</Btn>
                <Btn onClick={confirmDeleteNow} variant="danger" className="flex-1"><Trash2 size={15} /> Eliminar {confirmDelete.size ? "talla" : "todo"}</Btn>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Confirm deleting a whole product */}
      <Modal open={!!confirmDeleteProduct} onClose={() => setConfirmDeleteProduct(null)} title="Eliminar producto">
        {confirmDeleteProduct && (
          <div className="p-5 flex flex-col gap-4">
            <p className="text-sm text-foreground">
              ¿Seguro que quieres eliminar <span className="font-semibold">"{confirmDeleteProduct.name}"</span>? Se perderán sus variantes, tallas y stock. Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-3">
              <Btn onClick={() => setConfirmDeleteProduct(null)} variant="secondary" className="flex-1">Cancelar</Btn>
              <Btn onClick={deleteProductNow} variant="danger" className="flex-1"><Trash2 size={15} /> Eliminar</Btn>
            </div>
          </div>
        )}
      </Modal>

      {/* Barcode modal */}
      <Modal open={!!barcodeProduct} onClose={() => setBarcodeProduct(null)} title="Código de barras">
        {barcodeProduct && (
          <div className="p-5 flex flex-col gap-4">
            <div ref={barcodeRef} className="bg-white rounded-xl p-5 flex flex-col items-center gap-3">
              <p className="font-bold text-gray-900 text-sm">{barcodeProduct.name}</p>
              <p className="text-xs text-gray-500">{barcodeProduct.sku}</p>
              <div className="flex gap-0.5 items-end mt-1">
                {barcodeProduct.barcode.split("").map((_, i) => (
                  <div key={i} style={{ width: i % 4 === 0 ? 3 : i % 3 === 0 ? 2 : 1, height: i % 5 === 0 ? 48 : 40, background: "#000" }} />
                ))}
              </div>
              <p className="font-mono text-sm font-bold text-gray-900 tracking-widest">{barcodeProduct.barcode}</p>
            </div>
            <div className="bg-secondary rounded-lg px-4 py-3 text-xs font-mono text-muted-foreground flex justify-between">
              <span>Barcode</span><span className="font-bold">{barcodeProduct.barcode}</span>
            </div>
            <div className="flex gap-3">
              <Btn onClick={() => setBarcodeProduct(null)} variant="secondary" className="flex-1">Cerrar</Btn>
              <Btn onClick={printBarcode} className="flex-1"><Printer size={15} /> Imprimir</Btn>
            </div>
          </div>
        )}
      </Modal>

      {/* Transfer stock between branches */}
      <Modal open={!!transferTarget} onClose={() => setTransferTarget(null)} title="Transferir entre sucursales">
        {transferTarget && (
          <div className="p-5 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded-full flex-shrink-0 border border-white/15" style={{ background: transferTarget.variant.colorHex }} />
              <p className="text-sm font-semibold text-foreground">
                {transferTarget.productName} · {transferTarget.variant.color} · {transferTarget.variant.model} · Talla {transferTarget.size}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Select label="De" value={transferFrom}
                onChange={(b) => { setTransferFrom(b); if (b === transferTo) setTransferTo(state.branches.find((x) => x !== b) ?? ""); setTransferQty(1); }}
                options={state.branches.map((b) => ({ value: b, label: `${b} (${transferSizeObj ? sizeStockAt(transferSizeObj, b) : 0})` }))} />
              <Select label="A" value={transferTo}
                onChange={setTransferTo}
                options={state.branches.filter((b) => b !== transferFrom).map((b) => ({ value: b, label: `${b} (${transferSizeObj ? sizeStockAt(transferSizeObj, b) : 0})` }))} />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">Cantidad a transferir</label>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-3 bg-secondary rounded-lg border border-border px-2 py-1">
                  <button onClick={() => setTransferQty((q) => Math.max(1, q - 1))} className="p-1.5 text-muted-foreground hover:text-foreground"><Minus size={14} /></button>
                  <span className="font-bold text-lg w-8 text-center">{transferQty}</span>
                  <button onClick={() => setTransferQty((q) => Math.min(transferAvailable, q + 1))} className="p-1.5 text-muted-foreground hover:text-foreground"><Plus size={14} /></button>
                </div>
                <span className="text-xs text-muted-foreground">Disponibles en {transferFrom}: {transferAvailable}</span>
              </div>
            </div>

            <div className="flex gap-3 mt-1">
              <Btn onClick={() => setTransferTarget(null)} variant="secondary" className="flex-1">Cancelar</Btn>
              <Btn onClick={doTransfer} disabled={transferAvailable === 0 || transferFrom === transferTo || transferQty <= 0} className="flex-1">
                <ArrowLeftRight size={15} /> Transferir
              </Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

// ─── HISTORY VIEW ─────────────────────────────────────────────────────────────

// A sale's own subtotal/total stay as originally charged (historical record); returns are tracked
// per line item via CartItem.returnedQty and netted out wherever revenue is displayed.
const returnedAmount = (sale: Sale) => sale.items.reduce((sum, it) => sum + (it.returnedQty ?? 0) * it.price, 0);
const netTotal = (sale: Sale) => sale.total - returnedAmount(sale);
const hasReturn = (sale: Sale) => sale.items.some((it) => (it.returnedQty ?? 0) > 0);

// "Historial total" tab — the original full sales history (search/filter/sort + edit/delete/devolución).
const TotalHistoryTab = ({ user }: { user: User }) => {
  const { state, setState } = useApp();
  // Holding just the id (not the Sale object) means the modal always reflects the latest
  // state.sales — otherwise editing/returning/deleting while it's open would leave it showing a
  // stale snapshot from before the change.
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = detailId ? state.sales.find((s) => s.id === detailId) ?? null : null;
  const setDetail = (sale: Sale | null) => setDetailId(sale?.id ?? null);
  const [receipt, setReceipt] = useState<Sale | null>(null);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [search, setSearch] = useState("");
  const [filterBranch, setFilterBranch] = useState("all");
  const [filterSeller, setFilterSeller] = useState("all");
  const [filterPay, setFilterPay] = useState("all");
  const [filterDate, setFilterDate] = useState(todayDateStr());
  const [sortBy, setSortBy] = useState<"date"|"total">("date");
  const [sortDir, setSortDir] = useState<"desc"|"asc">("desc");
  const [showFilters, setShowFilters] = useState(false);
  const canManage = user.role !== "seller";

  // ── edit sale (admin data only: payment method, seller, branch — never items/qty/stock) ──────
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [editForm, setEditForm] = useState({ paymentMethod: "cash" as PaymentMethod, sellerId: "", branch: "", cashAmount: 0, cardAmount: 0 });

  const openEditSale = (sale: Sale) => {
    setEditingSale(sale);
    setEditForm({ paymentMethod: sale.paymentMethod, sellerId: sale.sellerId, branch: sale.branch, cashAmount: sale.cashAmount ?? 0, cardAmount: sale.cardAmount ?? 0 });
  };

  const saveEditSale = () => {
    if (!editingSale) return;
    const sellerUser = state.users.find((u) => u.id === editForm.sellerId);
    setState((s) => {
      const ns = { ...s, sales: s.sales.map((sale) => sale.id !== editingSale.id ? sale : {
        ...sale,
        paymentMethod: editForm.paymentMethod,
        sellerId: editForm.sellerId,
        sellerName: sellerUser?.name ?? sale.sellerName,
        branch: editForm.branch,
        cashAmount: editForm.paymentMethod === "mixed" ? editForm.cashAmount : undefined,
        cardAmount: editForm.paymentMethod === "mixed" ? editForm.cardAmount : undefined,
      }) };
      saveState(ns);
      return ns;
    });
    setEditingSale(null);
  };

  // ── delete sale (restores whatever stock hadn't already been returned) ─────────────────────────
  const [confirmDeleteSale, setConfirmDeleteSale] = useState<Sale | null>(null);

  const deleteSaleNow = () => {
    if (!confirmDeleteSale) return;
    const sale = confirmDeleteSale;
    setState((s) => {
      const products = s.products.map((p) => ({
        ...p,
        variants: p.variants.map((v) => ({
          ...v,
          sizes: v.sizes.map((sz) => {
            const item = sale.items.find((it) => it.variantId === v.id && it.size === sz.size);
            const qty = item ? item.quantity - (item.returnedQty ?? 0) : 0;
            if (qty <= 0) return sz;
            const current = sizeStockAt(sz, sale.branch);
            return { ...sz, stockByBranch: { ...sz.stockByBranch, [sale.branch]: current + qty } };
          }),
        })),
      }));
      const ns = { ...s, products, sales: s.sales.filter((sl) => sl.id !== sale.id) };
      saveState(ns);
      return ns;
    });
    setConfirmDeleteSale(null);
  };

  // ── devolución: partial per-item return, restocks and marks returnedQty without deleting history ──
  const [returnSale, setReturnSale] = useState<Sale | null>(null);
  const [returnQtys, setReturnQtys] = useState<Record<string, number>>({});

  const openReturn = (sale: Sale) => { setReturnSale(sale); setReturnQtys({}); };

  const confirmReturn = () => {
    if (!returnSale) return;
    const entries = Object.entries(returnQtys).filter(([, qty]) => qty > 0);
    if (entries.length === 0) return;
    setState((s) => {
      const products = s.products.map((p) => ({
        ...p,
        variants: p.variants.map((v) => ({
          ...v,
          sizes: v.sizes.map((sz) => {
            const entry = entries.find(([cartId]) => {
              const item = returnSale.items.find((it) => it.cartId === cartId);
              return item && item.variantId === v.id && item.size === sz.size;
            });
            if (!entry) return sz;
            const current = sizeStockAt(sz, returnSale.branch);
            return { ...sz, stockByBranch: { ...sz.stockByBranch, [returnSale.branch]: current + entry[1] } };
          }),
        })),
      }));
      const sales = s.sales.map((sale) => sale.id !== returnSale.id ? sale : {
        ...sale,
        items: sale.items.map((it) => {
          const qty = returnQtys[it.cartId] ?? 0;
          return qty > 0 ? { ...it, returnedQty: (it.returnedQty ?? 0) + qty } : it;
        }),
      });
      const ns = { ...s, products, sales };
      saveState(ns);
      return ns;
    });
    setReturnSale(null);
  };

  const sellers = useMemo(() => {
    const ids = [...new Set(state.sales.map((s) => s.sellerId))];
    return ids.map((id) => ({ id, name: state.sales.find((s) => s.sellerId === id)?.sellerName ?? id }));
  }, [state.sales]);

  const filtered = useMemo(() => {
    let list = [...state.sales];
    if (user.role === "seller") list = list.filter((s) => s.sellerId === user.id);
    if (filterBranch !== "all") list = list.filter((s) => s.branch === filterBranch);
    if (filterSeller !== "all") list = list.filter((s) => s.sellerId === filterSeller);
    if (filterPay !== "all") list = list.filter((s) => s.paymentMethod === filterPay);
    if (filterDate) list = list.filter((s) => dateStr(new Date(s.date)) === filterDate);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((s) =>
        s.id.toLowerCase().includes(q) ||
        s.sellerName.toLowerCase().includes(q) ||
        s.items.some((it) => it.name.toLowerCase().includes(q))
      );
    }
    list.sort((a, b) => {
      const dir = sortDir === "desc" ? -1 : 1;
      if (sortBy === "date") return dir * (new Date(a.date).getTime() - new Date(b.date).getTime());
      return dir * (a.total - b.total);
    });
    return list;
  }, [state.sales, filterBranch, filterSeller, filterPay, filterDate, search, sortBy, sortDir, user]);

  const totalRevenue = filtered.reduce((s, sale) => s + netTotal(sale), 0);

  const toggleSort = (by: "date"|"total") => {
    if (sortBy === by) setSortDir((d) => d === "desc" ? "asc" : "desc");
    else { setSortBy(by); setSortDir("desc"); }
  };

  const payIcon = { cash: Banknote, card: CreditCard, mixed: Combine };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 p-4 flex flex-col gap-3">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { label:"Ventas", value:String(filtered.length), color:"text-foreground" },
            { label:"Ingresos", value:fmt(totalRevenue), color:"text-primary" },
          ].map((stat) => (
            <div key={stat.label} className="bg-card border border-border rounded-xl px-3 py-2.5 text-center">
              <p className={`font-bold text-sm ${stat.color} leading-tight`}>{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>

        <Input value={search} onChange={setSearch} placeholder="Buscar por folio, vendedor o producto…" icon={<Search size={15} />} />

        <div className="flex items-center gap-2">
          <button onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-all ${showFilters ? "bg-primary/10 border-primary/30 text-primary" : "bg-secondary border-border text-muted-foreground hover:text-foreground"}`}>
            <Filter size={13} /> Filtros
          </button>
          <div className="relative flex items-center">
            <Calendar size={12} className="absolute left-3 text-muted-foreground pointer-events-none" />
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value || todayDateStr())}
              className="pl-8 pr-2 py-2 rounded-lg border bg-secondary border-border text-foreground text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <button onClick={() => toggleSort("total")}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-all ${sortBy === "total" ? "bg-secondary border-border text-foreground" : "text-muted-foreground border-transparent"}`}>
            <TrendingUp size={12} /> Monto {sortBy === "total" && (sortDir === "desc" ? <ChevronDown size={11} /> : <ChevronUp size={11} />)}
          </button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 bg-secondary border border-border rounded-xl p-3">
            {user.role !== "seller" && (
              <Select label="Sucursal" value={filterBranch} onChange={setFilterBranch}
                options={[{value:"all",label:"Todas"}, ...state.branches.map((b) => ({value:b,label:b}))]} />
            )}
            {user.role !== "seller" && (
              <Select label="Vendedor" value={filterSeller} onChange={setFilterSeller}
                options={[{value:"all",label:"Todos"}, ...sellers.map((s) => ({value:s.id,label:s.name}))]} />
            )}
            <Select label="Pago" value={filterPay} onChange={setFilterPay}
              options={[{value:"all",label:"Todos"},{value:"cash",label:"Efectivo"},{value:"card",label:"Tarjeta"},{value:"mixed",label:"Efectivo + Tarjeta"}]} />
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-visible px-4 pb-4 flex flex-col gap-2">
        {filtered.length === 0 && <EmptyState icon={ClipboardList} title="Sin ventas" desc="No hay ventas con los filtros seleccionados" />}
        {filtered.map((sale) => {
          const PayIcon = payIcon[sale.paymentMethod] ?? Banknote;
          const sellerUser = state.users.find((u) => u.id === sale.sellerId);
          return (
            <button key={sale.id} onClick={() => setDetail(sale)} className="bg-card border border-border rounded-xl p-4 text-left hover:border-primary/30 transition-all w-full">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  {sellerUser && <Avatar user={sellerUser} size="sm" />}
                  <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-muted-foreground">{sale.id.slice(0,12).toUpperCase()}</span>
                    <Badge className="bg-secondary text-muted-foreground"><MapPin size={10} /> {sale.branch}</Badge>
                    {hasReturn(sale) && <Badge className="bg-amber-500/20 text-amber-400"><RotateCcw size={10} /> Con devolución</Badge>}
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock size={10} /> {fmtDate(sale.date)}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs font-semibold text-foreground">{sale.sellerName}</span>
                    <span className="text-xs text-muted-foreground">· {sale.items.reduce((s,i)=>s+i.quantity,0)} artículos</span>
                  </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  {hasReturn(sale) ? (
                    <span className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground line-through">{fmt(sale.total)}</span>
                      <span className="font-bold text-primary">{fmt(netTotal(sale))}</span>
                    </span>
                  ) : (
                    <span className="font-bold text-primary">{fmt(sale.total)}</span>
                  )}
                  <Badge className={`${
                    sale.paymentMethod === "cash" ? "bg-emerald-500/20 text-emerald-400" :
                    sale.paymentMethod === "card" ? "bg-sky-500/20 text-sky-400" :
                    "bg-violet-500/20 text-violet-400"
                  }`}>
                    <PayIcon size={10} /> {pLabel(sale.paymentMethod)}
                  </Badge>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Sale detail modal */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title="Detalle de venta">
        {detail && (() => {
          const detailSeller = state.users.find((u) => u.id === detail.sellerId);
          return (
          <div className="p-5 flex flex-col gap-4">
            {/* Seller card */}
            {detailSeller && (
              <div className="flex items-center gap-3 bg-secondary rounded-xl px-4 py-3">
                <Avatar user={detailSeller} size="md" />
                <div>
                  <p className="font-semibold text-sm text-foreground">{detailSeller.name}</p>
                  <Badge className={roleBadge(detailSeller.role)}>{rLabel(detailSeller.role)}</Badge>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                { label:"Folio", value:detail.id.toUpperCase() },
                { label:"Fecha", value:fmtDate(detail.date) },
                { label:"Sucursal", value:detail.branch },
                { label:"Pago", value:pLabel(detail.paymentMethod) },
              ].map((row) => (
                <div key={row.label}>
                  <p className="text-xs text-muted-foreground">{row.label}</p>
                  <p className="font-semibold text-foreground text-xs mt-0.5">{row.value}</p>
                </div>
              ))}
            </div>
            {detail.paymentMethod === "mixed" && (
              <div className="flex gap-4 text-xs -mt-1">
                <span className="text-muted-foreground">Efectivo: <span className="font-semibold text-foreground">{fmt(detail.cashAmount ?? 0)}</span></span>
                <span className="text-muted-foreground">Tarjeta: <span className="font-semibold text-foreground">{fmt(detail.cardAmount ?? 0)}</span></span>
              </div>
            )}
            <div className="border-t border-border pt-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Artículos</p>
              <div className="flex flex-col gap-2">
                {detail.items.map((item) => {
                  const prod = item.productId ? state.products.find((p) => p.id === item.productId) : null;
                  return (
                    <div key={item.cartId} className="flex items-center gap-3">
                      {/* Product thumbnail */}
                      <button
                        onClick={() => prod && setDetailProduct(prod)}
                        className={`w-12 h-12 rounded-lg flex-shrink-0 overflow-hidden bg-secondary border border-border ${prod ? "hover:border-primary/40 transition-colors" : "cursor-default"}`}
                      >
                        {prod?.images?.[0] ? (
                          <img src={prod.images?.[0]} alt={item.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground/30">
                            {item.isCustom ? <Tag size={14} /> : <Package size={14} />}
                          </div>
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-foreground leading-tight">{item.name}</p>
                        {(item.color || item.size) && (
                          <p className="text-xs text-muted-foreground">
                            {[item.color, item.size !== "Único" ? item.size : null].filter(Boolean).join(" / ")} · ×{item.quantity}
                          </p>
                        )}
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {item.isCustom && <Badge className="bg-violet-500/20 text-violet-400">Personalizado</Badge>}
                          {!!item.returnedQty && <Badge className="bg-amber-500/20 text-amber-400"><RotateCcw size={9} /> {item.returnedQty} devuelta{item.returnedQty === 1 ? "" : "s"}</Badge>}
                        </div>
                      </div>
                      <span className="font-bold text-sm text-primary flex-shrink-0">{fmt(item.price * item.quantity)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            {hasReturn(detail) && (
              <div className="flex justify-between text-sm text-amber-400">
                <span>Devuelto</span>
                <span className="font-semibold">-{fmt(returnedAmount(detail))}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base border-t border-border pt-3">
              <span>Total{hasReturn(detail) ? " neto" : ""}</span>
              <span className="text-primary">{fmt(netTotal(detail))}</span>
            </div>
            <div className="flex gap-3">
              <Btn onClick={() => setDetail(null)} variant="secondary" className="flex-1">Cerrar</Btn>
              <Btn onClick={() => { setReceipt(detail); setDetail(null); }} variant="outline" className="flex-1">
                <Printer size={14} /> Ver ticket
              </Btn>
            </div>
            {canManage && (
              <div className="flex gap-3">
                <Btn onClick={() => openEditSale(detail)} variant="outline" className="flex-1"><Edit2 size={14} /> Editar</Btn>
                <Btn onClick={() => openReturn(detail)} variant="outline" className="flex-1"><RotateCcw size={14} /> Devolución</Btn>
                <Btn onClick={() => { setConfirmDeleteSale(detail); setDetail(null); }} variant="danger" className="flex-1"><Trash2 size={14} /> Eliminar</Btn>
              </div>
            )}
          </div>
        );
        })()}
      </Modal>

      {receipt && <ReceiptModal sale={receipt} onClose={() => setReceipt(null)} />}

      {detailProduct && (
        <ProductDetailModal product={detailProduct} onClose={() => setDetailProduct(null)} />
      )}

      {/* Edit sale — admin data only (payment method, seller, branch); never items/qty/stock */}
      <Modal open={!!editingSale} onClose={() => setEditingSale(null)} title="Editar venta">
        {editingSale && (
          <div className="p-5 flex flex-col gap-4">
            <Select label="Método de pago" value={editForm.paymentMethod}
              onChange={(v) => setEditForm((f) => ({ ...f, paymentMethod: v as PaymentMethod }))}
              options={[{value:"cash",label:"Efectivo"},{value:"card",label:"Tarjeta"},{value:"mixed",label:"Efectivo + Tarjeta"}]} />
            {editForm.paymentMethod === "mixed" && (
              <div className="grid grid-cols-2 gap-2">
                <Input label="Efectivo" type="number" min={0} value={editForm.cashAmount}
                  onChange={(v) => setEditForm((f) => ({ ...f, cashAmount: parseFloat(v) || 0 }))} />
                <Input label="Tarjeta" type="number" min={0} value={editForm.cardAmount}
                  onChange={(v) => setEditForm((f) => ({ ...f, cardAmount: parseFloat(v) || 0 }))} />
              </div>
            )}
            <Select label="Vendedor" value={editForm.sellerId} onChange={(v) => setEditForm((f) => ({ ...f, sellerId: v }))}
              options={state.users.map((u) => ({ value: u.id, label: u.name }))} />
            <Select label="Sucursal" value={editForm.branch} onChange={(v) => setEditForm((f) => ({ ...f, branch: v }))}
              options={state.branches.map((b) => ({ value: b, label: b }))} />
            <div className="flex gap-3">
              <Btn onClick={() => setEditingSale(null)} variant="secondary" className="flex-1">Cancelar</Btn>
              <Btn onClick={saveEditSale} className="flex-1"><Save size={15} /> Guardar</Btn>
            </div>
          </div>
        )}
      </Modal>

      {/* Confirm sale deletion */}
      <Modal open={!!confirmDeleteSale} onClose={() => setConfirmDeleteSale(null)} title="Eliminar venta">
        {confirmDeleteSale && (
          <div className="p-5 flex flex-col gap-4">
            <p className="text-sm text-foreground">
              ¿Seguro que quieres eliminar la venta <span className="font-semibold">{confirmDeleteSale.id.toUpperCase()}</span>? Se restaurará el stock que no haya sido devuelto ya. Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-3">
              <Btn onClick={() => setConfirmDeleteSale(null)} variant="secondary" className="flex-1">Cancelar</Btn>
              <Btn onClick={deleteSaleNow} variant="danger" className="flex-1"><Trash2 size={15} /> Eliminar</Btn>
            </div>
          </div>
        )}
      </Modal>

      {/* Devolución: pick a quantity per item, restocks and marks returnedQty */}
      <Modal open={!!returnSale} onClose={() => setReturnSale(null)} title="Devolución">
        {returnSale && (() => {
          const returnTotal = returnSale.items.reduce((sum, it) => sum + (returnQtys[it.cartId] ?? 0) * it.price, 0);
          const anyReturnable = returnSale.items.some((it) => it.quantity - (it.returnedQty ?? 0) > 0);
          return (
            <div className="p-5 flex flex-col gap-4">
              <p className="text-xs text-muted-foreground">Indica cuántas piezas de cada artículo se devuelven. El stock regresa a {returnSale.branch}.</p>
              {anyReturnable ? (
                <div className="flex flex-col gap-2">
                  {returnSale.items.map((item) => {
                    const remaining = item.quantity - (item.returnedQty ?? 0);
                    if (remaining <= 0) return null;
                    const qty = returnQtys[item.cartId] ?? 0;
                    return (
                      <div key={item.cartId} className="flex items-center gap-3 bg-secondary rounded-lg px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{item.name}</p>
                          <p className="text-xs text-muted-foreground">{fmt(item.price)} c/u · {remaining} disponible{remaining === 1 ? "" : "s"}</p>
                        </div>
                        <div className="flex items-center bg-background border border-border rounded-lg overflow-hidden flex-shrink-0">
                          <button onClick={() => setReturnQtys((q) => ({ ...q, [item.cartId]: Math.max(0, qty - 1) }))} className="px-2 py-1.5 text-muted-foreground hover:text-red-400"><Minus size={13} /></button>
                          <span className="w-8 text-center font-bold text-sm">{qty}</span>
                          <button onClick={() => setReturnQtys((q) => ({ ...q, [item.cartId]: Math.min(remaining, qty + 1) }))} className="px-2 py-1.5 text-muted-foreground hover:text-emerald-400"><Plus size={13} /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-2">Todos los artículos de esta venta ya fueron devueltos.</p>
              )}
              <div className="flex justify-between font-bold text-base border-t border-border pt-3">
                <span>Total a devolver</span>
                <span className="text-amber-400">{fmt(returnTotal)}</span>
              </div>
              <div className="flex gap-3">
                <Btn onClick={() => setReturnSale(null)} variant="secondary" className="flex-1">Cancelar</Btn>
                <Btn onClick={confirmReturn} disabled={returnTotal <= 0} variant="danger" className="flex-1"><RotateCcw size={15} /> Confirmar devolución</Btn>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
};

// ─── DAILY SALES TAB (per-branch, with repeatable "corte de caja") ────────────

const isToday = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
};

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const DailySalesTab = ({ user }: { user: User }) => {
  const { state, setState } = useApp();
  const isAdmin = user.role === "admin";
  const [branch, setBranch] = useState<string>(user.branch);
  const [cutSummary, setCutSummary] = useState<Corte | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const todaySales = useMemo(() => state.sales.filter((s) => isToday(s.date)), [state.sales]);

  const scopedSales = useMemo(() => {
    if (!isAdmin) return todaySales.filter((s) => s.branch === user.branch);
    if (branch === "all") return todaySales;
    return todaySales.filter((s) => s.branch === branch);
  }, [todaySales, branch, isAdmin, user.branch]);

  const scopeLabel = !isAdmin ? user.branch : branch === "all" ? "Todas las sucursales" : branch;
  const revenue = scopedSales.reduce((sum, s) => sum + netTotal(s), 0);
  // Mixed-payment sales keep their originally recorded cash/card split as-is here — apportioning a
  // partial return across that split has no single right answer, so it's left unadjusted.
  const cashTotal = scopedSales.reduce((sum, s) => sum + (s.paymentMethod === "cash" ? netTotal(s) : s.paymentMethod === "mixed" ? (s.cashAmount ?? 0) : 0), 0);
  const cardTotal = scopedSales.reduce((sum, s) => sum + (s.paymentMethod === "card" ? netTotal(s) : s.paymentMethod === "mixed" ? (s.cardAmount ?? 0) : 0), 0);

  const todaysCortes = useMemo(() => [...state.cortes]
    .filter((c) => isToday(c.performedAt) && (!isAdmin ? c.branch === user.branch : branch === "all" || c.branch === branch))
    .sort((a, b) => new Date(b.performedAt).getTime() - new Date(a.performedAt).getTime()),
  [state.cortes, branch, isAdmin, user.branch]);

  const doCorte = () => {
    const salesSnapshot: CorteSaleSummary[] = scopedSales.map((s) => ({
      id: s.id, branch: s.branch, total: netTotal(s), paymentMethod: s.paymentMethod,
      itemsLabel: s.items.map((it) => `${it.quantity}x ${it.name}`).join(", "),
    }));
    const corte: Corte = {
      id: uid(), branch: scopeLabel, performedAt: new Date().toISOString(), performedBy: user.name,
      salesCount: scopedSales.length, totalRevenue: revenue, cashTotal, cardTotal, sales: salesSnapshot,
    };
    setState((s) => {
      const ns = { ...s, cortes: [corte, ...s.cortes] };
      saveState(ns);
      return ns;
    });
    setCutSummary(corte);
  };

  const printCorte = () => {
    const w = window.open("", "_blank", "width=380,height=600");
    if (!w || !printRef.current) return;
    w.document.write(`
      <!DOCTYPE html><html><head>
      <style>* { margin: 0; padding: 0; box-sizing: border-box; } body { background: #fff; padding: 10px; width: 300px; }</style>
      </head><body>${printRef.current.innerHTML}</body></html>`);
    w.document.close();
    w.focus();
    w.print();
    w.close();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 p-4 flex flex-col gap-3">
        {isAdmin && (
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {[{value:"all",label:"Todas las sucursales"}, ...state.branches.map((b) => ({value:b,label:b}))].map((opt) => (
              <button key={opt.value} onClick={() => setBranch(opt.value)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${branch === opt.value ? "bg-primary text-white" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
                {opt.label}
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div className="bg-card border border-border rounded-xl px-3 py-2.5 text-center">
            <p className="font-bold text-sm text-foreground leading-tight">{scopedSales.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Ventas de hoy</p>
          </div>
          <div className="bg-card border border-border rounded-xl px-3 py-2.5 text-center">
            <p className="font-bold text-sm text-primary leading-tight">{fmt(revenue)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Ingresos de hoy</p>
          </div>
        </div>

        {user.role !== "seller" && (
          <Btn onClick={doCorte} disabled={scopedSales.length === 0} className="w-full">
            <Printer size={15} /> Hacer corte — {scopeLabel}
          </Btn>
        )}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-visible px-4 pb-4 flex flex-col gap-4">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Ventas de hoy</p>
          {scopedSales.length === 0 ? (
            <EmptyState icon={ClipboardList} title="Sin ventas hoy" desc={`Todavía no hay ventas registradas hoy en ${scopeLabel}`} />
          ) : (
            <div className="flex flex-col gap-2">
              {scopedSales.map((sale) => (
                <div key={sale.id} className="bg-card border border-border rounded-xl p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-mono text-xs text-muted-foreground">{sale.id.toUpperCase()}</span>
                    <p className="text-xs text-foreground font-semibold mt-0.5">{sale.sellerName} · {fmtDate(sale.date)}</p>
                  </div>
                  <span className="font-bold text-sm text-primary flex-shrink-0">{fmt(netTotal(sale))}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {todaysCortes.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Cortes realizados hoy</p>
            <div className="flex flex-col gap-2">
              {todaysCortes.map((c) => (
                <button key={c.id} onClick={() => setCutSummary(c)} className="bg-card border border-border rounded-xl p-3 flex items-center justify-between gap-2 text-left hover:border-primary/30 transition-all">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground">{fmtDate(c.performedAt)} · {c.branch}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{c.performedBy} · {c.salesCount} venta{c.salesCount === 1 ? "" : "s"}</p>
                  </div>
                  <span className="font-bold text-sm text-primary flex-shrink-0">{fmt(c.totalRevenue)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <Modal open={!!cutSummary} onClose={() => setCutSummary(null)} title="Corte de caja">
        {cutSummary && (
          <div className="p-5 flex flex-col gap-4">
            <div ref={printRef} style={tk.wrap}>
              <div style={{ ...tk.center, marginBottom: 12 }}>
                <p style={tk.header}>Corte de caja</p>
                <p style={{ ...tk.muted, marginTop: 4 }}>{cutSummary.branch}</p>
              </div>
              <div style={tk.hr} />
              <div style={{ ...tk.row, marginBottom: 4 }}><span style={tk.muted}>Fecha:</span><span>{fmtDate(cutSummary.performedAt)}</span></div>
              <div style={{ ...tk.row, marginBottom: 4 }}><span style={tk.muted}>Realizó:</span><span>{cutSummary.performedBy}</span></div>
              <div style={{ ...tk.row, marginBottom: 4 }}><span style={tk.muted}>Ventas:</span><span>{cutSummary.salesCount}</span></div>
              <div style={tk.hr} />
              {(() => {
                const branchesInCut = [...new Set(cutSummary.sales.map((s) => s.branch))];
                const multiBranch = branchesInCut.length > 1;
                return branchesInCut.map((b) => {
                  const branchSales = cutSummary.sales.filter((s) => s.branch === b);
                  const branchTotal = branchSales.reduce((sum, s) => sum + s.total, 0);
                  return (
                    <div key={b} style={{ marginBottom: 12 }}>
                      {multiBranch && <p style={{ ...tk.bold, textTransform: "uppercase", marginBottom: 5 }}>{b}</p>}
                      {branchSales.map((s) => (
                        <div key={s.id} style={{ marginBottom: 5 }}>
                          <div style={tk.row}>
                            <span>{s.id.toUpperCase()} · {pLabel(s.paymentMethod)}</span>
                            <span style={tk.semibold}>{fmt(s.total)}</span>
                          </div>
                          <p style={{ ...tk.muted, ...tk.small }}>{s.itemsLabel}</p>
                        </div>
                      ))}
                      {multiBranch && (
                        <div style={{ ...tk.row, ...tk.semibold, borderTop: "1px dashed #000", paddingTop: 4, marginTop: 4 }}>
                          <span>Subtotal {b}</span><span>{fmt(branchTotal)}</span>
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
              <div style={tk.hr} />
              <div style={{ ...tk.row, marginBottom: 4 }}><span style={tk.muted}>Efectivo:</span><span>{fmt(cutSummary.cashTotal)}</span></div>
              <div style={{ ...tk.row, marginBottom: 4 }}><span style={tk.muted}>Tarjeta:</span><span>{fmt(cutSummary.cardTotal)}</span></div>
              <div style={tk.hr} />
              <div style={{ ...tk.row, ...tk.bold, ...tk.base }}><span>TOTAL</span><span>{fmt(cutSummary.totalRevenue)}</span></div>
            </div>
            <div className="flex gap-3">
              <Btn onClick={() => setCutSummary(null)} variant="secondary" className="flex-1">Cerrar</Btn>
              <Btn onClick={printCorte} className="flex-1"><Printer size={15} /> Imprimir</Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

// ─── HISTORY VIEW (container: "Ventas por sucursal" default, "Historial total" second) ───────

const HistoryView = ({ user }: { user: User }) => {
  const [tab, setTab] = useState<"daily" | "total">("daily");
  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 px-4 pt-4 flex gap-2">
        {[{value:"daily",label:"Ventas por sucursal"},{value:"total",label:"Historial total"}].map((t) => (
          <button key={t.value} onClick={() => setTab(t.value as "daily" | "total")}
            className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all ${tab === t.value ? "bg-primary text-white" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-hidden">
        {tab === "daily" ? <DailySalesTab user={user} /> : <TotalHistoryTab user={user} />}
      </div>
    </div>
  );
};

// ─── COMMISSIONS VIEW ─────────────────────────────────────────────────────────

const tierLabel = (t: CommissionTier) =>
  t.max === null ? `Desde ${fmt(t.min)}` : `${fmt(t.min)} – ${fmt(t.max)}`;

const findTier = (tiers: CommissionTier[], amount: number): CommissionTier | null => {
  const sorted = [...tiers].sort((a, b) => a.min - b.min);
  for (const t of sorted) {
    if (amount >= t.min && (t.max === null || amount < t.max)) return t;
  }
  return sorted[sorted.length - 1] ?? null;
};

const CommissionsView = () => {
  const { state, setState } = useApp();
  const [weeks, setWeeks] = useState(1);
  const [filterBranch, setFilterBranch] = useState("all");
  const [editingTiers, setEditingTiers] = useState(false);
  const [editingSellerId, setEditingSellerId] = useState<string | null>(null);

  const tiers = useMemo(() => [...state.commissionTiers].sort((a, b) => a.min - b.min), [state.commissionTiers]);

  const periodStart = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - weeks * 7);
    return d;
  }, [weeks]);

  const periodSales = useMemo(() => {
    let list = state.sales.filter((s) => new Date(s.date) >= periodStart);
    if (filterBranch !== "all") list = list.filter((s) => s.branch === filterBranch);
    return list;
  }, [state.sales, periodStart, filterBranch]);

  const summary = useMemo(() => {
    const map = new Map<string, { id: string; name: string; sales: number; revenue: number }>();
    for (const sale of periodSales) {
      const existing = map.get(sale.sellerId);
      if (existing) { existing.sales += 1; existing.revenue += sale.total; }
      else map.set(sale.sellerId, { id: sale.sellerId, name: sale.sellerName, sales: 1, revenue: sale.total });
    }
    return [...map.values()].map((row) => {
      const su = state.users.find((u) => u.id === row.id);
      const tier = findTier(tiers, row.revenue);
      const percent = su?.commissionMode === "custom" ? su.customCommissionPercent : (tier?.percent ?? 0);
      const rateLabel = su?.commissionMode === "custom" ? "Personalizado" : (tier ? tierLabel(tier) : "Sin rango");
      return { ...row, user: su, percent, rateLabel, commission: row.revenue * (percent / 100) };
    }).sort((a, b) => b.commission - a.commission);
  }, [periodSales, state.users, tiers]);

  const totalCommission = summary.reduce((s, r) => s + r.commission, 0);

  const updateTier = (id: string, patch: Partial<CommissionTier>) => setState((s) => {
    const ns = { ...s, commissionTiers: s.commissionTiers.map((t) => t.id === id ? { ...t, ...patch } : t) };
    saveState(ns); return ns;
  });
  const addTier = () => setState((s) => {
    const sorted = [...s.commissionTiers].sort((a, b) => a.min - b.min);
    const last = sorted[sorted.length - 1];
    const newMin = last ? (last.max ?? last.min + 10000) : 0;
    const ns = { ...s, commissionTiers: [...s.commissionTiers, { id: uid(), min: newMin, max: null, percent: 0 }] };
    saveState(ns); return ns;
  });
  const removeTier = (id: string) => setState((s) => {
    const ns = { ...s, commissionTiers: s.commissionTiers.filter((t) => t.id !== id) };
    saveState(ns); return ns;
  });

  const setSellerCommission = (id: string, patch: Partial<Pick<User, "commissionMode" | "customCommissionPercent">>) => setState((s) => {
    const ns = { ...s, users: s.users.map((u) => u.id === id ? { ...u, ...patch } : u) };
    saveState(ns); return ns;
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 p-4 flex flex-col gap-3">
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Periodo</label>
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            {[1, 2, 3, 4, 5, 6].map((w) => (
              <button key={w} onClick={() => setWeeks(w)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${weeks === w ? "bg-primary text-white" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
                {w} {w === 1 ? "semana" : "semanas"}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Select label="" value={filterBranch} onChange={setFilterBranch} className="flex-1 min-w-[160px]"
            options={[{value:"all",label:"Todas las sucursales"}, ...state.branches.map((b) => ({value:b,label:b}))]} />
          <button onClick={() => setEditingTiers(!editingTiers)}
            className={`flex items-center gap-1.5 px-3 py-2.5 rounded-lg border text-xs font-semibold transition-all flex-shrink-0 ${editingTiers ? "bg-primary/10 border-primary/30 text-primary" : "bg-secondary border-border text-muted-foreground hover:text-foreground"}`}>
            <SlidersHorizontal size={13} /> Rangos de comisión
          </button>
        </div>
      </div>

      <Modal open={editingTiers} onClose={() => setEditingTiers(false)} title="Rangos de comisión">
        <div className="p-5 flex flex-col gap-2">
          <p className="text-xs text-muted-foreground -mt-1">Deja "Hasta" vacío para "sin límite" (debería ser solo el último rango).</p>
          {tiers.map((t) => (
            <div key={t.id} className="flex items-center gap-2 bg-secondary border border-border rounded-lg px-2.5 py-2">
              <Input label="Desde" value={t.min} onChange={(v) => updateTier(t.id, { min: parseFloat(v) || 0 })} type="number" min={0} className="flex-1" />
              <Input label="Hasta" value={t.max ?? ""} onChange={(v) => updateTier(t.id, { max: v === "" ? null : (parseFloat(v) || 0) })} type="number" min={0} placeholder="Sin límite" className="flex-1" />
              <Input label="%" value={t.percent} onChange={(v) => updateTier(t.id, { percent: parseFloat(v) || 0 })} type="number" min={0} step={0.5} className="w-20" />
              <button onClick={() => removeTier(t.id)} className="text-muted-foreground hover:text-red-400 p-1.5 mt-4 flex-shrink-0"><Trash2 size={14} /></button>
            </div>
          ))}
          <Btn onClick={addTier} variant="outline" size="sm" className="self-start"><Plus size={13} /> Agregar rango</Btn>
          <Btn onClick={() => setEditingTiers(false)} className="mt-2"><Check size={15} /> Listo</Btn>
        </div>
      </Modal>

      <div className="flex-1 overflow-y-auto scrollbar-visible px-4 pb-4 flex flex-col gap-2">
        {summary.length === 0 && (
          <EmptyState icon={Percent} title="Sin ventas en este periodo" desc="Prueba con un periodo más largo o revisa el filtro de sucursal" />
        )}
        {summary.map((row) => (
          <div key={row.id} className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              {row.user && <Avatar user={row.user} size="sm" />}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{row.name}</p>
                <p className="text-xs text-muted-foreground">{row.sales} {row.sales === 1 ? "venta" : "ventas"} · {fmt(row.revenue)} vendido</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-bold text-emerald-400">{fmt(row.commission)}</p>
                <p className="text-[10px] text-muted-foreground">{row.percent}% · {row.rateLabel}</p>
              </div>
            </div>

            {editingSellerId === row.id ? (
              <div className="flex items-center gap-2 border-t border-border pt-3">
                <div className="flex gap-1.5 flex-1">
                  {(["tiers","custom"] as const).map((m) => (
                    <button key={m} onClick={() => setSellerCommission(row.id, { commissionMode: m })}
                      className={`flex-1 py-1.5 rounded-lg border text-xs font-semibold transition-all ${row.user?.commissionMode === m ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                      {m === "tiers" ? "Por rangos" : "Personalizado"}
                    </button>
                  ))}
                </div>
                {row.user?.commissionMode === "custom" && (
                  <Input value={row.user.customCommissionPercent} onChange={(v) => setSellerCommission(row.id, { customCommissionPercent: parseFloat(v) || 0 })}
                    type="number" min={0} step={0.5} className="w-20" />
                )}
                <button onClick={() => setEditingSellerId(null)} className="text-muted-foreground hover:text-foreground p-1.5"><Check size={15} /></button>
              </div>
            ) : (
              <button onClick={() => setEditingSellerId(row.id)} className="text-xs text-primary font-semibold text-left border-t border-border pt-2 hover:underline">
                Cambiar tipo de comisión
              </button>
            )}
          </div>
        ))}
        {summary.length > 0 && (
          <div className="flex items-center justify-between bg-secondary border border-border rounded-xl px-4 py-3 mt-1">
            <span className="text-sm font-semibold text-muted-foreground">Total a pagar</span>
            <span className="font-bold text-lg text-emerald-400">{fmt(totalCommission)}</span>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── USERS VIEW ───────────────────────────────────────────────────────────────

const blankUser = (defaultBranch: string): Omit<User,"id"> => ({
  name:"", username:"", password:"", role:"seller", branch:defaultBranch,
  commissionMode:"tiers", customCommissionPercent:5, active:true, avatar:undefined,
});

const UsersView = () => {
  const { state, setState } = useApp();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState(blankUser(state.branches[0]));
  const [showPw, setShowPw] = useState(false);

  const openNew = () => { setEditing(null); setForm(blankUser(state.branches[0])); setFormOpen(true); };
  const openEdit = (u: User) => {
    setEditing(u);
    // password intentionally left blank: the server never sends it back (see User.password),
    // and a blank value here means "keep the current one" when saving.
    setForm({ name:u.name, username:u.username, password:"", role:u.role, branch:u.branch, commissionMode:u.commissionMode, customCommissionPercent:u.customCommissionPercent, active:u.active, avatar:u.avatar });
    setFormOpen(true);
  };

  const save = () => {
    if (!form.name || !form.username || (!editing && !form.password)) return;
    // Blank password on an edit means "don't change it" — never let that overwrite the
    // (already-absent, since the server never sends it) local `password` field with "".
    const { password, ...formWithoutPassword } = form;
    const patch = password ? form : formWithoutPassword;
    setState((s) => {
      let ns: AppState;
      if (editing) {
        ns = { ...s, users: s.users.map((u) => u.id === editing.id ? { ...u, ...patch } : u) };
      } else {
        ns = { ...s, users: [...s.users, { id: uid(), ...form }] };
      }
      saveState(ns);
      return ns;
    });
    setFormOpen(false);
  };

  const toggleActive = (id: string) => {
    setState((s) => {
      const ns = { ...s, users: s.users.map((u) => u.id === id ? { ...u, active: !u.active } : u) };
      saveState(ns);
      return ns;
    });
  };

  const deleteUser = (id: string) => {
    setState((s) => {
      const ns = { ...s, users: s.users.filter((u) => u.id !== id) };
      saveState(ns);
      return ns;
    });
  };

  const [confirmDeleteUser, setConfirmDeleteUser] = useState<User | null>(null);
  const deleteUserNow = () => {
    if (!confirmDeleteUser) return;
    deleteUser(confirmDeleteUser.id);
    setConfirmDeleteUser(null);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 p-4 flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{state.users.length} usuarios registrados</p>
        <Btn onClick={openNew} size="md"><Plus size={15} /> Nuevo usuario</Btn>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-visible px-4 pb-4 flex flex-col gap-3">
        {state.users.map((u) => (
          <div key={u.id} className={`bg-card border rounded-xl p-4 transition-all ${u.active ? "border-border" : "border-border/40 opacity-60"}`}>
            <div className="flex items-start gap-3">
              <div className="rounded-xl overflow-hidden flex-shrink-0">
                <Avatar user={u} size="md" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-sm text-foreground">{u.name}</p>
                  <Badge className={roleBadge(u.role)}>{rLabel(u.role)}</Badge>
                  {!u.active && <Badge className="bg-red-500/20 text-red-400">Inactivo</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{u.username}</p>
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  <span className="text-xs text-muted-foreground flex items-center gap-1"><MapPin size={10} /> {u.branch}</span>
                  <span className="text-xs bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded-full font-semibold">
                    Comisión: {u.commissionMode === "custom" ? `${u.customCommissionPercent}% personalizado` : "Por rangos"}
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-1.5 flex-shrink-0">
                <Btn onClick={() => openEdit(u)} variant="ghost" size="sm"><Edit2 size={13} /></Btn>
                <Btn onClick={() => toggleActive(u.id)} variant="ghost" size="sm" className={u.active ? "text-amber-400" : "text-emerald-400"}>
                  {u.active ? <EyeOff size={13} /> : <Eye size={13} />}
                </Btn>
                <Btn onClick={() => setConfirmDeleteUser(u)} variant="danger" size="sm"><Trash2 size={13} /></Btn>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? "Editar usuario" : "Nuevo usuario"}>
        <div className="p-5 flex flex-col gap-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-3">Foto de perfil</label>
            <AvatarUpload
              avatar={form.avatar}
              name={form.name || "?"}
              onChange={(img) => setForm((f) => ({ ...f, avatar: img }))}
            />
          </div>
          <Input label="Nombre completo" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="Nombre Apellido" />
          <Input label="Usuario" value={form.username} onChange={(v) => setForm((f) => ({ ...f, username: v }))} placeholder="usuario" />
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Contraseña{editing && <span className="normal-case text-muted-foreground/70 font-normal"> (dejar en blanco para no cambiarla)</span>}
            </label>
            <div className="relative">
              <input type={showPw ? "text" : "password"} value={form.password ?? ""} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder={editing ? "••••••••" : "Mínimo 6 caracteres"}
                className="w-full bg-secondary border border-border rounded-lg px-3 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all" />
              <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Rol" value={form.role} onChange={(v) => setForm((f) => ({ ...f, role: v as UserRole }))}
              options={[{value:"admin",label:"Administrador"},{value:"warehouse",label:"Jefe Almacén"},{value:"seller",label:"Vendedor"}]} />
            <Select label="Sucursal" value={form.branch} onChange={(v) => setForm((f) => ({ ...f, branch: v }))}
              options={state.branches.map((b) => ({value:b,label:b}))} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tipo de comisión</label>
            <div className="flex gap-2">
              {(["tiers","custom"] as const).map((m) => (
                <button key={m} type="button" onClick={() => setForm((f) => ({ ...f, commissionMode: m }))}
                  className={`flex-1 py-2 rounded-lg border text-xs font-semibold transition-all ${form.commissionMode === m ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                  {m === "tiers" ? "Por rangos" : "Personalizado"}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">
              El porcentaje (de rango o personalizado) se ajusta en la página <span className="font-semibold text-foreground">Comisiones</span>.
            </p>
          </div>
          <div className="flex gap-3">
            <Btn onClick={() => setFormOpen(false)} variant="secondary" className="flex-1">Cancelar</Btn>
            <Btn onClick={save} disabled={!form.name || !form.username} className="flex-1">
              <Save size={15} /> {editing ? "Guardar" : "Crear usuario"}
            </Btn>
          </div>
        </div>
      </Modal>

      <Modal open={!!confirmDeleteUser} onClose={() => setConfirmDeleteUser(null)} title="Eliminar usuario">
        {confirmDeleteUser && (
          <div className="p-5 flex flex-col gap-4">
            <p className="text-sm text-foreground">
              ¿Seguro que quieres eliminar a <span className="font-semibold">{confirmDeleteUser.name}</span>? Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-3">
              <Btn onClick={() => setConfirmDeleteUser(null)} variant="secondary" className="flex-1">Cancelar</Btn>
              <Btn onClick={deleteUserNow} variant="danger" className="flex-1"><Trash2 size={15} /> Eliminar</Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

// ─── BRANCHES VIEW ────────────────────────────────────────────────────────────

const BranchesView = () => {
  const { state, setState } = useApp();
  const [newName, setNewName] = useState("");
  const [editingBranch, setEditingBranch] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  // Per-branch logo — used by the mandatory post-login branch picker (sellers). Uploaded/replaced
  // one branch at a time via a single shared hidden file input.
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [uploadingBranch, setUploadingBranch] = useState<string | null>(null);
  const [pendingLogoBranch, setPendingLogoBranch] = useState<string | null>(null);

  const triggerLogoUpload = (branch: string) => {
    setPendingLogoBranch(branch);
    logoInputRef.current?.click();
  };

  const handleLogoFile = async (files: FileList | null) => {
    const file = files?.[0];
    const branch = pendingLogoBranch;
    if (!file || !branch) return;
    setUploadingBranch(branch);
    try {
      const url = await uploadImage(file, "logos", state.branchLogos?.[branch]);
      setState((s) => {
        const ns = { ...s, branchLogos: { ...s.branchLogos, [branch]: url } };
        saveState(ns);
        return ns;
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al subir el logo");
    } finally {
      setUploadingBranch(null);
      setPendingLogoBranch(null);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  };

  const usersInBranch = (name: string) => state.users.filter((u) => u.branch === name).length;
  const hasStockInBranch = (name: string) =>
    state.products.some((p) => p.variants.some((v) => v.sizes.some((sz) => (sz.stockByBranch?.[name] ?? 0) > 0)));

  const addBranch = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    if (state.branches.some((b) => b.toLowerCase() === trimmed.toLowerCase())) {
      toast.error("Ya existe una sucursal con ese nombre");
      return;
    }
    setState((s) => {
      const ns = { ...s, branches: [...s.branches, trimmed] };
      saveState(ns);
      return ns;
    });
    setNewName("");
  };

  const startEdit = (name: string) => { setEditingBranch(name); setEditValue(name); };
  const cancelEdit = () => { setEditingBranch(null); setEditValue(""); };

  const confirmRename = (oldName: string) => {
    const trimmed = editValue.trim();
    if (!trimmed) { toast.error("El nombre no puede estar vacío"); return; }
    if (trimmed !== oldName && state.branches.some((b) => b.toLowerCase() === trimmed.toLowerCase())) {
      toast.error("Ya existe una sucursal con ese nombre");
      return;
    }
    if (trimmed !== oldName) {
      setState((s) => {
        const branchLogos = { ...s.branchLogos };
        if (oldName in branchLogos) {
          branchLogos[trimmed] = branchLogos[oldName];
          delete branchLogos[oldName];
        }
        const ns: AppState = {
          ...s,
          branches: s.branches.map((b) => (b === oldName ? trimmed : b)),
          branchLogos,
          users: s.users.map((u) => (u.branch === oldName ? { ...u, branch: trimmed } : u)),
          sales: s.sales.map((sale) => (sale.branch === oldName ? { ...sale, branch: trimmed } : sale)),
          products: s.products.map((p) => ({
            ...p,
            variants: p.variants.map((v) => ({
              ...v,
              sizes: v.sizes.map((sz) => {
                if (!sz.stockByBranch || !(oldName in sz.stockByBranch)) return sz;
                const { [oldName]: qty, ...rest } = sz.stockByBranch;
                return { ...sz, stockByBranch: { ...rest, [trimmed]: qty } };
              }),
            })),
          })),
        };
        saveState(ns);
        return ns;
      });
    }
    cancelEdit();
  };

  // Passes validation first (min 1 branch, no users/stock still pointing at it); only once that's
  // clear does it ask for a final confirmation before actually deleting.
  const [confirmDeleteBranch, setConfirmDeleteBranch] = useState<string | null>(null);

  const requestDeleteBranch = (name: string) => {
    if (state.branches.length <= 1) { toast.error("Debe quedar al menos una sucursal"); return; }
    const count = usersInBranch(name);
    if (count > 0) { toast.error(`No se puede eliminar: ${count} usuario${count === 1 ? "" : "s"} asignado${count === 1 ? "" : "s"} a esta sucursal`); return; }
    if (hasStockInBranch(name)) { toast.error("No se puede eliminar: todavía hay stock registrado en esta sucursal"); return; }
    setConfirmDeleteBranch(name);
  };

  const deleteBranchNow = () => {
    if (!confirmDeleteBranch) return;
    const name = confirmDeleteBranch;
    setState((s) => {
      const branchLogos = { ...s.branchLogos };
      delete branchLogos[name];
      const ns = { ...s, branches: s.branches.filter((b) => b !== name), branchLogos };
      saveState(ns);
      return ns;
    });
    setConfirmDeleteBranch(null);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 p-4 flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{state.branches.length} sucursales</p>
        <p className="text-[11px] text-muted-foreground -mt-1">Toca el logo de una sucursal para cambiarlo — se usa en el selector de sucursal al iniciar sesión.</p>
        <div className="flex items-center gap-2">
          <Input value={newName} onChange={setNewName} placeholder="Nombre de la nueva sucursal" className="flex-1" />
          <Btn onClick={addBranch} disabled={!newName.trim()} size="md" className="flex-shrink-0"><Plus size={15} /> Agregar</Btn>
        </div>
        <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleLogoFile(e.target.files)} />
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-visible px-4 pb-4 flex flex-col gap-2">
        {state.branches.map((b) => {
          const isEditing = editingBranch === b;
          const count = usersInBranch(b);
          return (
            <div key={b} className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3">
              {isEditing ? (
                <>
                  <input
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") confirmRename(b); if (e.key === "Escape") cancelEdit(); }}
                    className="flex-1 bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  <button onClick={() => confirmRename(b)} className="text-emerald-400 hover:text-emerald-300 p-1.5"><Check size={16} /></button>
                  <button onClick={cancelEdit} className="text-muted-foreground hover:text-foreground p-1.5"><X size={16} /></button>
                </>
              ) : (
                <>
                  <button onClick={() => triggerLogoUpload(b)} title="Cambiar logo de sucursal"
                    className="relative w-9 h-9 rounded-lg overflow-hidden bg-secondary border border-border flex items-center justify-center flex-shrink-0 group">
                    {state.branchLogos?.[b] ? (
                      <img src={state.branchLogos[b]} alt={b} className="w-full h-full object-cover" />
                    ) : (
                      <Warehouse size={16} className="text-muted-foreground" />
                    )}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      {uploadingBranch === b ? <Loader2 size={12} className="text-white animate-spin" /> : <ImageIcon size={12} className="text-white" />}
                    </div>
                  </button>
                  <span className="flex-1 font-semibold text-sm text-foreground"><BranchLabel branch={b} /></span>
                  <span className="text-xs text-muted-foreground flex-shrink-0">{count} usuario{count === 1 ? "" : "s"}</span>
                  <button onClick={() => startEdit(b)} className="text-muted-foreground hover:text-foreground p-1.5 flex-shrink-0"><Edit2 size={14} /></button>
                  <button onClick={() => requestDeleteBranch(b)} className="text-muted-foreground hover:text-red-400 p-1.5 flex-shrink-0"><Trash2 size={14} /></button>
                </>
              )}
            </div>
          );
        })}
      </div>

      <Modal open={!!confirmDeleteBranch} onClose={() => setConfirmDeleteBranch(null)} title="Eliminar sucursal">
        {confirmDeleteBranch && (
          <div className="p-5 flex flex-col gap-4">
            <p className="text-sm text-foreground">
              ¿Seguro que quieres eliminar <span className="font-semibold">"{confirmDeleteBranch}"</span>? Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-3">
              <Btn onClick={() => setConfirmDeleteBranch(null)} variant="secondary" className="flex-1">Cancelar</Btn>
              <Btn onClick={deleteBranchNow} variant="danger" className="flex-1"><Trash2 size={15} /> Eliminar</Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

// ─── HEADER ───────────────────────────────────────────────────────────────────

const Header = ({ user, view, onLogout, onChangeBranch }: { user: User; view: View; onLogout: () => void; onChangeBranch?: (b: string) => void }) => {
  const { state } = useApp();
  const viewTitles: Record<View, string> = {
    pos: "Punto de Venta", inventory: "Inventario",
    history: "Historial de Ventas", users: "Usuarios",
    commissions: "Comisiones", branches: "Sucursales",
  };
  const [branchOpen, setBranchOpen] = useState(false);
  return (
    <header className="relative z-30 flex-shrink-0 flex items-center justify-between px-4 py-3 bg-card/80 backdrop-blur-lg border-b border-border lg:pl-60 xl:pl-64">
      <div>
        <h2 className="font-bold text-sm text-foreground">{viewTitles[view]}</h2>
        {onChangeBranch ? (
          <div
            className="relative inline-block mt-1"
            onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setBranchOpen(false); }}
          >
            <button
              type="button"
              onClick={() => setBranchOpen((o) => !o)}
              title="Cambiar sucursal"
              className="flex items-center gap-1.5 bg-secondary border border-border rounded-lg pl-2.5 pr-2 py-1 text-xs font-semibold outline-none cursor-pointer hover:border-primary/40 focus:border-primary/50 transition-colors"
            >
              <BranchLabel branch={user.branch} />
              <ChevronDown size={11} className="text-muted-foreground" />
            </button>
            {branchOpen && (
              <div className="absolute z-20 left-0 mt-1 min-w-[9.5rem] bg-card border border-border rounded-lg shadow-lg py-1 overflow-hidden">
                {state.branches.map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => { onChangeBranch(b); setBranchOpen(false); }}
                    className="w-full text-left px-3 py-1.5 text-xs font-semibold hover:bg-secondary transition-colors"
                  >
                    <BranchLabel branch={b} />
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground"><BranchLabel branch={user.branch} /></p>
        )}
      </div>
      <div className="flex items-center gap-2.5">
        <div className="hidden sm:flex flex-col items-end">
          <p className="text-xs font-semibold text-foreground">{user.name}</p>
          <Badge className={roleBadge(user.role)}>{rLabel(user.role)}</Badge>
        </div>
        <Avatar user={user} size="sm" />
        <button onClick={onLogout} className="p-2 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all lg:hidden">
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
};

// ─── APP PROVIDER + ROOT ──────────────────────────────────────────────────────

const AppProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, setState] = useState<AppState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const boot = () => {
    setLoadError(null);
    loadState()
      .then((s) => {
        setState(s);
        try {
          const saved = localStorage.getItem(AUTH_KEY);
          if (saved) {
            const { id } = JSON.parse(saved);
            setCurrentUser(s.users.find((u) => u.id === id && u.active) ?? null);
          }
        } catch {}
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Error al cargar la información"));
  };

  useEffect(() => { boot(); }, []);

  const login = async (username: string, pw: string) => {
    if (!state) return false;
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password: pw }),
    });
    if (!res.ok) return false;
    const { userId } = await res.json();
    const u = state.users.find((u) => u.id === userId);
    if (!u) return false;
    setCurrentUser(u);
    localStorage.setItem(AUTH_KEY, JSON.stringify({ id: u.id }));
    return true;
  };

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem(AUTH_KEY);
  };

  // Ctx expects a plain AppState setter; `state` is only nullable during the initial load,
  // which happens before any of this is ever called (guarded by the early returns below).
  const updateState: React.Dispatch<React.SetStateAction<AppState>> = (update) => {
    setState((prev) => {
      if (!prev) return prev;
      return typeof update === "function" ? (update as (s: AppState) => AppState)(prev) : update;
    });
  };

  if (loadError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center bg-background">
        <AlertCircle size={40} className="text-red-400" />
        <div>
          <p className="font-semibold text-foreground">No se pudo conectar con la base de datos</p>
          <p className="text-sm text-muted-foreground mt-1">{loadError}</p>
        </div>
        <Btn onClick={boot}>Reintentar</Btn>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background">
        <Loader2 size={28} className="text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Cargando…</p>
      </div>
    );
  }

  return (
    <AppCtx.Provider value={{ state, currentUser, login, logout, setState: updateState }}>
      {children}
    </AppCtx.Provider>
  );
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<View>("pos");
  // Set only by an actual login (LoginView's onLogin) — restoring a session from localStorage on
  // page load goes through a different path (AppInner's currentUser effect) and deliberately does
  // NOT set this, so refreshing an already-picked seller session doesn't re-prompt every time.
  const [needsBranchSelect, setNeedsBranchSelect] = useState(false);

  return (
    <AppProvider>
      <AppInner user={user} setUser={setUser} view={view} setView={setView}
        needsBranchSelect={needsBranchSelect} setNeedsBranchSelect={setNeedsBranchSelect} />
      <Toaster richColors position="top-center" />
    </AppProvider>
  );
}

function AppInner({
  user, setUser, view, setView, needsBranchSelect, setNeedsBranchSelect,
}: {
  user: User | null;
  setUser: (u: User | null) => void;
  view: View;
  setView: (v: View) => void;
  needsBranchSelect: boolean;
  setNeedsBranchSelect: (v: boolean) => void;
}) {
  const { state, currentUser, logout, setState } = useApp();

  useEffect(() => {
    if (currentUser) setUser(currentUser);
  }, [currentUser]);

  const handleLogout = () => {
    logout();
    setUser(null);
    setView("pos");
    setNeedsBranchSelect(false);
  };

  const changeBranch = (branch: string) => {
    if (!user) return;
    setState((s) => {
      const ns = { ...s, users: s.users.map((u) => u.id === user.id ? { ...u, branch } : u) };
      saveState(ns);
      return ns;
    });
    setUser({ ...user, branch });
  };

  // Sellers pick which branch they're working from right after logging in — a mandatory, once-
  // per-login modal (no close/backdrop-dismiss) rather than an always-available in-app switcher
  // like admin's. Changing branches means logging out and back in and choosing again.
  const handleLogin = (u: User) => {
    setUser(u);
    if (u.role === "seller") setNeedsBranchSelect(true);
  };

  const changeLogo = (logoUrl: string | undefined) => {
    setState((s) => {
      const ns = { ...s, logoUrl };
      saveState(ns);
      return ns;
    });
  };

  if (!user) {
    return <LoginView onLogin={handleLogin} />;
  }

  const VIEW_COMPONENTS: Record<View, React.ReactNode> = {
    pos: <POSView user={user} />,
    inventory: <InventoryView user={user} />,
    history: <HistoryView user={user} />,
    commissions: user.role === "admin" ? <CommissionsView /> : <EmptyState icon={ShieldCheck} title="Acceso restringido" desc="Solo administradores pueden ver comisiones" />,
    users: user.role === "admin" ? <UsersView /> : <EmptyState icon={ShieldCheck} title="Acceso restringido" desc="Solo administradores pueden gestionar usuarios" />,
    branches: user.role === "admin" ? <BranchesView /> : <EmptyState icon={ShieldCheck} title="Acceso restringido" desc="Solo administradores pueden gestionar sucursales" />,
  };

  const allowedViews = NAV_ITEMS.filter((n) => n.roles.includes(user.role)).map((n) => n.view);
  const safeView = allowedViews.includes(view) ? view : allowedViews[0];

  return (
    <>
      <div className="flex h-screen overflow-hidden bg-background">
        <SideNav view={safeView} setView={setView} role={user.role} user={user} onLogout={handleLogout}
          logoUrl={state.logoUrl} onChangeLogo={user.role === "admin" ? changeLogo : undefined} />
        <div className="flex flex-col flex-1 min-w-0 lg:pl-56 xl:pl-56">
          <Header user={user} view={safeView} onLogout={handleLogout} onChangeBranch={user.role === "admin" ? changeBranch : undefined} />
          <main className="flex-1 overflow-hidden">
            {VIEW_COMPONENTS[safeView]}
          </main>
          <div className="lg:hidden h-16 flex-shrink-0" />
        </div>
        <div className="no-print lg:hidden">
          <BottomNav view={safeView} setView={setView} role={user.role} />
        </div>
      </div>

      {/* Mandatory, once-per-login branch pick for sellers — no close/backdrop-dismiss. */}
      <Modal open={user.role === "seller" && needsBranchSelect} onClose={() => {}} title="Selecciona tu sucursal">
        <div className="p-5 flex flex-col gap-4">
          <p className="text-xs text-muted-foreground">Elige la sucursal en la que trabajarás durante esta sesión. Para cambiarla más adelante, cierra sesión y vuelve a entrar.</p>
          <div className="grid grid-cols-2 gap-3">
            {state.branches.map((b) => (
              <button key={b} onClick={() => { changeBranch(b); setNeedsBranchSelect(false); }}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border bg-secondary hover:border-primary/50 hover:bg-accent transition-all">
                <div className="w-16 h-16 rounded-xl overflow-hidden bg-background border border-border flex items-center justify-center flex-shrink-0">
                  {state.branchLogos?.[b] ? (
                    <img src={state.branchLogos[b]} alt={b} className="w-full h-full object-cover" />
                  ) : (
                    <Store size={24} className="text-muted-foreground" />
                  )}
                </div>
                <span className="text-sm font-semibold text-center"><BranchLabel branch={b} /></span>
              </button>
            ))}
          </div>
        </div>
      </Modal>
    </>
  );
}
