import React, {
  useState, useContext, createContext, useEffect, useRef, useMemo,
} from "react";
import {
  ShoppingCart, Package, ClipboardList, Users, LayoutDashboard,
  Plus, Minus, Trash2, Search, X, ChevronDown, LogOut, Edit2,
  Eye, EyeOff, Clock, CreditCard, Banknote, Wifi, ArrowLeft,
  Save, Hash, Layers, MapPin, ChevronRight, ChevronLeft, Tag, Check,
  Filter, SlidersHorizontal, AlertCircle, Store, Calendar,
  TrendingUp, Boxes, RotateCcw, Printer, UserCog, ShieldCheck,
  Warehouse, ChevronUp, Circle, Barcode, ImageIcon,
} from "lucide-react";

// ─── TYPES ───────────────────────────────────────────────────────────────────

type UserRole = "admin" | "warehouse" | "seller";
type Gender = "men" | "women" | "unisex" | "accessories";
type PaymentMethod = "cash" | "card" | "contactless";
type View = "pos" | "inventory" | "history" | "users";

interface User {
  id: string;
  name: string;
  email: string;
  password: string;
  role: UserRole;
  branch: string;
  commissionType: "percentage" | "fixed";
  commissionValue: number;
  active: boolean;
  avatar?: string;
}

interface VariantSize {
  size: string;
  stock: number;
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
  commissionType: "percentage" | "fixed";
  commissionRate: number;
  commissionAmount: number;
}

interface AppState {
  users: User[];
  products: Product[];
  sales: Sale[];
  barcodeCounter: number;
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  "Camisetas","Pantalones","Vestidos","Blusas","Faldas","Chaquetas",
  "Abrigos","Ropa Interior","Deportiva","Relojes","Joyería","Bolsos",
  "Cinturones","Accesorios",
];
const BRANCHES = ["Sucursal Centro","Sucursal Norte","Sucursal Sur","Sucursal Mall"];
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
  name: "MODA ÉLITE",
  slogan: "Viste con estilo · Vive con clase",
  address: "Av. Principal #123, Col. Centro",
  phone: "(55) 1234-5678",
  email: "ventas@modaelite.com",
};

// ─── INITIAL DATA ─────────────────────────────────────────────────────────────

const INIT_USERS: User[] = [
  { id:"u1", name:"Carlos Mendoza", email:"admin@modaelite.com", password:"admin123",
    role:"admin", branch:"Sucursal Centro", commissionType:"percentage", commissionValue:5, active:true },
  { id:"u2", name:"Sofía Ramírez", email:"almacen@modaelite.com", password:"almacen123",
    role:"warehouse", branch:"Sucursal Norte", commissionType:"percentage", commissionValue:3, active:true },
  { id:"u3", name:"Miguel Torres", email:"vendedor@modaelite.com", password:"vendedor123",
    role:"seller", branch:"Sucursal Centro", commissionType:"fixed", commissionValue:50, active:true },
  { id:"u4", name:"Ana García", email:"ana@modaelite.com", password:"ana123",
    role:"seller", branch:"Sucursal Norte", commissionType:"percentage", commissionValue:4, active:true },
];

const INIT_PRODUCTS: Product[] = [
  { id:"p1", sku:"CAM-001", barcode:"7890000001001", name:"Camiseta Slim Fit Premium",
    description:"Algodón 100% peinado, corte slim moderno", category:"Camisetas", gender:"men", price:299, sizeSystem:"sml" as SizeSystem, images:[],
    variants:[
      {id:"v1-blanco", color:"Blanco", colorHex:"#F5F5F0", model:"Slim Fit",   sizes:[{size:"S",stock:15},{size:"M",stock:20},{size:"L",stock:8}]},
      {id:"v1-negro",  color:"Negro",  colorHex:"#1a1a1a",  model:"Slim Fit",   sizes:[{size:"M",stock:12},{size:"L",stock:6}]},
      {id:"v1-marino", color:"Azul Marino", colorHex:"#1B3A6B", model:"Regular Fit", sizes:[{size:"M",stock:10},{size:"L",stock:4}]},
    ], active:true, createdAt:"2025-01-15" },
  { id:"p2", sku:"VES-001", barcode:"7890000001002", name:"Vestido Floral Verano",
    description:"Vestido ligero con estampado floral, tela chiffon", category:"Vestidos", gender:"women", price:599, sizeSystem:"sml" as SizeSystem, images:[],
    variants:[
      {id:"v2-rosa",   color:"Rosa",       colorHex:"#FF69B4", model:"A-line Floral", sizes:[{size:"XS",stock:6},{size:"S",stock:9},{size:"M",stock:3}]},
      {id:"v2-menta",  color:"Verde Menta",colorHex:"#80CBC4", model:"A-line Floral", sizes:[{size:"S",stock:5},{size:"M",stock:4}]},
      {id:"v2-blanco", color:"Blanco",     colorHex:"#F5F5F0", model:"A-line Floral", sizes:[{size:"S",stock:7},{size:"M",stock:2}]},
    ], active:true, createdAt:"2025-01-20" },
  { id:"p3", sku:"REL-001", barcode:"7890000001003", name:"Reloj Elegance Classic",
    description:"Correa de cuero genuino, esfera minimalista chapada", category:"Relojes", gender:"accessories", price:1299, sizeSystem:"unica" as SizeSystem, images:[],
    variants:[
      {id:"v3-dorado",   color:"Dorado",   colorHex:"#FFD700", model:"Classic Leather", sizes:[{size:"Única",stock:5}]},
      {id:"v3-plateado", color:"Plateado", colorHex:"#C0C0C0", model:"Classic Leather", sizes:[{size:"Única",stock:7}]},
      {id:"v3-negro",    color:"Negro",    colorHex:"#1a1a1a",  model:"Sport",           sizes:[{size:"Única",stock:3}]},
    ], active:true, createdAt:"2025-02-01" },
  { id:"p4", sku:"BOL-001", barcode:"7890000001004", name:"Bolso Tote Cuero",
    description:"Cuero sintético premium con múltiples compartimentos", category:"Bolsos", gender:"accessories", price:899, sizeSystem:"unica" as SizeSystem, images:[],
    variants:[
      {id:"v4-negro", color:"Negro", colorHex:"#1a1a1a",  model:"Tote Grande",  sizes:[{size:"Única",stock:8}]},
      {id:"v4-cafe",  color:"Café",  colorHex:"#795548",  model:"Tote Grande",  sizes:[{size:"Única",stock:5}]},
      {id:"v4-beige", color:"Beige", colorHex:"#D4B896",  model:"Tote Mediano", sizes:[{size:"Única",stock:10}]},
    ], active:true, createdAt:"2025-02-05" },
  { id:"p5", sku:"PAN-001", barcode:"7890000001005", name:"Pantalón Chino Clásico",
    description:"Algodón stretch de corte recto, cómodo y versátil", category:"Pantalones", gender:"men", price:499, sizeSystem:"numeric" as SizeSystem, images:[],
    variants:[
      {id:"v5-beige",  color:"Beige",      colorHex:"#D4B896", model:"Chino Recto", sizes:[{size:"30",stock:12},{size:"32",stock:15},{size:"34",stock:8}]},
      {id:"v5-marino", color:"Azul Marino",colorHex:"#1B3A6B", model:"Chino Recto", sizes:[{size:"30",stock:6},{size:"32",stock:10}]},
      {id:"v5-gris",   color:"Gris",       colorHex:"#9E9E9E", model:"Chino Slim",  sizes:[{size:"30",stock:8},{size:"32",stock:5}]},
    ], active:true, createdAt:"2025-02-10" },
  { id:"p6", sku:"BLU-001", barcode:"7890000001006", name:"Blusa Seda Drapeada",
    description:"Seda artificial con caída elegante, varios escotes", category:"Blusas", gender:"women", price:449, sizeSystem:"sml" as SizeSystem, images:[],
    variants:[
      {id:"v6-blanco", color:"Blanco", colorHex:"#F5F5F0", model:"V-neck Drapeada",   sizes:[{size:"S",stock:8},{size:"M",stock:4}]},
      {id:"v6-negro",  color:"Negro",  colorHex:"#1a1a1a",  model:"V-neck Drapeada",   sizes:[{size:"M",stock:6},{size:"L",stock:2}]},
      {id:"v6-morado", color:"Morado", colorHex:"#9C27B0",  model:"Round Drapeada",    sizes:[{size:"S",stock:4},{size:"M",stock:3}]},
    ], active:true, createdAt:"2025-02-15" },
  { id:"p7", sku:"JOY-001", barcode:"7890000001007", name:"Collar Perlas Naturales",
    description:"Perlas de agua dulce con cierre de plata .925", category:"Joyería", gender:"accessories", price:750, sizeSystem:"unica" as SizeSystem, images:[],
    variants:[
      {id:"v7-blanco",   color:"Blanco",   colorHex:"#F5F5F0", model:"Clásico 42cm", sizes:[{size:"Única",stock:6}]},
      {id:"v7-plateado", color:"Plateado", colorHex:"#C0C0C0", model:"Choker 35cm",  sizes:[{size:"Única",stock:4}]},
    ], active:true, createdAt:"2025-03-01" },
];

const INIT_SALES: Sale[] = [
  { id:"sale-001", date:"2025-07-10T10:30:00", sellerId:"u3", sellerName:"Miguel Torres",
    branch:"Sucursal Centro",
    items:[
      {cartId:"ci1",productId:"p1",variantId:"v1b",name:"Camiseta Slim Fit Premium",price:299,quantity:2,color:"Blanco",model:"Slim Fit",size:"M"},
      {cartId:"ci2",productId:"p5",variantId:"v5b",name:"Pantalón Chino Clásico",price:499,quantity:1,color:"Beige",model:"Chino Recto",size:"32"},
    ],
    subtotal:1097, total:1097, paymentMethod:"card", commissionType:"fixed", commissionRate:50, commissionAmount:50 },
  { id:"sale-002", date:"2025-07-11T14:15:00", sellerId:"u4", sellerName:"Ana García",
    branch:"Sucursal Norte",
    items:[
      {cartId:"ci3",productId:"p2",variantId:"v2b",name:"Vestido Floral Verano",price:599,quantity:1,color:"Rosa",model:"A-line Floral",size:"S"},
      {cartId:"ci4",productId:"p4",variantId:"v4c",name:"Bolso Tote Cuero",price:899,quantity:1,color:"Beige",model:"Tote Mediano",size:"Único"},
    ],
    subtotal:1498, total:1498, paymentMethod:"cash", commissionType:"percentage", commissionRate:4, commissionAmount:59.92 },
  { id:"sale-003", date:"2025-07-12T09:00:00", sellerId:"u3", sellerName:"Miguel Torres",
    branch:"Sucursal Centro",
    items:[
      {cartId:"ci5",productId:"p3",variantId:"v3a",name:"Reloj Elegance Classic",price:1299,quantity:1,color:"Dorado",model:"Classic Leather",size:"Único"},
    ],
    subtotal:1299, total:1299, paymentMethod:"contactless", commissionType:"fixed", commissionRate:50, commissionAmount:50 },
  { id:"sale-004", date:"2025-07-12T11:45:00", sellerId:"u4", sellerName:"Ana García",
    branch:"Sucursal Norte",
    items:[
      {cartId:"ci6",productId:"p7",variantId:"v7a",name:"Collar Perlas Naturales",price:750,quantity:1,color:"Blanco",model:"Clásico 42cm",size:"Único"},
      {cartId:"ci7",isCustom:true,name:"Envolver regalo",price:50,quantity:1},
    ],
    subtotal:800, total:800, paymentMethod:"card", commissionType:"percentage", commissionRate:4, commissionAmount:32 },
];

// ─── PERSISTENCE ──────────────────────────────────────────────────────────────

const STATE_KEY = "moda_state_v2";
const AUTH_KEY  = "moda_auth_v2";

const loadState = (): AppState => {
  try {
    const s = localStorage.getItem(STATE_KEY);
    if (s) {
      const parsed: AppState = JSON.parse(s);
      // Migrate old products/users that lack new fields
      parsed.users = parsed.users.map((u) => ({ avatar: undefined, ...u }));
      parsed.products = parsed.products.map((p) => {
        const base = { images: [], sizeSystem: "sml" as SizeSystem, ...p };
        // Migrate flat size+stock variants to grouped sizes format
        base.variants = base.variants.map((v: any) => {
          if (v.sizes) return v; // already new format
          return { id: v.id, color: v.color, colorHex: v.colorHex, model: v.model, sizes: [{ size: v.size ?? "Único", stock: v.stock ?? 0 }] };
        });
        // Merge same color+model variants that ended up separate due to old format
        const merged: ProductVariant[] = [];
        for (const v of base.variants as ProductVariant[]) {
          const existing = merged.find((m) => m.color === v.color && m.model === v.model);
          if (existing) { existing.sizes.push(...v.sizes); } else { merged.push({ ...v }); }
        }
        base.variants = merged;
        return base;
      });
      return parsed;
    }
  } catch {}
  return { users: INIT_USERS, products: INIT_PRODUCTS, sales: INIT_SALES, barcodeCounter: 1008 };
};

const saveState = (s: AppState) => {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch {}
};

// ─── CONTEXT ──────────────────────────────────────────────────────────────────

interface Ctx {
  state: AppState;
  currentUser: User | null;
  login: (email: string, pw: string) => boolean;
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

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

const totalVariantStock = (v: ProductVariant) => (v.sizes ?? []).reduce((s, sz) => s + sz.stock, 0);
const totalProductStock = (p: Product) => p.variants.reduce((s, v) => s + totalVariantStock(v), 0);

const gLabel = (g: Gender) => ({ men:"Hombre", women:"Mujer", unisex:"Unisex", accessories:"Accesorios" }[g]);
const rLabel = (r: UserRole) => ({ admin:"Administrador", warehouse:"Jefe Almacén", seller:"Vendedor" }[r]);
const pLabel = (p: PaymentMethod) => ({ cash:"Efectivo", card:"Tarjeta", contactless:"Contactless" }[p]);

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
  label, value, onChange, placeholder, type = "text", className = "", icon, min, step,
}: {
  label?: string; value: string | number; onChange: (v: string) => void; placeholder?: string;
  type?: string; className?: string; icon?: React.ReactNode; min?: number; step?: number;
}) => (
  <div className={`flex flex-col gap-1.5 ${className}`}>
    {label && <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</label>}
    <div className="relative">
      {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{icon}</span>}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        min={min}
        step={step}
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
  open, onClose, title, children, wide = false,
}: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean;
}) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative z-10 bg-card border border-border rounded-t-2xl sm:rounded-2xl w-full ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"} max-h-[92vh] flex flex-col shadow-2xl`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <h3 className="font-semibold text-base text-foreground">{title}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-accent transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1">{children}</div>
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

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        onChange([...images, result]);
      };
      reader.readAsDataURL(file);
    });
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
          onClick={() => inputRef.current?.click()}
          className="w-20 h-20 rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 flex flex-col items-center justify-center text-muted-foreground hover:text-primary transition-all gap-1 flex-shrink-0"
        >
          <ImageIcon size={18} />
          <span className="text-[10px] font-semibold">Agregar</span>
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

  const handleFile = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => onChange(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex items-center gap-4">
      <div className="relative group cursor-pointer" onClick={() => inputRef.current?.click()}>
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
        <Btn size="sm" variant="outline" onClick={() => inputRef.current?.click()}>
          <ImageIcon size={13} /> {avatar ? "Cambiar foto" : "Subir foto"}
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
  const [imgIdx, setImgIdx] = useState(0);
  const totalStock = product.variants.reduce((s, v) => s + v.stock, 0);
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
                const stock = product.variants.filter((v) => v.color === color).reduce((s, v) => s + v.stock, 0);
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

          {/* Variants */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Variantes y stock</p>
            <div className="bg-secondary rounded-xl overflow-hidden border border-border">
              {product.variants.map((v, i) => (
                <div key={v.id} className={`flex items-center gap-3 px-3 py-2.5 ${i < product.variants.length - 1 ? "border-b border-border/50" : ""}`}>
                  <span className="w-3.5 h-3.5 rounded-full flex-shrink-0 border border-white/10" style={{ background: v.colorHex }} />
                  <span className="text-xs text-foreground flex-1">{v.color} · {v.model}{v.size !== "Único" ? ` · ${v.size}` : ""}</span>
                  <StockBadge stock={v.stock} />
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
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");

  const handle = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (login(email, pw)) {
      const u = state.users.find((u) => u.email === email && u.active)!;
      onLogin(u);
    } else {
      setError("Credenciales incorrectas o cuenta inactiva.");
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 mb-4">
            <Store size={32} className="text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">{STORE.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">{STORE.slogan}</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-6 shadow-xl shadow-black/30">
          <h2 className="text-lg font-semibold mb-5">Iniciar sesión</h2>
          <form onSubmit={handle} className="flex flex-col gap-4">
            <Input label="Correo electrónico" value={email} onChange={setEmail} placeholder="usuario@modaelite.com" type="email" icon={<UserCog size={15} />} />
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
            <Btn type="submit" size="lg" className="mt-1 w-full">Entrar</Btn>
          </form>
          <div className="mt-5 pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground text-center mb-3">Cuentas de demostración:</p>
            <div className="flex flex-col gap-2">
              {[
                { email:"admin@modaelite.com", pw:"admin123", role:"Administrador" },
                { email:"almacen@modaelite.com", pw:"almacen123", role:"Jefe Almacén" },
                { email:"vendedor@modaelite.com", pw:"vendedor123", role:"Vendedor" },
              ].map((d) => (
                <button key={d.email} onClick={() => { setEmail(d.email); setPw(d.pw); }} className="text-left text-xs bg-secondary hover:bg-accent border border-border rounded-lg px-3 py-2 transition-colors">
                  <span className="font-semibold text-foreground">{d.role}</span>
                  <span className="text-muted-foreground ml-2">{d.email}</span>
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
  { view:"inventory", label:"Inventario", icon:Layers,          roles:["admin","warehouse"] },
  { view:"history",   label:"Historial",  icon:ClipboardList,   roles:["admin","warehouse","seller"] },
  { view:"users",     label:"Usuarios",   icon:Users,           roles:["admin"] },
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

const SideNav = ({ view, setView, role, user, onLogout }: {
  view: View; setView: (v: View) => void; role: UserRole; user: User; onLogout: () => void;
}) => {
  const items = NAV_ITEMS.filter((n) => n.roles.includes(role));
  return (
    <aside className="hidden lg:flex flex-col w-56 min-h-screen bg-sidebar border-r border-sidebar-border fixed left-0 top-0 z-40">
      <div className="p-5 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
            <Store size={18} className="text-primary" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-sm text-foreground leading-tight">{STORE.name}</p>
            <p className="text-xs text-muted-foreground truncate">{user.branch}</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 p-3 flex flex-col gap-1">
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
      <div className="p-3 border-t border-sidebar-border">
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

const ReceiptModal = ({ sale, onClose }: { sale: Sale; onClose: () => void }) => {
  const printRef = useRef<HTMLDivElement>(null);

  const doPrint = () => {
    const w = window.open("", "_blank", "width=400,height=700");
    if (!w || !printRef.current) return;
    w.document.write(`
      <!DOCTYPE html><html><head>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Courier New', monospace; font-size: 11px; background: white; color: #000; padding: 8px; width: 280px; }
        .center { text-align: center; }
        .bold { font-weight: bold; }
        .line { border-top: 1px dashed #000; margin: 6px 0; }
        .row { display: flex; justify-content: space-between; margin: 2px 0; }
        .large { font-size: 14px; font-weight: bold; }
        .title { font-size: 16px; font-weight: bold; letter-spacing: 2px; }
      </style></head><body>${printRef.current.innerHTML}</body></html>`);
    w.document.close();
    w.focus();
    w.print();
    w.close();
  };

  return (
    <Modal open title="Ticket de Venta" onClose={onClose}>
      <div className="p-5">
        <div ref={printRef} className="font-mono text-xs text-foreground leading-relaxed">
          <div className="text-center mb-3">
            <p className="font-bold text-base tracking-widest">{STORE.name}</p>
            <p className="text-muted-foreground text-xs">{STORE.slogan}</p>
            <p className="text-muted-foreground text-xs mt-1">{STORE.address}</p>
            <p className="text-muted-foreground text-xs">{STORE.phone}</p>
          </div>
          <div className="border-t border-dashed border-border my-3" />
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted-foreground">Folio:</span>
            <span className="font-mono font-semibold">{sale.id.toUpperCase()}</span>
          </div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted-foreground">Fecha:</span>
            <span>{fmtDate(sale.date)}</span>
          </div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted-foreground">Vendedor:</span>
            <span>{sale.sellerName}</span>
          </div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted-foreground">Sucursal:</span>
            <span>{sale.branch}</span>
          </div>
          <div className="border-t border-dashed border-border my-3" />
          <p className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wider">Artículos</p>
          {sale.items.map((item) => (
            <div key={item.cartId} className="mb-2">
              <div className="flex justify-between">
                <span className="font-semibold text-xs flex-1 pr-2 leading-tight">{item.name}</span>
                <span className="font-semibold text-xs">{fmt(item.price * item.quantity)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground text-xs">
                <span>{item.quantity} × {fmt(item.price)}{item.color ? ` · ${item.color}` : ""}{item.size && item.size !== "Único" ? ` / ${item.size}` : ""}</span>
              </div>
            </div>
          ))}
          <div className="border-t border-dashed border-border my-3" />
          <div className="flex justify-between mb-1 text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{fmt(sale.subtotal)}</span>
          </div>
          <div className="flex justify-between font-bold text-base mt-2">
            <span>TOTAL</span>
            <span className="text-primary">{fmt(sale.total)}</span>
          </div>
          <div className="flex justify-between mt-2 text-xs">
            <span className="text-muted-foreground">Pago</span>
            <span className="font-semibold">{pLabel(sale.paymentMethod)}</span>
          </div>
          <div className="border-t border-dashed border-border my-3" />
          <div className="text-center text-xs text-muted-foreground">
            <p>¡Gracias por su compra!</p>
            <p className="mt-1">{STORE.email}</p>
            <div className="flex justify-center gap-0.5 mt-3">
              {Array.from({ length: 36 }).map((_, i) => (
                <div key={i} style={{ width: i % 3 === 0 ? 3 : 1.5, height: 28, background: "#000", opacity: Math.random() > 0.3 ? 1 : 0 }} />
              ))}
            </div>
            <p className="mt-1 font-mono text-xs">{sale.id.toUpperCase()}</p>
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
    const commAmt = user.commissionType === "percentage"
      ? subtotal * (user.commissionValue / 100)
      : user.commissionValue;

    const sale: Sale = {
      id: `sale-${Date.now()}`,
      date: new Date().toISOString(),
      sellerId: user.id,
      sellerName: user.name,
      branch: user.branch,
      items: cart,
      subtotal,
      total: subtotal,
      paymentMethod: payMethod,
      commissionType: user.commissionType,
      commissionRate: user.commissionValue,
      commissionAmount: commAmt,
    };

    // Reduce stock in new grouped sizes model
    const updatedProducts = state.products.map((p) => ({
      ...p,
      variants: p.variants.map((v) => {
        const ci = cart.find((c) => c.variantId === v.id);
        if (!ci) return v;
        return {
          ...v,
          sizes: v.sizes.map((sz) =>
            sz.size === ci.size ? { ...sz, stock: Math.max(0, sz.stock - ci.quantity) } : sz
          ),
        };
      }),
    }));

    setState((s) => {
      const ns = { ...s, products: updatedProducts, sales: [sale, ...s.sales] };
      saveState(ns);
      return ns;
    });
    setReceipt(sale);
    setCart([]);
    setPayModal(false);
    setTab("search");
  };

  const change = payMethod === "cash" && cashGiven ? parseFloat(cashGiven) - subtotal : 0;

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

          <div className="flex-1 overflow-y-auto px-4 pb-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-3 content-start">
            {/* Custom item card */}
            <button
              onClick={() => setCustomModal(true)}
              className="bg-card border-2 border-dashed border-border rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/5 transition-all min-h-[120px]"
            >
              <Plus size={22} />
              <span className="text-xs font-semibold text-center">Artículo personalizado</span>
            </button>

            {filtered.map((p) => {
              const totalStock = totalProductStock(p);
              return (
                <div key={p.id} className="bg-card border border-border rounded-xl overflow-hidden hover:border-primary/40 transition-all flex flex-col group">
                  {/* Image area → opens detail */}
                  <button
                    onClick={() => setDetailProduct(p)}
                    className="relative h-32 bg-secondary/40 flex-shrink-0 overflow-hidden"
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
                    className="p-3 text-left flex flex-col gap-1.5 flex-1 hover:bg-accent/20 transition-colors active:scale-95"
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

          <div className="flex-1 overflow-y-auto">
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
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">Talla / Tamaño</label>
                <div className="flex flex-wrap gap-2">
                  {selectedVariant.sizes.map((sz) => (
                    <button
                      key={sz.size}
                      onClick={() => { setSelSize(sz.size); setSelQty(1); }}
                      disabled={sz.stock === 0}
                      className={`px-3 py-2 rounded-lg border text-sm transition-all flex items-center gap-2 ${selSize === sz.size ? "border-primary bg-primary/10 text-primary font-bold" : sz.stock === 0 ? "border-border/30 text-muted-foreground/30 cursor-not-allowed" : "border-border text-foreground hover:border-primary/40"}`}
                    >
                      <span className="font-semibold">{sz.size}</span>
                      {sz.stock > 0 && sz.stock <= 5
                        ? <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-1 rounded">{sz.stock} pzs</span>
                        : sz.stock === 0
                          ? <span className="text-[10px] text-red-400">Sin stock</span>
                          : <span className="text-[10px] text-muted-foreground">{sz.stock} pzs</span>
                      }
                    </button>
                  ))}
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
                    <button onClick={() => setSelQty(Math.min(selectedSizeObj.stock, selQty + 1))} className="p-1.5 text-muted-foreground hover:text-foreground"><Plus size={14} /></button>
                  </div>
                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                    Stock: <StockBadge stock={selectedSizeObj.stock} />
                  </div>
                </div>
                <p className="text-xs font-mono text-muted-foreground mt-2">SKU: {variantModal.sku} · {selectedVariant?.id}</p>
              </div>
            )}

            <div className="flex gap-3 mt-2">
              <Btn onClick={() => setVariantModal(null)} variant="secondary" className="flex-1">Cancelar</Btn>
              <Btn onClick={addToCart} disabled={!selectedSizeObj || selectedSizeObj.stock === 0 || !selSize} className="flex-1">
                <ShoppingCart size={15} /> Agregar — {selectedSizeObj ? fmt(variantModal.price * selQty) : fmt(variantModal.price)}
              </Btn>
            </div>
          </div>
        )}
      </Modal>

      {/* Custom item modal */}
      <Modal open={customModal} onClose={() => setCustomModal(false)} title="Artículo personalizado">
        <div className="p-5 flex flex-col gap-4">
          <Input label="Nombre del artículo" value={custName} onChange={setCustName} placeholder="Ej. Alteración de pantalón" />
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

      {/* Payment modal */}
      <Modal open={payModal} onClose={() => setPayModal(false)} title="Resumen y pago">
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
                { m:"contactless" as PaymentMethod, label:"Contactless", icon:Wifi },
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
              <Input label="Efectivo recibido" value={cashGiven} onChange={setCashGiven} type="number" min={0} step={0.5} placeholder={String(subtotal)} />
              {cashGiven && parseFloat(cashGiven) >= subtotal && (
                <div className="flex justify-between bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-4 py-3 text-sm">
                  <span className="text-emerald-400 font-semibold">Cambio</span>
                  <span className="text-emerald-400 font-bold">{fmt(change)}</span>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <Btn onClick={() => setPayModal(false)} variant="secondary" className="flex-1">Cancelar</Btn>
            <Btn
              onClick={confirmSale}
              disabled={payMethod === "cash" && !!cashGiven && parseFloat(cashGiven) < subtotal}
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
  const [vSize, setVSize] = useState("");
  const [vStock, setVStock] = useState(0);
  const [expandedVariantId, setExpandedVariantId] = useState<string | null>(null);

  // Barcode modal
  const [barcodeProduct, setBarcodeProduct] = useState<Product | null>(null);

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

  const draftKey = (variantId: string, size: string) => `${variantId}-${size}`;

  const setStockAbsolute = (productId: string, variantId: string, size: string, value: number) => {
    const clamped = Math.max(0, isNaN(value) ? 0 : value);
    setState((s) => {
      const ns = { ...s, products: s.products.map((p) => p.id !== productId ? p : {
        ...p, variants: p.variants.map((v) => v.id !== variantId ? v : {
          ...v, sizes: v.sizes.map((sz) => sz.size !== size ? sz : { ...sz, stock: clamped }),
        }),
      })};
      saveState(ns); return ns;
    });
  };

  const adjustStock = (productId: string, variantId: string, size: string, delta: number, currentStock: number) => {
    const next = Math.max(0, currentStock + delta);
    setStockDraft((d) => ({ ...d, [draftKey(variantId, size)]: String(next) }));
    setStockAbsolute(productId, variantId, size, next);
  };

  // ── product CRUD ─────────────────────────────────────────────────────────────

  const generateSKU = (category: string, counter: number) =>
    `${category.slice(0, 3).toUpperCase()}-${String(counter).padStart(3, "0")}`;
  const generateBarcode = (counter: number) => `789${String(counter).padStart(10, "0")}`;

  const openNew = () => {
    setEditing(null);
    const b = blankProduct();
    setForm(b);
    setVSize(sizesForSystem(b.sizeSystem)[0]);
    setVColor(""); setVModel(""); setVStock(0); setExpandedVariantId(null);
    setFormOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({ name:p.name, description:p.description, category:p.category, gender:p.gender,
      price:p.price, sizeSystem:p.sizeSystem, variants:p.variants, images:p.images ?? [], active:p.active });
    setVSize(sizesForSystem(p.sizeSystem)[0]);
    setVColor(""); setVModel(""); setVStock(0); setExpandedVariantId(null);
    setFormOpen(true);
  };

  const save = () => {
    if (!form.name || form.price <= 0) return;
    setState((s) => {
      let ns: AppState;
      if (editing) {
        ns = { ...s, products: s.products.map((p) => p.id === editing.id ? { ...p, ...form } : p) };
      } else {
        const cnt = s.barcodeCounter + 1;
        ns = { ...s, barcodeCounter: cnt, products: [{ id: uid(), sku: generateSKU(form.category, cnt),
          barcode: generateBarcode(cnt), createdAt: new Date().toISOString().split("T")[0], ...form }, ...s.products] };
      }
      saveState(ns); return ns;
    });
    setFormOpen(false);
  };

  const deleteProduct = (id: string) => setState((s) => { const ns = { ...s, products: s.products.filter((p) => p.id !== id) }; saveState(ns); return ns; });
  const toggleActive = (id: string) => setState((s) => { const ns = { ...s, products: s.products.map((p) => p.id === id ? { ...p, active: !p.active } : p) }; saveState(ns); return ns; });

  // ── variant builder ───────────────────────────────────────────────────────────

  const availSizes = sizesForSystem(form.sizeSystem);
  const usedSizesForVariant = (variantId: string) => form.variants.find((v) => v.id === variantId)?.sizes.map((s) => s.size) ?? [];

  const addVariant = () => {
    if (!vColor || !vModel || !vSize) return;
    const hex = PRESET_COLORS.find((c) => c.name === vColor)?.hex ?? vColorHex;
    const exists = form.variants.find((v) => v.color === vColor && v.model === vModel);
    if (exists) {
      if (exists.sizes.find((s) => s.size === vSize)) return;
      setForm((f) => ({ ...f, variants: f.variants.map((v) =>
        v.id === exists.id ? { ...v, sizes: [...v.sizes, { size: vSize, stock: vStock }] } : v) }));
      setExpandedVariantId(exists.id);
    } else {
      const newV: ProductVariant = { id: uid(), color: vColor, colorHex: hex, model: vModel, sizes: [{ size: vSize, stock: vStock }] };
      setForm((f) => ({ ...f, variants: [...f.variants, newV] }));
      setExpandedVariantId(newV.id);
    }
    setVColor(""); setVModel(""); setVStock(0);
  };

  const addSizeToVariant = (variantId: string, sz: string) => {
    if (usedSizesForVariant(variantId).includes(sz)) return;
    setForm((f) => ({ ...f, variants: f.variants.map((v) =>
      v.id === variantId ? { ...v, sizes: [...v.sizes, { size: sz, stock: 0 }] } : v) }));
  };

  const updateSizeStock = (variantId: string, size: string, stock: number) =>
    setForm((f) => ({ ...f, variants: f.variants.map((v) =>
      v.id === variantId ? { ...v, sizes: v.sizes.map((s) => s.size === size ? { ...s, stock } : s) } : v) }));

  const removeSizeFromVariant = (variantId: string, size: string) =>
    setForm((f) => ({ ...f, variants: f.variants.map((v) =>
      v.id === variantId ? { ...v, sizes: v.sizes.filter((s) => s.size !== size) } : v
    ).filter((v) => v.sizes.length > 0) }));

  const removeVariant = (id: string) => setForm((f) => ({ ...f, variants: f.variants.filter((v) => v.id !== id) }));

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
      </div>

      {/* Product list */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col gap-3">
        {filtered.length === 0 && <EmptyState icon={Package} title="Sin productos" desc="Crea tu primer producto con el botón Nuevo" />}

        {filtered.map((p) => {
          const isOpen = expanded.has(p.id);
          const pStock = totalProductStock(p);
          return (
            <div key={p.id} className={`bg-card border rounded-xl overflow-hidden transition-all ${p.active ? "border-border" : "border-border/40 opacity-60"}`}>
              {/* Row: thumbnail + info + actions */}
              <div className="flex items-stretch">
                <button onClick={() => toggleExpand(p.id)}
                  className="relative w-20 flex-shrink-0 bg-secondary/40 hover:bg-secondary transition-colors overflow-hidden"
                  style={{ minHeight: 88 }}>
                  {p.images?.[0]
                    ? <img src={p.images[0]} alt={p.name} className="w-full h-full object-cover absolute inset-0" />
                    : <div className="w-full h-full flex items-center justify-center text-muted-foreground/20 absolute inset-0"><Package size={22} /></div>
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
                      <Btn onClick={(e: React.MouseEvent) => { e.stopPropagation(); deleteProduct(p.id); }} variant="danger" size="sm"><Trash2 size={12} /></Btn>
                    </div>
                  )}
                </div>

                {/* Expand chevron */}
                <button onClick={() => toggleExpand(p.id)} className="px-2 flex items-center text-muted-foreground hover:text-foreground transition-colors">
                  <ChevronDown size={15} className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
                </button>
              </div>

              {/* Expanded: variants + size steppers */}
              {isOpen && (
                <div className="border-t border-border divide-y divide-border/40">
                  {p.variants.map((v) => {
                    const vStock = totalVariantStock(v);
                    return (
                      <div key={v.id} className="px-4 py-3">
                        {/* Variant header: color · model  total-pzs */}
                        <div className="flex items-center gap-2 mb-2.5">
                          <span className="w-3.5 h-3.5 rounded-full flex-shrink-0 border border-white/15" style={{ background: v.colorHex }} />
                          <span className="text-xs font-bold text-foreground">{v.color}</span>
                          <span className="text-muted-foreground text-xs">·</span>
                          <span className="text-xs font-semibold text-foreground">{v.model}</span>
                          <span className={`ml-1 px-2 py-0.5 rounded-full text-xs font-bold ${vStock === 0 ? "bg-red-500/15 text-red-400" : vStock <= 5 ? "bg-amber-500/15 text-amber-400" : "bg-emerald-500/15 text-emerald-400"}`}>
                            {vStock} pzs
                          </span>
                        </div>

                        {/* Size steppers — 2 col grid */}
                        <div className="pl-5 grid grid-cols-2 gap-1.5">
                          {v.sizes.map((sz) => {
                            const key = draftKey(v.id, sz.size);
                            const draftVal = stockDraft[key];
                            const displayVal = draftVal !== undefined ? draftVal : String(sz.stock);
                            return (
                              <div key={sz.size} className="flex items-center gap-1.5 bg-background border border-border rounded-xl px-2.5 py-1.5">
                                <span className="font-mono text-[11px] font-bold text-muted-foreground w-7 flex-shrink-0 uppercase">{sz.size}</span>
                                <div className="flex items-center gap-1 flex-1 justify-end">
                                  <button onClick={() => adjustStock(p.id, v.id, sz.size, -1, sz.stock)}
                                    disabled={!canEdit || sz.stock === 0}
                                    className="w-6 h-6 flex items-center justify-center rounded-lg border border-border bg-secondary text-muted-foreground hover:text-red-400 hover:border-red-500/40 hover:bg-red-500/10 disabled:opacity-30 transition-all">
                                    <ChevronDown size={12} />
                                  </button>
                                  <input type="number" min={0} disabled={!canEdit} value={displayVal}
                                    onChange={(e) => setStockDraft((d) => ({ ...d, [key]: e.target.value }))}
                                    onBlur={(e) => {
                                      const parsed = parseInt(e.target.value, 10);
                                      setStockDraft((d) => { const n = { ...d }; delete n[key]; return n; });
                                      setStockAbsolute(p.id, v.id, sz.size, isNaN(parsed) ? sz.stock : parsed);
                                    }}
                                    className={`w-10 text-center text-sm font-bold bg-transparent border-0 outline-none disabled:cursor-default [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${sz.stock === 0 ? "text-red-400" : sz.stock <= 5 ? "text-amber-400" : "text-emerald-400"}`}
                                  />
                                  <button onClick={() => adjustStock(p.id, v.id, sz.size, 1, sz.stock)}
                                    disabled={!canEdit}
                                    className="w-6 h-6 flex items-center justify-center rounded-lg border border-border bg-secondary text-muted-foreground hover:text-emerald-400 hover:border-emerald-500/40 hover:bg-emerald-500/10 disabled:opacity-30 transition-all">
                                    <ChevronUp size={12} />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
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

          {/* Size system selector */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-3">Sistema de tallas</label>
            <div className="grid grid-cols-3 gap-2">
              {SIZE_SYSTEMS.map((sys) => (
                <button
                  key={sys.value}
                  onClick={() => {
                    setForm((f) => ({ ...f, sizeSystem: sys.value, variants: [] }));
                    setVSize(sys.sizes[0]);
                    setExpandedVariantId(null);
                  }}
                  className={`flex flex-col items-center gap-1 px-3 py-3 rounded-xl border text-center transition-all ${
                    form.sizeSystem === sys.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-secondary text-muted-foreground hover:text-foreground hover:border-border/70"
                  }`}
                >
                  <span className="font-bold text-sm">{sys.label}</span>
                  <span className="text-[10px] leading-tight opacity-70">{sys.desc}</span>
                </button>
              ))}
            </div>
            {form.variants.length > 0 && (
              <p className="text-[11px] text-amber-400 mt-2">Cambiar el sistema elimina las variantes actuales.</p>
            )}
          </div>

          {/* Variant builder */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-3">Variantes — Color + Modelo</label>

            {/* New variant row */}
            <div className="bg-secondary/60 border border-border rounded-xl p-3 mb-3 flex flex-col gap-2.5">
              <p className="text-xs font-semibold text-muted-foreground">Nueva variante</p>
              <div className="grid grid-cols-2 gap-2">
                <Select label="Color" value={vColor}
                  onChange={(c) => { setVColor(c); setVColorHex(PRESET_COLORS.find((p) => p.name === c)?.hex ?? "#888"); }}
                  options={[{value:"",label:"— Seleccionar"}, ...PRESET_COLORS.map((c) => ({value:c.name,label:c.name}))]} />
                <Input label="Modelo" value={vModel} onChange={setVModel} placeholder="Slim Fit, Regular…" />
              </div>

              {/* Talla chips from system */}
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                  Talla inicial
                  {form.sizeSystem === "unica" && <span className="ml-2 text-primary">(auto: Única)</span>}
                </label>
                {form.sizeSystem === "unica" ? (
                  <div className="flex">
                    <span className="px-3 py-1.5 rounded-lg bg-primary/15 border border-primary/40 text-primary text-xs font-bold">Única</span>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {availSizes.map((s) => (
                      <button key={s} onClick={() => setVSize(s)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${vSize === s ? "bg-primary text-white border-primary" : "bg-background border-border text-muted-foreground hover:text-foreground"}`}>
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-end gap-2">
                <Input label="Stock inicial" value={vStock} onChange={(v) => setVStock(parseInt(v)||0)} type="number" min={0} className="w-32" />
                <Btn onClick={() => { const sz = form.sizeSystem === "unica" ? "Única" : vSize; if (!vColor || !vModel || !sz) return; const hex = PRESET_COLORS.find((c) => c.name === vColor)?.hex ?? vColorHex; const exists = form.variants.find((v) => v.color === vColor && v.model === vModel); if (exists) { if (!exists.sizes.find((s) => s.size === sz)) { setForm((f) => ({ ...f, variants: f.variants.map((v) => v.id === exists.id ? { ...v, sizes: [...v.sizes, { size: sz, stock: vStock }] } : v) })); setExpandedVariantId(exists.id); } } else { const newV: ProductVariant = { id: uid(), color: vColor, colorHex: hex, model: vModel, sizes: [{ size: sz, stock: vStock }] }; setForm((f) => ({ ...f, variants: [...f.variants, newV] })); setExpandedVariantId(newV.id); } setVColor(""); setVModel(""); setVStock(0); }} variant="outline" size="sm" disabled={!vColor || !vModel} className="flex-shrink-0">
                  <Plus size={13} /> {form.variants.find((v) => v.color === vColor && v.model === vModel) ? "Agregar talla" : "Crear variante"}
                </Btn>
              </div>
            </div>

            {/* Existing variants */}
            {form.variants.length > 0 && (
              <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
                {form.variants.map((v) => {
                  const isOpen = expandedVariantId === v.id;
                  const vTotalStock = v.sizes.reduce((s, sz) => s + sz.stock, 0);
                  const usedSizes = v.sizes.map((s) => s.size);
                  const freeSizes = availSizes.filter((s) => !usedSizes.includes(s));
                  return (
                    <div key={v.id} className="border border-border rounded-xl overflow-hidden">
                      <button onClick={() => setExpandedVariantId(isOpen ? null : v.id)}
                        className="flex items-center gap-2 w-full px-3 py-2.5 bg-secondary hover:bg-accent transition-colors text-left">
                        <span className="w-3.5 h-3.5 rounded-full flex-shrink-0 border border-white/20" style={{ background: v.colorHex }} />
                        <span className="text-sm font-semibold text-foreground">{v.color}</span>
                        <span className="text-muted-foreground text-xs">·</span>
                        <span className="text-sm text-foreground">{v.model}</span>
                        <span className="ml-auto flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${vTotalStock === 0 ? "bg-red-500/15 text-red-400" : "bg-emerald-500/15 text-emerald-400"}`}>{vTotalStock} pzs</span>
                          <span className="text-xs text-muted-foreground">{v.sizes.length} tallas</span>
                          <ChevronDown size={13} className={`text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                        </span>
                        <button onClick={(e) => { e.stopPropagation(); removeVariant(v.id); }} className="text-muted-foreground hover:text-red-400 p-0.5 ml-1">
                          <X size={13} />
                        </button>
                      </button>
                      {isOpen && (
                        <div className="px-3 py-2.5 bg-background/50 flex flex-col gap-2">
                          {/* Existing sizes with editable stock */}
                          {v.sizes.map((sz) => (
                            <div key={sz.size} className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-foreground w-10">{sz.size}</span>
                              <div className="flex items-center bg-secondary border border-border rounded-lg overflow-hidden">
                                <button onClick={() => updateSizeStock(v.id, sz.size, Math.max(0, sz.stock - 1))} className="px-2 py-1 text-muted-foreground hover:text-red-400 transition-colors"><Minus size={11} /></button>
                                <input type="number" min={0} value={sz.stock}
                                  onChange={(e) => updateSizeStock(v.id, sz.size, parseInt(e.target.value)||0)}
                                  className="w-12 text-center text-xs font-bold bg-transparent border-0 outline-none text-foreground [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
                                <button onClick={() => updateSizeStock(v.id, sz.size, sz.stock + 1)} className="px-2 py-1 text-muted-foreground hover:text-emerald-400 transition-colors"><Plus size={11} /></button>
                              </div>
                              <span className="text-xs text-muted-foreground">pzs</span>
                              <button onClick={() => removeSizeFromVariant(v.id, sz.size)} className="ml-auto text-muted-foreground hover:text-red-400"><X size={11} /></button>
                            </div>
                          ))}
                          {/* Add missing sizes */}
                          {freeSizes.length > 0 && (
                            <div className="pt-1 border-t border-border">
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

      {/* Barcode modal */}
      <Modal open={!!barcodeProduct} onClose={() => setBarcodeProduct(null)} title="Código de barras">
        {barcodeProduct && (
          <div className="p-5 flex flex-col gap-4">
            <div className="bg-white rounded-xl p-5 flex flex-col items-center gap-3">
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
            <Btn onClick={() => setBarcodeProduct(null)} variant="secondary" className="w-full">Cerrar</Btn>
          </div>
        )}
      </Modal>
    </div>
  );
};

// ─── HISTORY VIEW ─────────────────────────────────────────────────────────────

const HistoryView = ({ user }: { user: User }) => {
  const { state } = useApp();
  const [detail, setDetail] = useState<Sale | null>(null);
  const [receipt, setReceipt] = useState<Sale | null>(null);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [filterBranch, setFilterBranch] = useState("all");
  const [filterSeller, setFilterSeller] = useState("all");
  const [filterPay, setFilterPay] = useState("all");
  const [sortBy, setSortBy] = useState<"date"|"total">("date");
  const [sortDir, setSortDir] = useState<"desc"|"asc">("desc");
  const [showFilters, setShowFilters] = useState(false);

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
    list.sort((a, b) => {
      const dir = sortDir === "desc" ? -1 : 1;
      if (sortBy === "date") return dir * (new Date(a.date).getTime() - new Date(b.date).getTime());
      return dir * (a.total - b.total);
    });
    return list;
  }, [state.sales, filterBranch, filterSeller, filterPay, sortBy, sortDir, user]);

  const totalRevenue = filtered.reduce((s, sale) => s + sale.total, 0);
  const totalCommission = filtered.reduce((s, sale) => s + sale.commissionAmount, 0);

  const toggleSort = (by: "date"|"total") => {
    if (sortBy === by) setSortDir((d) => d === "desc" ? "asc" : "desc");
    else { setSortBy(by); setSortDir("desc"); }
  };

  const payIcon = { cash: Banknote, card: CreditCard, contactless: Wifi };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 p-4 flex flex-col gap-3">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label:"Ventas", value:String(filtered.length), color:"text-foreground" },
            { label:"Ingresos", value:fmt(totalRevenue), color:"text-primary" },
            { label:"Comisión", value:fmt(totalCommission), color:"text-emerald-400" },
          ].map((stat) => (
            <div key={stat.label} className="bg-card border border-border rounded-xl px-3 py-2.5 text-center">
              <p className={`font-bold text-sm ${stat.color} leading-tight`}>{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-all ${showFilters ? "bg-primary/10 border-primary/30 text-primary" : "bg-secondary border-border text-muted-foreground hover:text-foreground"}`}>
            <Filter size={13} /> Filtros
          </button>
          <button onClick={() => toggleSort("date")}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-all ${sortBy === "date" ? "bg-secondary border-border text-foreground" : "text-muted-foreground border-transparent"}`}>
            <Calendar size={12} /> Fecha {sortBy === "date" && (sortDir === "desc" ? <ChevronDown size={11} /> : <ChevronUp size={11} />)}
          </button>
          <button onClick={() => toggleSort("total")}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-all ${sortBy === "total" ? "bg-secondary border-border text-foreground" : "text-muted-foreground border-transparent"}`}>
            <TrendingUp size={12} /> Monto {sortBy === "total" && (sortDir === "desc" ? <ChevronDown size={11} /> : <ChevronUp size={11} />)}
          </button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 bg-secondary border border-border rounded-xl p-3">
            {user.role !== "seller" && (
              <Select label="Sucursal" value={filterBranch} onChange={setFilterBranch}
                options={[{value:"all",label:"Todas"}, ...BRANCHES.map((b) => ({value:b,label:b}))]} />
            )}
            {user.role !== "seller" && (
              <Select label="Vendedor" value={filterSeller} onChange={setFilterSeller}
                options={[{value:"all",label:"Todos"}, ...sellers.map((s) => ({value:s.id,label:s.name}))]} />
            )}
            <Select label="Pago" value={filterPay} onChange={setFilterPay}
              options={[{value:"all",label:"Todos"},{value:"cash",label:"Efectivo"},{value:"card",label:"Tarjeta"},{value:"contactless",label:"Contactless"}]} />
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col gap-2">
        {filtered.length === 0 && <EmptyState icon={ClipboardList} title="Sin ventas" desc="No hay ventas con los filtros seleccionados" />}
        {filtered.map((sale) => {
          const PayIcon = payIcon[sale.paymentMethod];
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
                  <span className="font-bold text-primary">{fmt(sale.total)}</span>
                  <Badge className={`${
                    sale.paymentMethod === "cash" ? "bg-emerald-500/20 text-emerald-400" :
                    sale.paymentMethod === "card" ? "bg-sky-500/20 text-sky-400" :
                    "bg-violet-500/20 text-violet-400"
                  }`}>
                    <PayIcon size={10} /> {pLabel(sale.paymentMethod)}
                  </Badge>
                  <span className="text-xs text-muted-foreground">Comis. {fmt(sale.commissionAmount)}</span>
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
                <div className="ml-auto text-right">
                  <p className="text-xs text-muted-foreground">Comisión</p>
                  <p className="font-bold text-emerald-400 text-sm">{fmt(detail.commissionAmount)}</p>
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
                        {item.isCustom && <Badge className="bg-violet-500/20 text-violet-400 mt-0.5">Personalizado</Badge>}
                      </div>
                      <span className="font-bold text-sm text-primary flex-shrink-0">{fmt(item.price * item.quantity)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex justify-between font-bold text-base border-t border-border pt-3">
              <span>Total</span>
              <span className="text-primary">{fmt(detail.total)}</span>
            </div>
            <div className="flex gap-3">
              <Btn onClick={() => setDetail(null)} variant="secondary" className="flex-1">Cerrar</Btn>
              <Btn onClick={() => { setReceipt(detail); setDetail(null); }} variant="outline" className="flex-1">
                <Printer size={14} /> Ver ticket
              </Btn>
            </div>
          </div>
        );
        })()}
      </Modal>

      {receipt && <ReceiptModal sale={receipt} onClose={() => setReceipt(null)} />}

      {detailProduct && (
        <ProductDetailModal product={detailProduct} onClose={() => setDetailProduct(null)} />
      )}
    </div>
  );
};

// ─── USERS VIEW ───────────────────────────────────────────────────────────────

const blankUser = (): Omit<User,"id"> => ({
  name:"", email:"", password:"", role:"seller", branch:BRANCHES[0],
  commissionType:"percentage", commissionValue:5, active:true, avatar:undefined,
});

const UsersView = () => {
  const { state, setState } = useApp();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState(blankUser());
  const [showPw, setShowPw] = useState(false);

  const openNew = () => { setEditing(null); setForm(blankUser()); setFormOpen(true); };
  const openEdit = (u: User) => { setEditing(u); setForm({ name:u.name, email:u.email, password:u.password, role:u.role, branch:u.branch, commissionType:u.commissionType, commissionValue:u.commissionValue, active:u.active, avatar:u.avatar }); setFormOpen(true); };

  const save = () => {
    if (!form.name || !form.email) return;
    setState((s) => {
      let ns: AppState;
      if (editing) {
        ns = { ...s, users: s.users.map((u) => u.id === editing.id ? { ...u, ...form } : u) };
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

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 p-4 flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{state.users.length} usuarios registrados</p>
        <Btn onClick={openNew} size="md"><Plus size={15} /> Nuevo usuario</Btn>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col gap-3">
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
                <p className="text-xs text-muted-foreground mt-0.5">{u.email}</p>
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  <span className="text-xs text-muted-foreground flex items-center gap-1"><MapPin size={10} /> {u.branch}</span>
                  <span className="text-xs bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded-full font-semibold">
                    Comisión: {u.commissionType === "percentage" ? `${u.commissionValue}%` : fmt(u.commissionValue)}
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-1.5 flex-shrink-0">
                <Btn onClick={() => openEdit(u)} variant="ghost" size="sm"><Edit2 size={13} /></Btn>
                <Btn onClick={() => toggleActive(u.id)} variant="ghost" size="sm" className={u.active ? "text-amber-400" : "text-emerald-400"}>
                  {u.active ? <EyeOff size={13} /> : <Eye size={13} />}
                </Btn>
                <Btn onClick={() => deleteUser(u.id)} variant="danger" size="sm"><Trash2 size={13} /></Btn>
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
          <Input label="Correo electrónico" value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} type="email" placeholder="usuario@modaelite.com" />
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contraseña</label>
            <div className="relative">
              <input type={showPw ? "text" : "password"} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Mínimo 6 caracteres"
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
              options={BRANCHES.map((b) => ({value:b,label:b}))} />
          </div>
          <div className="flex flex-col gap-3 bg-secondary rounded-xl p-3 border border-border">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sistema de comisiones</label>
            <div className="flex gap-2">
              {(["percentage","fixed"] as const).map((t) => (
                <button key={t} onClick={() => setForm((f) => ({ ...f, commissionType: t }))}
                  className={`flex-1 py-2 rounded-lg border text-xs font-semibold transition-all ${form.commissionType === t ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                  {t === "percentage" ? "Porcentaje %" : "Monto fijo $"}
                </button>
              ))}
            </div>
            <Input
              label={form.commissionType === "percentage" ? "Porcentaje de comisión" : "Monto por venta (MXN)"}
              value={form.commissionValue}
              onChange={(v) => setForm((f) => ({ ...f, commissionValue: parseFloat(v) || 0 }))}
              type="number" min={0} step={form.commissionType === "percentage" ? 0.5 : 10}
              placeholder={form.commissionType === "percentage" ? "5" : "50"}
            />
          </div>
          <div className="flex gap-3">
            <Btn onClick={() => setFormOpen(false)} variant="secondary" className="flex-1">Cancelar</Btn>
            <Btn onClick={save} disabled={!form.name || !form.email} className="flex-1">
              <Save size={15} /> {editing ? "Guardar" : "Crear usuario"}
            </Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
};

// ─── HEADER ───────────────────────────────────────────────────────────────────

const Header = ({ user, view, onLogout }: { user: User; view: View; onLogout: () => void }) => {
  const viewTitles: Record<View, string> = {
    pos: "Punto de Venta", products: "Productos", inventory: "Inventario",
    history: "Historial de Ventas", users: "Usuarios",
  };
  return (
    <header className="flex-shrink-0 flex items-center justify-between px-4 py-3 bg-card/80 backdrop-blur-lg border-b border-border lg:pl-60 xl:pl-64">
      <div>
        <h2 className="font-bold text-sm text-foreground">{viewTitles[view]}</h2>
        <p className="text-xs text-muted-foreground">{user.branch}</p>
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
  const [state, setState] = useState<AppState>(loadState);
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem(AUTH_KEY);
      if (saved) {
        const { id } = JSON.parse(saved);
        return loadState().users.find((u) => u.id === id && u.active) ?? null;
      }
    } catch {}
    return null;
  });

  const login = (email: string, pw: string) => {
    const u = state.users.find((u) => u.email === email && u.password === pw && u.active);
    if (u) {
      setCurrentUser(u);
      localStorage.setItem(AUTH_KEY, JSON.stringify({ id: u.id }));
      return true;
    }
    return false;
  };

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem(AUTH_KEY);
  };

  return (
    <AppCtx.Provider value={{ state, currentUser, login, logout, setState }}>
      {children}
    </AppCtx.Provider>
  );
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<View>("pos");

  return (
    <AppProvider>
      <AppInner user={user} setUser={setUser} view={view} setView={setView} />
    </AppProvider>
  );
}

function AppInner({
  user, setUser, view, setView,
}: {
  user: User | null;
  setUser: (u: User | null) => void;
  view: View;
  setView: (v: View) => void;
}) {
  const { currentUser, logout } = useApp();

  useEffect(() => {
    if (currentUser) setUser(currentUser);
  }, [currentUser]);

  const handleLogout = () => {
    logout();
    setUser(null);
    setView("pos");
  };

  if (!user) {
    return <LoginView onLogin={setUser} />;
  }

  const VIEW_COMPONENTS: Record<View, React.ReactNode> = {
    pos: <POSView user={user} />,
    inventory: <InventoryView user={user} />,
    history: <HistoryView user={user} />,
    users: user.role === "admin" ? <UsersView /> : <EmptyState icon={ShieldCheck} title="Acceso restringido" desc="Solo administradores pueden gestionar usuarios" />,
  };

  const allowedViews = NAV_ITEMS.filter((n) => n.roles.includes(user.role)).map((n) => n.view);
  const safeView = allowedViews.includes(view) ? view : allowedViews[0];

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <SideNav view={safeView} setView={setView} role={user.role} user={user} onLogout={handleLogout} />
      <div className="flex flex-col flex-1 min-w-0 lg:pl-56 xl:pl-56">
        <Header user={user} view={safeView} onLogout={handleLogout} />
        <main className="flex-1 overflow-hidden">
          {VIEW_COMPONENTS[safeView]}
        </main>
        <div className="lg:hidden h-16 flex-shrink-0" />
      </div>
      <div className="no-print">
        <BottomNav view={safeView} setView={setView} role={user.role} />
      </div>
    </div>
  );
}
