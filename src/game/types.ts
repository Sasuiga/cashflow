export type Phase =
  | 'title'
  | 'briefing'
  | 'event'
  | 'actions'
  | 'produce'
  | 'report'
  | 'ended';

export type Role = 'production' | 'management' | 'sales' | 'rd';
export type MaterialId = 'a' | 'b' | 'c' | 'd';
export type ProductId = 'basic' | 'standard' | 'premium' | 'economy' | 'special';
export type CardSuit = Role;
export type EndKind = 'bankrupt' | 'finished';

export interface Staff {
  production: number;
  management: number;
  sales: number;
  rd: number;
}

export interface Materials {
  a: number;
  b: number;
  c: number;
  d: number;
}

export interface Bom {
  a?: number;
  b?: number;
  c?: number;
  d?: number;
}

export interface ProductDef {
  id: ProductId;
  name: string;
  tier: string;
  bom: Bom;
  basePrice: number;
  baseDemand: number;
  blurb: string;
}

export interface MaterialDef {
  id: MaterialId;
  name: string;
  short: string;
  basePrice: number;
}

export interface CardDef {
  id: string;
  name: string;
  suit: CardSuit;
  cost: number;
  blurb: string;
  playText: string;
}

export interface CardInstance {
  uid: string;
  defId: string;
}

export interface EventChoice {
  label: string;
  cost: string;
  hint: string;
}

export interface PendingDeal {
  productId: ProductId;
  minSold: number;
  penalty: number;
  okLog: string;
  failLog: string;
}

export interface EventDef {
  id: string;
  title: string;
  monthHint: string;
  body: string;
  choices: EventChoice[];
}

export interface Modifiers {
  extraCapacity: number;
  extraDemand: number;
  priceBonus: number;
  nextBuyDiscount: number;
  secondProduct: boolean;
}

export interface SettlementLine {
  label: string;
  value: number;
  tone?: 'good' | 'bad' | 'mute';
}

export interface SettlementReport {
  month: number;
  productName: string;
  produced: number;
  sold: number;
  leftover: number;
  revenue: number;
  salaries: number;
  upkeep: number;
  interest: number;
  penalty: number;
  netCash: number;
  cash: number;
  debt: number;
  netAssets: number;
  rdNote: string | null;
  lines: SettlementLine[];
}

export interface MonthLedger {
  openingCash: number;
  revenue: number;
  cogs: number;
  taxes: number;
  selling: number;
  admin: number;
  finance: number;
  extraIncome: number;
  extraExpense: number;
  cfSales: number;
  cfBuy: number;
  cfEmployees: number;
  cfTaxes: number;
  cfOtherOpIn: number;
  cfOtherOpOut: number;
  cfCapex: number;
  cfBorrow: number;
  cfRepay: number;
  cfInterest: number;
}

export interface MonthBooks {
  title: string;
  month: number;
  cash: number;
  inventory: number;
  fixedAssets: number;
  borrowings: number;
  equity: number;
  ledger: MonthLedger;
}

export interface GameState {
  phase: Phase;
  month: number;
  cash: number;
  debt: number;
  ap: number;
  maxAp: number;
  factories: number;
  slots: number;
  machines: number;
  staff: Staff;
  materials: Materials;
  finished: Partial<Record<ProductId, number>>;
  materialPrices: Record<MaterialId, number>;
  productPrices: Partial<Record<ProductId, number>>;
  demand: Partial<Record<ProductId, number>>;
  unlockedProducts: ProductId[];
  materialDUnlocked: boolean;
  rdProgress: number;
  rdUnlockIndex: number;
  cardsUnlocked: boolean;
  shop: CardInstance[];
  shopDrawn: boolean;
  hand: CardInstance[];
  modifiers: Modifiers;
  eventId: string | null;
  usedEventIds: string[];
  selectedProduct: ProductId | null;
  lastReport: SettlementReport | null;
  prevReport: SettlementReport | null;
  log: string[];
  endKind: EndKind | null;
  uidSeq: number;
  pendingDeal: PendingDeal | null;
  ledger: MonthLedger;
  openBooks: MonthBooks;
  closedBooks: MonthBooks[];
  achievements: string[];
  everDebt: boolean;
}

export type GameAction =
  | { type: 'START_GAME' }
  | { type: 'CONFIRM_BRIEFING' }
  | { type: 'RESOLVE_EVENT'; choice: number }
  | { type: 'BUY_MACHINE' }
  | { type: 'EXPAND_FACTORY' }
  | { type: 'HIRE'; role: Role }
  | { type: 'BUY_MATERIAL'; material: MaterialId; qty: number }
  | { type: 'BORROW'; amount: number }
  | { type: 'REPAY'; amount: number }
  | { type: 'DRAW_SHOP' }
  | { type: 'BUY_CARD'; index: number }
  | { type: 'PLAY_CARD'; uid: string }
  | { type: 'GO_PRODUCE' }
  | { type: 'SELECT_PRODUCT'; id: ProductId }
  | { type: 'SETTLE' }
  | { type: 'NEXT_MONTH' }
  | { type: 'RESTART' };
