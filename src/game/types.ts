export type Phase =
  | 'title'
  | 'board'
  | 'briefing'
  | 'event'
  | 'actions'
  | 'produce'
  | 'report'
  | 'ended';

export type Role = 'production' | 'management' | 'sales' | 'rd';
export type DeptId = 'ceo' | 'finance' | 'hr' | 'infra' | 'store' | 'rd' | 'sales';
export type MaterialId = 'a' | 'b' | 'c' | 'd';
export type ProductId = 'basic' | 'standard' | 'premium' | 'economy' | 'special';
export type CardSuit = Role;
export type EndKind = 'bankrupt' | 'finished';
export type TrendDir = -1 | 0 | 1;

export interface MarketTrend {
  materials: Record<MaterialId, TrendDir>;
  products: Partial<Record<ProductId, TrendDir>>;
}

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

export type EventTone = 'good' | 'bad' | 'mixed';
export type EventFamily =
  | 'material'
  | 'order'
  | 'hr'
  | 'quality'
  | 'price'
  | 'capacity'
  | 'tax'
  | 'finance'
  | 'inventory'
  | 'ar'
  | 'policy';
export type EventRequire = 'receivables' | 'rdStaff' | 'finished' | 'debt';

export interface PendingDeal {
  productId: ProductId;
  minSold: number;
  penalty: number;
  okLog: string;
  failLog: string;
}

export interface MonthOrder {
  id: string;
  productId: ProductId;
  qty: number;
  kind: 'market' | 'contract';
  penalty: number;
  okLog?: string;
  failLog?: string;
}

export interface QuarterStats {
  sold: number;
  peakCash: number;
  coveringMonth: boolean;
  coveringMonths: number;
  repaid: boolean;
  borrowed: boolean;
  playedCard: boolean;
  nonBasic: boolean;
  nonBasicSold: number;
  stockoutAB: boolean;
  stockoutA: boolean;
  stockoutB: boolean;
  premiumOrSpecial: boolean;
  startStaff: number;
  startDebt: number;
  startCash: number;
  startMachines: number;
  hired: number;
  boughtQty: number;
}

export interface BoardQuarterResult {
  quarter: 1 | 2 | 3 | 4;
  climateId: string;
  basicId: string;
  basicOk: boolean;
  challengeIds: string[];
  challengeHits: string[];
  minutes: string;
  points: number;
}

export interface EventDef {
  id: string;
  title: string;
  monthHint: string;
  body: string;
  impact: string;
  tone: EventTone;
  family: EventFamily;
  weight?: number;
  minMonth?: number;
  requires?: EventRequire[];
  channelOnly?: boolean;
}

export interface StockLayer {
  qty: number;
  cost: number;
  receivedMonth: number;
}

export interface ReceivableLot {
  amount: number;
  originMonth: number;
  dueMonth: number;
}

export interface Modifiers {
  extraCapacity: number;
  extraDemand: number;
  priceBonus: number;
  nextBuyDiscount: number;
  secondProduct: boolean;
  collectionBonus: number;
  creditSaleRate: number;
  arTermExtra: number;
  stockAgeBias: number;
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
  wagesPaid: number;
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
  rd: number;
  creditImpairment: number;
  assetImpairment: number;
  incomeTax: number;
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
  materials: number;
  wip: number;
  finished: number;
  inventory: number;
  inventoryProvision: number;
  receivables: number;
  badDebtProvision: number;
  receivablesNet: number;
  fixedAssetCost: number;
  accumDep: number;
  fixedAssets: number;
  borrowings: number;
  wagesPayable: number;
  taxPayable: number;
  paidInCapital: number;
  surplusReserve: number;
  retainedEarnings: number;
  equity: number;
  ledger: MonthLedger;
}

export interface GameState {
  phase: Phase;
  month: number;
  cash: number;
  debt: number;
  wagesPayable: number;
  wagesAccruedThisMonth: number;
  wagesAccruedByRole: Record<Role, number>;
  taxPayable: number;
  paidInCapital: number;
  surplusReserve: number;
  machineGross: number;
  factoryGross: number;
  accumDepMachines: number;
  accumDepFactories: number;
  depreciableMachineGross: number;
  depreciableFactoryGross: number;
  materialCost: Materials;
  finishedCost: Partial<Record<ProductId, number>>;
  materialLayers: Record<MaterialId, StockLayer[]>;
  finishedLayers: Partial<Record<ProductId, StockLayer[]>>;
  inventoryProvision: number;
  receivables: ReceivableLot[];
  badDebtProvision: number;
  wip: number;
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
  prevMaterialPrices: Record<MaterialId, number>;
  prevProductPrices: Partial<Record<ProductId, number>>;
  marketTrend: MarketTrend;
  demand: Partial<Record<ProductId, number>>;
  unlockedProducts: ProductId[];
  materialDUnlocked: boolean;
  rdProgress: number;
  rdUnlockIndex: number;
  cardsUnlocked: boolean;
  shop: CardInstance[];
  shopDrawn: boolean;
  cardsBoughtThisMonth: number;
  hand: CardInstance[];
  modifiers: Modifiers;
  eventId: string | null;
  eventNote: string | null;
  usedEventIds: string[];
  selectedProduct: ProductId | null;
  monthOrders: MonthOrder[];
  acceptedOrderIds: string[];
  extraProduce: Partial<Record<ProductId, number>>;
  lastReport: SettlementReport | null;
  prevReport: SettlementReport | null;
  log: string[];
  deptActs: Record<DeptId, string[]>;
  endKind: EndKind | null;
  uidSeq: number;
  pendingDeal: PendingDeal | null;
  ledger: MonthLedger;
  openBooks: MonthBooks;
  closedBooks: MonthBooks[];
  achievements: string[];
  milestones: string[];
  everDebt: boolean;
  quarter: 1 | 2 | 3 | 4;
  climateId: 'steel' | 'channel' | 'chip' | 'priceWar';
  basicGoalId: string;
  challengeGoalIds: string[];
  challengeDraft: string[];
  challengePoolIds: string[];
  boardHistory: BoardQuarterResult[];
  boardMinutes: string | null;
  quarterStats: QuarterStats;
  usedClimateIds: string[];
  recentEventFamilies: string[];
  quarterEventTones: EventTone[];
}

export type GameAction =
  | { type: 'START_GAME' }
  | { type: 'TOGGLE_BOARD_GOAL'; id: string }
  | { type: 'CONFIRM_BOARD' }
  | { type: 'CONFIRM_BRIEFING' }
  | { type: 'ACK_EVENT' }
  | { type: 'BUY_MACHINE' }
  | { type: 'EXPAND_FACTORY' }
  | { type: 'HIRE'; role: Role }
  | { type: 'BUY_MATERIAL'; material: MaterialId; qty: number }
  | { type: 'BUY_MATERIALS'; items: { material: MaterialId; qty: number }[] }
  | { type: 'BORROW'; amount: number }
  | { type: 'REPAY'; amount: number }
  | { type: 'DRAW_SHOP' }
  | { type: 'BUY_CARD'; index: number }
  | { type: 'PLAY_CARD'; uid: string }
  | { type: 'GO_PRODUCE' }
  | { type: 'BACK_TO_ACTIONS' }
  | { type: 'TOGGLE_ORDER'; id: string }
  | { type: 'SET_EXTRA_PRODUCE'; productId: ProductId; qty: number }
  | { type: 'SETTLE' }
  | { type: 'NEXT_MONTH' }
  | { type: 'RESTART' };
