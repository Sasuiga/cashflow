import {
  BASE_AP,
  BASE_MONTH_ORDERS,
  MAX_MONTH_ORDERS,
  CAP_OVERFLOW,
  CAP_PER_WORKER,
  CARDS,
  EVENTS,
  FACTORY_COST,
  FACTORY_LIFE_MONTHS,
  FACTORY_UPKEEP,
  HAND_LIMIT,
  STARTING_CASH,
  HIRE_COST,
  INCOME_TAX_RATE,
  INTEREST_RATE,
  LOAN_PER_MACHINE,
  LOAN_TERM_MONTHS,
  LOAN_DEFAULT_RATE,
  LOAN_LATE_FEE_RATE,
  STATUTORY_RESERVE_CAP,
  STATUTORY_RESERVE_RATE,
  AR_TERM_MONTHS,
  AR_WRITEOFF_PAST_DUE,
  AR_OVERDUE_CHANCE,
  AR_RECOVER_PER_SALES,
  CREDIT_SALE_RATE,
  arRecoveryRate,
  arCreditLossRate,
  inventoryWriteDownRate,
  MACHINE_BASE_CAP,
  MACHINE_COST,
  MACHINE_LIFE_MONTHS,
  MATERIALS,
  MATERIAL_IDS,
  MAX_RD_PRODUCTS,
  CONTRACT_COVER_MONTHS,
  CONTRACT_COVER_MONTHS_LONG,
  MAX_ACTIVE_IPS,
  PROD_FLEX_STAFF,
  PROD_FLEX_CAP,
  PROD_OVERTIME_STAFF,
  PROD_OVERTIME_MACHINES,
  PROD_OVERTIME_CAP,
  PROD_OVERTIME_COST,
  PROD_FIELD_YIELD_STAFF,
  PROD_FIELD_YIELD_MACHINES,
  PROD_FIELD_YIELD_EVERY,
  MGMT_SHOP_TIER,
  MGMT_SHOP_MAX_TIER,
  MGMT_BUY_TIER,
  MGMT_HAND_TIER,
  MGMT_HAND_MAX_TIER,
  SALES_PASS_1,
  SALES_PASS_2,
  SALES_PASS_3,
  SALES_PASS_4,
  SALES_CREDIT_3,
  SALES_CREDIT_4,
  PROC_TRADER_TIER,
  PROC_DISCOUNT_TIER,
  PROC_CONTRACT_FREE_TIER,
  PROC_DUAL_CONTRACT_TIER,
  PROC_FACTORY_DISCOUNT,
  LAUNCH_QTY_VOLUME,
  LAUNCH_QTY_STANDARD,
  LAUNCH_QTY_PREMIUM,
  RD_NAME_STEMS,
  RD_FAIL_BONUS,
  RD_STAFF_CAP,
  RD_SUCCESS_CAP,
  RD_SUCCESS_PER_HEAD,
  IP_CATALOG,
  IP_YIELD_EVERY,
  IP_PRICE_BONUS,
  IP_JIG_CAPACITY,
  IP_AUTO_PER_MACHINE,
  IP_LEAN_RATE,
  SALARY,
  ROLES,
  SLOTS_PER_FACTORY,
  SPOT_HARD_CAP,
  SPOT_STAFF_ADD,
  TOTAL_MONTHS,
  TRADER_HARD_CAP,
  TRADER_PRICE_MULT,
  WORKERS_PER_MACHINE,
  bomKey,
  cardById,
  cardNeedsMaterial,
  catalogOf,
  DEFAULT_DIFFICULTY,
  eventById,
  eventToneWeightsFor,
  ipById,
  isPremiumProduct,
  isVolumeProduct,
  materialById,
  productFrom,
  rdCycleOf,
  rdSuccessRate,
  rushSpotBonus,
  seasonSpotBonus,
  unlockedCatalog,
} from './data';
import { ACHIEVEMENTS } from './achievements';
import {
  BASIC_PENALTY,
  CHALLENGE_PICK,
  CHALLENGE_POINTS,
  CLIMATES,
  QUARTER_LABEL,
  climateById,
  applyClimateModifiers,
  climateSpotPool,
  currentBasicGoal,
  dealBasicGoal,
  dealChallengePool,
  dealMarketTrend,
  emptyMarketTrend,
  emptyQuarterStats,
  goalById,
  monthMarketLog,
  marketTrendLog,
  q3ProcurementFree,
  quarterOf,
  trendWord,
} from './board';
import { MONTH_NAMES, RD_ARCHETYPE_BLURB, RD_ARCHETYPE_LABEL, RD_TRACK_LABEL, ROLE_LABEL, bomLabel, factoryName, materialName, money, pctLabel, productName, roundMoney } from './format';
import { buildBalanceRows, buildCashRows, buildPnlRows } from './settlementStory';
import type {
  Bom,
  BuyChannel,
  CardInstance,
  DeptId,
  EventDef,
  EventTone,
  GameAction,
  GameState,
  IpId,
  LoanLot,
  MaterialId,
  Materials,
  Modifiers,
  MonthBooks,
  MonthLedger,
  MonthOrder,
  ProductDef,
  ProductId,
  RdAssign,
  RdAssignOption,
  RdProductArchetype,
  RdReveal,
  RdTrack,
  ReceivableLot,
  Role,
  SettlementFacts,
  SettlementLine,
  SettlementReport,
  SettlementSku,
  SettlementWage,
  Staff,
  StockLayer,
  SupplyContract,
  TrendDir,
} from './types';

function clone<T>(value: T): T {
  return structuredClone(value);
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function roundPrice(n: number): number {
  return Math.max(0.1, roundMoney(n));
}

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)]!;
}

function shuffled<T>(list: T[]): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

export function productOf(state: GameState, id: ProductId): ProductDef {
  return productFrom(catalogOf(state), id);
}

function skuName(state: GameState, id: ProductId): string {
  try {
    return productOf(state, id).name;
  } catch {
    return productName(id);
  }
}

type Shock = 'light' | 'mid' | 'heavy';

function rollShock(month: number): Shock {
  const roll = Math.random();
  if (month <= 3) return roll < 0.7 ? 'light' : 'mid';
  if (month <= 8) return roll < 0.25 ? 'light' : roll < 0.8 ? 'mid' : 'heavy';
  return roll < 0.15 ? 'light' : roll < 0.55 ? 'mid' : 'heavy';
}

function shockOf<T>(shock: Shock, light: T, mid: T, heavy: T): T {
  return shock === 'light' ? light : shock === 'heavy' ? heavy : mid;
}

function priceTick(base: number): number {
  return Math.max(0.1, roundMoney(base * 0.1));
}

function boundMaterialPrice(id: MaterialId, price: number): number {
  const base = materialById(id).basePrice;
  return roundPrice(clamp(price, roundMoney(base * 0.5), roundMoney(base * 2)));
}

function boundProductPrice(state: GameState, id: ProductId, price: number): number {
  const base = productOf(state, id).basePrice;
  return roundPrice(clamp(price, roundMoney(base * 0.5), roundMoney(base * 1.5)));
}

function moveMaterialPrice(state: GameState, id: MaterialId, ticks: number): void {
  if (!ticks) return;
  const base = materialById(id).basePrice;
  state.materialPrices[id] = boundMaterialPrice(id, state.materialPrices[id] + priceTick(base) * ticks);
}

function moveProductPrice(state: GameState, id: ProductId, ticks: number): void {
  if (!ticks) return;
  const base = productOf(state, id).basePrice;
  const current = state.productPrices[id] ?? base;
  state.productPrices[id] = boundProductPrice(state, id, current + priceTick(base) * ticks);
}

function moveAllProductPrices(state: GameState, ticks: number): void {
  for (const id of state.unlockedProducts) moveProductPrice(state, id, ticks);
}

function quotedPct(before: number, after: number): number {
  if (before <= 0) return 0;
  return Math.round(((after - before) / before) * 100);
}

function trendStep(dir: TrendDir): -1 | 0 | 1 {
  const roll = Math.random();
  if (dir > 0) {
    if (roll < 0.7) return 1;
    if (roll < 0.9) return 0;
    return -1;
  }
  if (dir < 0) {
    if (roll < 0.7) return -1;
    if (roll < 0.9) return 0;
    return 1;
  }
  if (roll < 0.5) return 0;
  return roll < 0.75 ? 1 : -1;
}

function ensureMarketTrend(state: GameState): void {
  if (!state.marketTrend?.materials) {
    state.marketTrend = dealMarketTrend(state.climateId, state.unlockedProducts, state.materialDUnlocked, catalogOf(state));
  }
  if (!state.marketTrend.products) state.marketTrend.products = {};
}

function setMaterialTrend(state: GameState, id: MaterialId, dir: TrendDir): void {
  ensureMarketTrend(state);
  state.marketTrend.materials[id] = dir;
}

function setAllProductTrends(state: GameState, dir: TrendDir): void {
  ensureMarketTrend(state);
  for (const id of state.unlockedProducts) state.marketTrend.products[id] = dir;
}

function snapshotQuotedPrices(state: GameState): void {
  state.prevMaterialPrices = {
    a: state.materialPrices.a,
    b: state.materialPrices.b,
    c: state.materialPrices.c,
    d: state.materialPrices.d,
  };
  state.prevProductPrices = { ...state.productPrices };
}

function emptyModifiers(): Modifiers {
  return {
    extraCapacity: 0,
    extraDemand: 0,
    priceBonus: 0,
    nextBuyDiscount: 0,
    secondProduct: false,
    collectionBonus: 0,
    creditSaleRate: 0,
    arTermExtra: 0,
    stockAgeBias: 0,
    contractApFree: false,
    contractPrepayDiscount: 0,
  };
}

export function totalStaff(staff: Staff): number {
  return staff.production + staff.management + staff.sales + staff.rd + (staff.procurement ?? 0);
}

export function hasIp(state: GameState, id: IpId): boolean {
  return (state.ownedIps ?? []).includes(id);
}

export function rdCapacityBonus(state: GameState): number {
  let bonus = 0;
  if (hasIp(state, 'jig')) bonus += IP_JIG_CAPACITY;
  if (hasIp(state, 'auto')) bonus += state.machines * IP_AUTO_PER_MACHINE;
  return bonus;
}

export function yieldEveryOf(state: GameState): number {
  if (hasIp(state, 'yield')) return IP_YIELD_EVERY;
  if (state.staff.production >= PROD_FIELD_YIELD_STAFF && state.machines >= PROD_FIELD_YIELD_MACHINES) {
    return PROD_FIELD_YIELD_EVERY;
  }
  return 0;
}

export function yieldExtraOf(qty: number, state: GameState): number {
  const every = yieldEveryOf(state);
  if (!every || qty <= 0) return 0;
  return Math.floor(qty / every);
}

export function rdTrackStaff(state: GameState, track: RdTrack): number {
  return track === 'product' ? state.rdProductStaff ?? 0 : state.rdTechStaff ?? 0;
}

export function rdTrackRoom(state: GameState, track: RdTrack): number {
  return Math.max(0, RD_STAFF_CAP - rdTrackStaff(state, track));
}

export function rdTrackProgress(state: GameState, track: RdTrack): number {
  return track === 'product' ? state.rdProductProgress ?? 0 : state.rdTechProgress ?? 0;
}

export function rdTrackFailBonus(state: GameState, track: RdTrack): number {
  return track === 'product' ? state.rdProductFailBonus ?? 0 : state.rdTechFailBonus ?? 0;
}

export function rdTrackRate(state: GameState, track: RdTrack, extraStaff = 0): number {
  return rdSuccessRate(rdTrackStaff(state, track) + extraStaff, rdTrackFailBonus(state, track));
}

export function currentProductProject(state: GameState) {
  return state.rdProductDraft ?? null;
}

export function currentTechProject(state: GameState) {
  const id = state.rdTechProjectId;
  if (!id || hasIp(state, id)) return null;
  return ipById(id);
}

export function availableTechIps(state: GameState) {
  const owned = new Set(state.ownedIps ?? []);
  if (state.pendingIpReplace) owned.add(state.pendingIpReplace);
  return IP_CATALOG.filter((item) => !owned.has(item.id));
}

export function canOpenProductRd(state: GameState): boolean {
  return (
    !state.rdProductDraft &&
    (state.extraProducts?.length ?? 0) < MAX_RD_PRODUCTS &&
    rdTrackStaff(state, 'product') > 0
  );
}

export function canPickTechProject(state: GameState, ipId?: IpId): boolean {
  if (ipId && hasIp(state, ipId)) return false;
  const current = state.rdTechProjectId;
  if (!current) return true;
  if (ipId && current === ipId) return true;
  return rdTrackProgress(state, 'tech') <= 0;
}

export function rdHasProject(state: GameState, track: RdTrack): boolean {
  return track === 'product' ? Boolean(currentProductProject(state)) : Boolean(currentTechProject(state));
}

function syncRdHeadcount(state: GameState): void {
  state.staff.rd = Math.max(0, (state.rdProductStaff ?? 0) + (state.rdTechStaff ?? 0));
}

function moveAllRdStaff(state: GameState, from: RdTrack, to: RdTrack): void {
  if (from === to) return;
  const count = rdTrackStaff(state, from);
  const moved = Math.min(count, rdTrackRoom(state, to));
  if (moved <= 0) return;
  if (from === 'product') {
    state.rdProductStaff = (state.rdProductStaff ?? 0) - moved;
    state.rdTechStaff = (state.rdTechStaff ?? 0) + moved;
  } else {
    state.rdTechStaff = (state.rdTechStaff ?? 0) - moved;
    state.rdProductStaff = (state.rdProductStaff ?? 0) + moved;
  }
  syncRdHeadcount(state);
}

function clearRdProject(state: GameState, track: RdTrack): void {
  setRdProgress(state, track, 0);
  setRdFailBonus(state, track, 0);
  if (track === 'product') state.rdProductDraft = null;
  else state.rdTechProjectId = null;
}

function pendingRevealOn(state: GameState, track: RdTrack): boolean {
  return (state.pendingRdReveals ?? []).some((item) => item.track === track);
}

export function rdRevealOptions(state: GameState): RdAssignOption[] {
  const reveal = state.pendingRdReveals?.[0];
  if (!reveal) return [];
  const options: RdAssignOption[] = [];
  if (state.pendingIpReplace) {
    const incoming = ipById(state.pendingIpReplace);
    for (const id of state.ownedIps ?? []) {
      const drop = ipById(id);
      options.push({
        assign: { kind: 'replace', dropId: id },
        title: `让出「${drop.name}」`,
        blurb: `生效「${incoming.name}」：${incoming.effect}。「${drop.name}」卸下，可再攻关。`,
      });
    }
    if (options.length) return options;
  }
  const other: RdTrack = reveal.track === 'product' ? 'tech' : 'product';
  const otherBusy = pendingRevealOn(state, other);
  const productRemain = (state.extraProducts?.length ?? 0) < MAX_RD_PRODUCTS;
  const failedTechId = !reveal.success && reveal.track === 'tech' ? state.rdTechProjectId : null;
  const techChoices = availableTechIps(state).filter((item) => item.id !== failedTechId);
  const productProject = currentProductProject(state);
  const techProject = currentTechProject(state);

  if (!reveal.success) {
    const name = reveal.track === 'product' ? productProject?.name : techProject?.name;
    options.push({
      assign: { kind: 'retry' },
      title: `继续「${name ?? '当前课题'}」`,
      blurb: `进度归零，下次成功率 ${pctLabel(rdTrackRate(state, reveal.track))}。`,
    });
  }

  if (reveal.track === 'product') {
    if (productRemain) {
      (['simplify', 'substitute', 'margin'] as RdProductArchetype[]).forEach((archetype) => {
        options.push({
          assign: { kind: 'product', archetype },
          title: `${reveal.success ? '开题' : '改做'} · ${RD_ARCHETYPE_LABEL[archetype]}`,
          blurb: RD_ARCHETYPE_BLURB[archetype],
        });
      });
    }
  } else if (!otherBusy && rdTrackRoom(state, 'product') > 0 && productProject) {
    options.push({
      assign: { kind: 'product' },
      title: `编入产品组 · 「${productProject.name}」`,
      blurb: `加入进行中的课题，进度 ${rdTrackProgress(state, 'product')}/${rdCycleOf('product', rdTrackStaff(state, 'product'))}。`,
    });
  } else if (!otherBusy && rdTrackRoom(state, 'product') > 0 && productRemain) {
    (['simplify', 'substitute', 'margin'] as RdProductArchetype[]).forEach((archetype) => {
      options.push({
        assign: { kind: 'product', archetype },
        title: `编入产品组 · ${RD_ARCHETYPE_LABEL[archetype]}`,
        blurb: RD_ARCHETYPE_BLURB[archetype],
      });
    });
  }

  if (reveal.track === 'tech') {
    for (const ip of techChoices) {
      options.push({
        assign: { kind: 'tech', ipId: ip.id },
        title: reveal.success ? `攻关「${ip.name}」` : `改做「${ip.name}」`,
        blurb: ip.effect,
      });
    }
  } else if (!otherBusy && rdTrackRoom(state, 'tech') > 0 && techProject) {
    options.push({
      assign: { kind: 'tech' },
      title: `编入工艺组 · 「${techProject.name}」`,
      blurb: `加入进行中的课题，进度 ${rdTrackProgress(state, 'tech')}/${rdCycleOf('tech', rdTrackStaff(state, 'tech'))}。`,
    });
  } else if (!otherBusy && rdTrackRoom(state, 'tech') > 0) {
    for (const ip of techChoices) {
      options.push({
        assign: { kind: 'tech', ipId: ip.id },
        title: `编入工艺组 · 「${ip.name}」`,
        blurb: ip.effect,
      });
    }
  }

  if (options.length === 0) {
    options.push({
      assign: { kind: 'idle' },
      title: '实验室待命',
      blurb: '本组暂无新课题，班底留下。',
    });
  }
  return options;
}

function applyRdAssign(state: GameState, reveal: RdReveal, assign: RdAssign): string {
  const from = reveal.track;
  const headcount = rdTrackStaff(state, from);
  if (assign.kind === 'replace') {
    const incoming = state.pendingIpReplace;
    if (!incoming) return `${headcount} 人留在工艺实验室待命`;
    state.ownedIps = (state.ownedIps ?? []).filter((id) => id !== assign.dropId);
    if (!state.ownedIps.includes(incoming)) state.ownedIps = [...state.ownedIps, incoming];
    state.rdIpIndex = state.ownedIps.length;
    state.pendingIpReplace = null;
    return `让出「${ipById(assign.dropId).name}」，生效「${ipById(incoming).name}」`;
  }
  if (assign.kind === 'retry') {
    const name =
      from === 'product' ? currentProductProject(state)?.name : currentTechProject(state)?.name;
    return `${headcount} 人继续攻关「${name ?? '当前课题'}」`;
  }
  if (!reveal.success) clearRdProject(state, from);
  if (assign.kind === 'idle') {
    return `${rdTrackStaff(state, from)} 人留在${RD_TRACK_LABEL[from]}待命`;
  }
  const dest: RdTrack = assign.kind === 'product' ? 'product' : 'tech';
  if (dest !== from) moveAllRdStaff(state, from, dest);
  if (dest === 'product') {
    if (!currentProductProject(state) && (state.extraProducts?.length ?? 0) < MAX_RD_PRODUCTS) {
      state.rdProductDraft = rollRdProduct(state, assign.kind === 'product' ? assign.archetype : 'margin');
      setRdProgress(state, 'product', 0);
      return `${rdTrackStaff(state, 'product')} 人转做「${state.rdProductDraft.name}」`;
    }
    const joined = currentProductProject(state);
    return joined
      ? `${rdTrackStaff(state, 'product')} 人加入「${joined.name}」`
      : `${rdTrackStaff(state, 'product')} 人编入产品实验室待命`;
  }
  if (!currentTechProject(state)) {
    const ipId = assign.kind === 'tech' ? assign.ipId : undefined;
    if (ipId && !hasIp(state, ipId)) {
      state.rdTechProjectId = ipId;
      setRdProgress(state, 'tech', 0);
      return `${rdTrackStaff(state, 'tech')} 人转做「${ipById(ipId).name}」`;
    }
    return `${rdTrackStaff(state, 'tech')} 人编入工艺实验室待命`;
  }
  return `${rdTrackStaff(state, 'tech')} 人加入「${currentTechProject(state)!.name}」`;
}

export function unitsNeeded(state: GameState, id: ProductId, qty: number): Materials {
  const bom = productOf(state, id).bom;
  const factor = hasIp(state, 'lean') ? 1 - IP_LEAN_RATE : 1;
  const out = emptyMats();
  for (const key of MATERIAL_IDS) {
    const raw = (bom[key] ?? 0) * qty;
    if (raw <= 0) continue;
    out[key] = factor === 1 ? raw : Math.max(qty > 0 ? 1 : 0, Math.round(raw * factor));
  }
  return out;
}

function ensureRdState(state: GameState): void {
  if (typeof state.rdProductStaff !== 'number') state.rdProductStaff = state.staff.rd ?? 0;
  if (typeof state.rdTechStaff !== 'number') state.rdTechStaff = 0;
  if (typeof state.rdProductProgress !== 'number') state.rdProductProgress = 0;
  if (typeof state.rdTechProgress !== 'number') state.rdTechProgress = 0;
  if (typeof state.rdUnlockIndex !== 'number') state.rdUnlockIndex = 0;
  if (typeof state.rdIpIndex !== 'number') state.rdIpIndex = 0;
  if (!state.rdTechProjectId) state.rdTechProjectId = null;
  if (!Array.isArray(state.extraProducts)) state.extraProducts = [];
  if (state.rdProductDraft === undefined) state.rdProductDraft = null;
  if (typeof state.rdProductFailBonus !== 'number') state.rdProductFailBonus = 0;
  if (typeof state.rdTechFailBonus !== 'number') state.rdTechFailBonus = 0;
  if (!Array.isArray(state.ownedIps)) state.ownedIps = [];
  if (!Array.isArray(state.pendingRdReveals)) state.pendingRdReveals = [];
  if (!Array.isArray(state.pendingLaunchOrders)) state.pendingLaunchOrders = [];
  if (state.pendingIpReplace === undefined) state.pendingIpReplace = null;
  state.staff.rd = Math.max(0, (state.rdProductStaff ?? 0) + (state.rdTechStaff ?? 0));
}

export function maxApFor(staff: Staff): number {
  return BASE_AP + Math.max(0, staff.management);
}

export function shopCountOf(state: GameState): number {
  const n = state.staff.management;
  return 3 + (n >= MGMT_SHOP_TIER ? 1 : 0) + (n >= MGMT_SHOP_MAX_TIER ? 1 : 0);
}

export function cardBuyLimitOf(state: GameState): number {
  return state.staff.management >= MGMT_BUY_TIER ? 2 : 1;
}

export function handLimitOf(state: GameState): number {
  const n = state.staff.management;
  return HAND_LIMIT + (n >= MGMT_HAND_TIER ? 1 : 0) + (n >= MGMT_HAND_MAX_TIER ? 1 : 0);
}

export function passThroughRateOf(state: GameState): number {
  if (state.climateId === 'priceWar') return 0;
  const n = state.staff.sales;
  if (n >= 4) return SALES_PASS_4;
  if (n >= 3) return SALES_PASS_3;
  if (n >= 2) return SALES_PASS_2;
  if (n >= 1) return SALES_PASS_1;
  return 0;
}

export function flexCapacityOf(state: GameState): number {
  return state.staff.production >= PROD_FLEX_STAFF ? PROD_FLEX_CAP : 0;
}

export function canUseOvertime(state: GameState): boolean {
  return (
    (state.phase === 'actions' || state.phase === 'produce') &&
    !state.overtimeUsedThisMonth &&
    state.staff.production >= PROD_OVERTIME_STAFF &&
    state.machines >= PROD_OVERTIME_MACHINES &&
    state.cash + 1e-6 >= PROD_OVERTIME_COST
  );
}

export function traderPriceMultOf(state: GameState, id: MaterialId): number {
  const n = procurementOf(state);
  const steel = id === 'a' || id === 'b';
  if (n >= PROC_DUAL_CONTRACT_TIER) return steel ? 1.3 : 1.6;
  if (n >= PROC_TRADER_TIER) return steel ? 1.4 : 1.8;
  return TRADER_PRICE_MULT[id] ?? 2;
}

export function factoryBuyDiscountOf(state: GameState): number {
  const staffOff = procurementOf(state) >= PROC_DISCOUNT_TIER ? PROC_FACTORY_DISCOUNT : 0;
  return Math.max(staffOff, state.modifiers.nextBuyDiscount ?? 0);
}

export function contractCoverMonthsOf(state: GameState): number {
  return procurementOf(state) >= PROC_DUAL_CONTRACT_TIER ? CONTRACT_COVER_MONTHS_LONG : CONTRACT_COVER_MONTHS;
}

export function lastContractSignMonthOf(state: GameState): number {
  return TOTAL_MONTHS - contractCoverMonthsOf(state);
}

export function maxLiveContractsOf(state: GameState): number {
  return procurementOf(state) >= PROC_DUAL_CONTRACT_TIER ? 2 : 1;
}

export function contractApFreeOf(state: GameState): boolean {
  return Boolean(state.modifiers.contractApFree) || procurementOf(state) >= PROC_CONTRACT_FREE_TIER;
}

export function liveContracts(state: GameState): SupplyContract[] {
  return (state.supplyContracts ?? []).filter((item) => item.remainingMonths > 0 || item.pendingQty > 0);
}

function orderCountFor(sales: number): number {
  return BASE_MONTH_ORDERS + Math.floor(Math.max(0, sales) / 2);
}

export function hireEffectLines(state: GameState, role: Role, rdTrack: RdTrack = 'product'): string[] {
  const card = `${ROLE_LABEL[role]}人员越多，本月提案越容易出现${ROLE_LABEL[role]}类方案。`;
  if (role === 'production') {
    const next = { ...state, staff: { ...state.staff, production: state.staff.production + 1 } };
    const before = capacityOf(state);
    const after = capacityOf(next);
    const slots = state.machines * WORKERS_PER_MACHINE;
    const overflow = Math.max(0, next.staff.production - slots);
    const n = next.staff.production;
    const perk =
      n === PROD_FLEX_STAFF
        ? `满第一台：每月弹性产能 +${PROD_FLEX_CAP}。`
        : n === PROD_OVERTIME_STAFF
          ? state.machines >= PROD_OVERTIME_MACHINES
            ? `成型：可连班（+${PROD_OVERTIME_CAP} 产能，加班费 ${money(PROD_OVERTIME_COST)}，不耗 AP）。`
            : `连班还需 ${PROD_OVERTIME_MACHINES} 台设备。`
          : n === PROD_FIELD_YIELD_STAFF && state.machines >= PROD_FIELD_YIELD_MACHINES
            ? `满编：现场出成每 ${PROD_FIELD_YIELD_EVERY} 件额外入库 1 件（有良率专利时不生效）。`
            : `入门 ${PROD_FLEX_STAFF} 人弹性产能，成型 ${PROD_OVERTIME_STAFF} 人且 ${PROD_OVERTIME_MACHINES} 台可连班，满编 ${PROD_FIELD_YIELD_STAFF} 人现场出成。`;
    return [
      `本月立刻到岗。设备位内每人产能 +${CAP_PER_WORKER}，超出每人 +${CAP_OVERFLOW}。${perk}`,
      `本次入职：产能 ${before} → ${after}（可安置 ${slots} 人${overflow ? `，超编 ${overflow} 人` : ''}）。`,
      card,
    ];
  }
  if (role === 'management') {
    const before = maxApFor(state.staff);
    const after = maxApFor({ ...state.staff, management: state.staff.management + 1 });
    const n = state.staff.management + 1;
    const perk =
      n === MGMT_SHOP_TIER
        ? `入门：本月出示 ${shopCountOf({ ...state, staff: { ...state.staff, management: n } })} 份，待执行上限 ${handLimitOf({ ...state, staff: { ...state.staff, management: n } })}。`
        : n === MGMT_BUY_TIER
          ? `成型：每月可立项 ${cardBuyLimitOf({ ...state, staff: { ...state.staff, management: n } })} 份。`
          : n === MGMT_SHOP_MAX_TIER
            ? `满编：出示 ${shopCountOf({ ...state, staff: { ...state.staff, management: n } })} 份，待执行上限 ${handLimitOf({ ...state, staff: { ...state.staff, management: n } })}。`
            : `2 人加出示和手牌，5 人每月立项两份，6 人再加选择面。`;
    return [
      `每名管理人员提供 1 点行动点上限（基础 ${BASE_AP} 点）。${perk}`,
      `本次入职：行动点上限 ${before} → ${after}。本月剩余行动点不补发，下月按新上限刷新。`,
      card,
    ];
  }
  if (role === 'sales') {
    const have = state.monthOrders?.length ?? 0;
    const before = orderCountFor(state.staff.sales);
    const after = orderCountFor(state.staff.sales + 1);
    const baseline =
      after > before
        ? `本次入职：下月月初订单 ${before} → ${after} 张。`
        : `下月月初订单仍为 ${before} 张。再招 1 名销售后升到 ${before + 1}。`;
    const n = state.staff.sales + 1;
    const pass = n >= 4 ? SALES_PASS_4 : n >= 3 ? SALES_PASS_3 : n >= 2 ? SALES_PASS_2 : SALES_PASS_1;
    const credit = n >= 4 ? SALES_CREDIT_4 : n >= 3 ? SALES_CREDIT_3 : CREDIT_SALE_RATE;
    return [
      `本月立刻到岗，并带来 1 张市场单。本月订单 ${have} → ${have + 1} 张。`,
      `每 2 名销售人员使月初订单 +1（基础 ${BASE_MONTH_ORDERS} 张）。${baseline}`,
      `原料上涨时售价跟进 ${pctLabel(pass)}（价格战跟不上）。赊销 ${pctLabel(credit)}。4 人成型可跟进 ${pctLabel(SALES_PASS_4)}。`,
      `逾期应收确认后分 3 个月按余额催收，收不回的部分会核销。每人使每月追回比例 +${pctLabel(AR_RECOVER_PER_SALES)}。本次入职后首月追回 ${pctLabel(arRecoveryRate(1, state.staff.sales))} → ${pctLabel(arRecoveryRate(1, state.staff.sales + 1))}。`,
      card,
    ];
  }
  if (role === 'procurement') {
    const n = (state.staff.procurement ?? 0) + 1;
    const perk =
      n === PROC_TRADER_TIER
        ? '加价盘倍率下调一档。'
        : n === PROC_DISCOUNT_TIER
          ? `厂供 ${Math.round((1 - PROC_FACTORY_DISCOUNT) * 10)} 折，签协议不耗 AP。`
          : n === PROC_DUAL_CONTRACT_TIER
            ? `成型：可同时 ${maxLiveContractsOf({ ...state, staff: { ...state.staff, procurement: n } })} 份协议，锁 ${CONTRACT_COVER_MONTHS_LONG} 个月，加价盘再降一档。`
            : `3 人降加价盘，4 人厂供折扣并免协议 AP，5 人双协议。`;
    return [
      '本月立刻到岗，随机放宽本月现货额度（优先补最紧的料）。购入仍走采购部，按市价付现。',
      `每人使每月钢材/塑料现货 +4、芯片 +1。本次入职后编制 ${n - 1} → ${n} 人。${perk}`,
      card,
    ];
  }
  const track = rdTrack;
  const project = track === 'product' ? currentProductProject(state) : currentTechProject(state);
  const productOpen = (state.extraProducts?.length ?? 0) < MAX_RD_PRODUCTS;
  const techOpen = availableTechIps(state).length > 0;
  const nextStaff = rdTrackStaff(state, track) + 1;
  const lines = [
    `编入${RD_TRACK_LABEL[track]}。人数只影响成功率（每人 ${pctLabel(RD_SUCCESS_PER_HEAD)}，每组最多 ${RD_STAFF_CAP} 人，首轮上限 ${pctLabel(RD_SUCCESS_CAP)}，失败续攻可到 100%）。有人值守时每月结算推进 1 个月。`,
  ];
  if (track === 'product') {
    lines.push(
      nextStaff >= RD_STAFF_CAP
        ? `满编后产品课题 ${rdCycleOf('product', nextStaff)} 个月一轮。`
        : `产品组满 ${RD_STAFF_CAP} 人时课题改为 ${rdCycleOf('product', RD_STAFF_CAP)} 个月。`,
    );
  } else {
    lines.push(`工艺同时只生效 ${MAX_ACTIVE_IPS} 项，多完成的必须换掉一项。`);
  }
  if (!project) {
    lines.push(
      track === 'product'
        ? productOpen
          ? '入职后在研发部开题，自选简化结构、替代芯片或冲毛利。'
          : '产品课题已经做完，新人加入后做工艺微调。'
        : techOpen
          ? '入职时选择要攻关的知识产权。选定后 2 个月一轮。'
          : '工艺专利已经齐了，新人加入后做持续改善。',
    );
  }
  lines.push(card);
  return lines;
}

export function buyLineCost(state: GameState, material: MaterialId, qty: number, channel: BuyChannel = 'spot'): number {
  if (qty <= 0) return 0;
  const unit = state.materialPrices[material] ?? 0;
  if (channel === 'trader') {
    return roundPrice(unit * qty * traderPriceMultOf(state, material));
  }
  return roundPrice(unit * qty * (1 - factoryBuyDiscountOf(state)));
}

export function buyCartCost(
  state: GameState,
  items: { material: MaterialId; qty: number; channel?: BuyChannel }[],
): number {
  return roundMoney(
    items.reduce((sum, line) => sum + buyLineCost(state, line.material, line.qty, line.channel ?? 'spot'), 0),
  );
}

export function loanLimit(machines: number): number {
  return machines * LOAN_PER_MACHINE;
}

export function monthlyInterest(debt: number): number {
  return debt > 0 ? roundMoney(debt * INTEREST_RATE) : 0;
}

function loanLotsOf(state: GameState): LoanLot[] {
  if (state.loans?.length) return state.loans.map((lot) => ({ ...lot }));
  if (state.debt > 0) {
    return [
      {
        amount: state.debt,
        originMonth: state.month,
        dueMonth: state.month + LOAN_TERM_MONTHS,
      },
    ];
  }
  return [];
}

function repayLoanLots(lots: LoanLot[], amount: number): LoanLot[] {
  let left = roundMoney(amount);
  const remain = lots.map((lot) => ({ ...lot }));
  const order = remain
    .map((_, index) => index)
    .sort((a, b) => remain[a]!.dueMonth - remain[b]!.dueMonth || remain[a]!.originMonth - remain[b]!.originMonth || a - b);
  for (const index of order) {
    if (left <= 0) break;
    const lot = remain[index]!;
    const take = roundMoney(Math.min(left, lot.amount));
    lot.amount = roundMoney(lot.amount - take);
    left = roundMoney(left - take);
  }
  return remain.filter((lot) => lot.amount > 0.05);
}

function loanChargesOf(
  lots: LoanLot[],
  month: number,
): { interest: number; defaultFee: number; lateFee: number } {
  const debt = roundMoney(lots.reduce((sum, lot) => sum + lot.amount, 0));
  const interest = monthlyInterest(debt);
  let defaultFee = 0;
  let lateFee = 0;
  for (const lot of lots) {
    if (month < lot.dueMonth) continue;
    if (!lot.defaultCharged) defaultFee = roundMoney(defaultFee + roundMoney(lot.amount * LOAN_DEFAULT_RATE));
    lateFee = roundMoney(lateFee + roundMoney(lot.amount * LOAN_LATE_FEE_RATE));
  }
  return { interest, defaultFee, lateFee };
}

export function previewLoanCharges(
  state: GameState,
  adjust?: { borrow?: number; repay?: number },
): { interest: number; defaultFee: number; lateFee: number } {
  let lots = loanLotsOf(state);
  if (adjust?.repay) lots = repayLoanLots(lots, adjust.repay);
  if (adjust?.borrow) {
    const n = roundMoney(adjust.borrow);
    if (n > 0) {
      lots.push({
        amount: n,
        originMonth: state.month,
        dueMonth: state.month + LOAN_TERM_MONTHS,
      });
    }
  }
  return loanChargesOf(lots, state.month);
}

export function loanOverdueOf(state: GameState): number {
  return roundMoney(
    loanLotsOf(state).reduce((sum, lot) => (state.month > lot.dueMonth ? sum + lot.amount : sum), 0),
  );
}

export function loanDueThisMonthOf(state: GameState): number {
  return roundMoney(
    loanLotsOf(state).reduce((sum, lot) => (state.month === lot.dueMonth ? sum + lot.amount : sum), 0),
  );
}

function ensureLoans(state: GameState): void {
  if (!state.loans) state.loans = loanLotsOf(state);
  syncDebt(state);
}

function syncDebt(state: GameState): void {
  if (!state.loans) state.loans = [];
  state.debt = roundMoney(state.loans.reduce((sum, lot) => sum + lot.amount, 0));
}

function addLoan(state: GameState, amount: number): void {
  ensureLoans(state);
  const n = roundMoney(amount);
  if (n <= 0) return;
  state.loans.push({
    amount: n,
    originMonth: state.month,
    dueMonth: state.month + LOAN_TERM_MONTHS,
  });
  syncDebt(state);
}

function applyLoanRepay(state: GameState, amount: number): void {
  ensureLoans(state);
  state.loans = repayLoanLots(state.loans, amount);
  syncDebt(state);
}

function applyLoanCharges(state: GameState): { interest: number; defaultFee: number; lateFee: number } {
  ensureLoans(state);
  const charges = loanChargesOf(state.loans, state.month);
  pay(state, charges.interest, 'finance');
  const penalty = roundMoney(charges.defaultFee + charges.lateFee);
  if (penalty > 0) pay(state, penalty, 'extra');
  for (const lot of state.loans) {
    if (state.month >= lot.dueMonth) lot.defaultCharged = true;
  }
  if (charges.defaultFee > 0 || charges.lateFee > 0) {
    const bits: string[] = [];
    if (charges.defaultFee > 0) bits.push(`违约金 ${money(charges.defaultFee)}`);
    if (charges.lateFee > 0) bits.push(`滞纳金 ${money(charges.lateFee)}`);
    pushLog(state, `短期借款到期未还，已计提 ${bits.join('、')}。`);
    noteDept(state, 'finance', `到期未还：${bits.join('、')}`, false);
  }
  return charges;
}

export function capacityOf(state: GameState): number {
  const capped = Math.min(state.staff.production, state.machines * WORKERS_PER_MACHINE);
  const overflow = Math.max(0, state.staff.production - state.machines * WORKERS_PER_MACHINE);
  return (
    state.machines * MACHINE_BASE_CAP +
    capped * CAP_PER_WORKER +
    overflow * CAP_OVERFLOW +
    state.modifiers.extraCapacity +
    flexCapacityOf(state) +
    rdCapacityBonus(state)
  );
}

export interface FactoryMachineView {
  slot: number;
  filled: boolean;
  workers: number;
  cap: number;
}

export interface FactoryView {
  index: number;
  name: string;
  machines: FactoryMachineView[];
  machineCount: number;
  workerCount: number;
  overflow: number;
  cap: number;
  used: number;
}

export function factoryLayout(state: GameState, capUsed = 0): FactoryView[] {
  const factories = Math.max(1, state.factories);
  let machinesLeft = state.machines;
  let workersLeft = state.staff.production;
  const views: FactoryView[] = [];

  for (let i = 0; i < factories; i++) {
    const machineCount = Math.min(SLOTS_PER_FACTORY, Math.max(0, machinesLeft));
    machinesLeft -= machineCount;
    const machines: FactoryMachineView[] = [];
    let workerCount = 0;
    let cap = 0;
    for (let slot = 0; slot < SLOTS_PER_FACTORY; slot++) {
      if (slot < machineCount) {
        const workers = Math.min(WORKERS_PER_MACHINE, Math.max(0, workersLeft));
        workersLeft -= workers;
        workerCount += workers;
        const slotCap = MACHINE_BASE_CAP + workers * CAP_PER_WORKER;
        cap += slotCap;
        machines.push({ slot: slot + 1, filled: true, workers, cap: slotCap });
      } else {
        machines.push({ slot: slot + 1, filled: false, workers: 0, cap: 0 });
      }
    }
    views.push({
      index: i,
      name: factoryName(i),
      machines,
      machineCount,
      workerCount,
      overflow: 0,
      cap,
      used: 0,
    });
  }

  if (workersLeft > 0) {
    const host = [...views].reverse().find((view) => view.machineCount > 0) ?? views[views.length - 1]!;
    host.overflow = workersLeft;
    host.cap += workersLeft * CAP_OVERFLOW;
  }

  const extra = (state.modifiers.extraCapacity ?? 0) + flexCapacityOf(state) + rdCapacityBonus(state);
  if (extra !== 0 && views[0]) {
    views[0].cap = Math.max(0, views[0].cap + extra);
  }

  let usedLeft = capUsed;
  for (const view of views) {
    view.used = Math.min(view.cap, usedLeft);
    usedLeft -= view.used;
  }

  return views;
}

export interface OrderCapLoad {
  orderId: string;
  productId: ProductId;
  qty: number;
  fromStock: number;
  make: number;
  cap: number;
}

export function orderCapLoads(state: GameState, acceptedIds = state.acceptedOrderIds ?? []): OrderCapLoad[] {
  const stockLeft: Partial<Record<ProductId, number>> = {};
  for (const id of state.unlockedProducts) {
    stockLeft[id] = state.finished[id] ?? 0;
  }
  const loads: OrderCapLoad[] = [];
  for (const order of state.monthOrders ?? []) {
    if (!acceptedIds.includes(order.id)) continue;
    const have = stockLeft[order.productId] ?? 0;
    const fromStock = Math.min(order.qty, have);
    stockLeft[order.productId] = have - fromStock;
    const make = order.qty - fromStock;
    loads.push({
      orderId: order.id,
      productId: order.productId,
      qty: order.qty,
      fromStock,
      make,
      cap: make,
    });
  }
  return loads;
}

export function demandOf(state: GameState, id: ProductId): number {
  return Math.max(0, state.demand[id] ?? 0);
}

export interface ProductionPlan {
  sell: Partial<Record<ProductId, number>>;
  produce: Partial<Record<ProductId, number>>;
  capUsed: number;
  capTotal: number;
  materialNeed: Materials;
  ok: boolean;
  missing: string[];
}

export function sellPriceOf(state: GameState, id: ProductId): number {
  const base = state.productPrices[id] ?? 0;
  const ip = hasIp(state, 'spec') ? IP_PRICE_BONUS : 0;
  return roundPrice(base * (1 + state.modifiers.priceBonus + ip));
}

export function bomCost(state: GameState, id: ProductId): number {
  return bomSpotCost(state, productOf(state, id).bom);
}

export function bomSpotCost(state: GameState, bom: Bom): number {
  let cost = 0;
  for (const key of MATERIAL_IDS) {
    const need = bom[key] ?? 0;
    cost += need * (state.materialPrices[key] ?? 0);
  }
  return roundPrice(cost);
}

export function listedGrossOf(state: GameState, id: ProductId): number {
  const price = state.productPrices[id] ?? productOf(state, id).basePrice;
  return roundMoney(price - bomCost(state, id));
}

export function lowestUnlockedMargin(state: GameState): number {
  const ids = state.unlockedProducts ?? [];
  if (!ids.length) return 0;
  return Math.min(...ids.map((id) => listedGrossOf(state, id)));
}

export function bomBookCost(state: GameState, id: ProductId): number {
  const bom = productOf(state, id).bom;
  let cost = 0;
  for (const key of MATERIAL_IDS) {
    const need = bom[key] ?? 0;
    if (need <= 0) continue;
    const qty = state.materials[key] ?? 0;
    const unit = qty > 0 ? avgMaterialCost(state, key) : (state.materialPrices[key] ?? 0);
    cost += need * unit;
  }
  return roundMoney(cost);
}

export function operatingProfitOf(ledger: MonthLedger): number {
  return roundMoney(
    ledger.revenue -
      ledger.cogs -
      ledger.taxes -
      ledger.selling -
      ledger.admin -
      (ledger.rd ?? 0) -
      ledger.finance -
      (ledger.creditImpairment ?? 0) +
      (ledger.creditReversal ?? 0) -
      (ledger.assetImpairment ?? 0),
  );
}

export function profitBeforeTaxOf(ledger: MonthLedger): number {
  return roundMoney(operatingProfitOf(ledger) + ledger.extraIncome - ledger.extraExpense);
}

export function netProfitOf(ledger: MonthLedger): number {
  return roundMoney(profitBeforeTaxOf(ledger) - (ledger.incomeTax ?? 0));
}

export function operatingCashOf(ledger: MonthLedger): number {
  return roundMoney(
    ledger.cfSales - ledger.cfBuy - ledger.cfEmployees - ledger.cfTaxes + ledger.cfOtherOpIn - ledger.cfOtherOpOut,
  );
}

export function maxProduce(state: GameState, id: ProductId): number {
  const unit = unitsNeeded(state, id, 1);
  let limit = capacityOf(state);
  for (const key of MATERIAL_IDS) {
    const need = unit[key] ?? 0;
    if (need > 0) limit = Math.min(limit, Math.floor(state.materials[key] / need));
  }
  return Math.max(0, limit);
}

function emptyMats(): Materials {
  return { a: 0, b: 0, c: 0, d: 0 };
}

function emptySpot(): Record<MaterialId, number> {
  return { a: 0, b: 0, c: 0, d: 0 };
}

export function spotOf(state: GameState, id: MaterialId): number {
  return Math.max(0, state.materialSpot?.[id] ?? 0);
}

export function traderOf(state: GameState, id: MaterialId): number {
  return Math.max(0, state.traderSpot?.[id] ?? 0);
}

export function procurementOf(state: GameState): number {
  return Math.max(0, state.staff.procurement ?? 0);
}

function unlockedMaterials(state: GameState): MaterialId[] {
  return MATERIAL_IDS.filter((id) => id !== 'd' || state.materialDUnlocked);
}

function clampSpot(id: MaterialId, qty: number): number {
  return clamp(qty, 0, SPOT_HARD_CAP[id] ?? qty);
}

function addSpot(state: GameState, id: MaterialId, delta: number): number {
  if (!state.materialSpot) state.materialSpot = emptySpot();
  state.materialSpot[id] = clampSpot(id, (state.materialSpot[id] ?? 0) + delta);
  return state.materialSpot[id];
}

function addTrader(state: GameState, id: MaterialId, delta: number): number {
  if (!state.traderSpot) state.traderSpot = emptySpot();
  const cap = TRADER_HARD_CAP[id] ?? 0;
  state.traderSpot[id] = clamp((state.traderSpot[id] ?? 0) + delta, 0, cap);
  return state.traderSpot[id];
}

function applySpotGrowth(state: GameState): void {
  if (!state.materialSpot) state.materialSpot = emptySpot();
  const n = procurementOf(state);
  for (const id of MATERIAL_IDS) {
    if (id === 'd' && !state.materialDUnlocked) {
      state.materialSpot.d = 0;
      continue;
    }
    let qty = state.materialSpot[id] ?? 0;
    qty += (SPOT_STAFF_ADD[id] ?? 0) * n;
    if (id === 'd') qty += Math.floor(n / 2);
    qty += state.quarterSpotBonus?.[id] ?? 0;
    state.materialSpot[id] = clampSpot(id, qty);
  }
}

function rollTraderSpot(state: GameState): void {
  const n = procurementOf(state);
  const next = emptySpot();
  for (const id of MATERIAL_IDS) {
    if (id === 'd' && !state.materialDUnlocked) {
      next[id] = 0;
      continue;
    }
    const trend = state.marketTrend?.materials[id] ?? 0;
    let qty = 0;
    if (id === 'a' || id === 'b') {
      qty = pick([4, 8]) + 4 * n;
      if (trend > 0) qty += 4;
    } else if (id === 'c') {
      qty = pick([1, 2]) + n;
      if (trend > 0) qty += 1;
    } else {
      qty = pick([0, 1]) + Math.floor(n / 2);
    }
    next[id] = clamp(qty, 0, TRADER_HARD_CAP[id] ?? 0);
  }
  state.traderSpot = next;
}

function grantHireSpot(state: GameState): string {
  const ids = unlockedMaterials(state);
  const ranked = [...ids].sort((a, b) => spotOf(state, a) - spotOf(state, b) || a.localeCompare(b));
  const first = ranked[0];
  if (!first) return '本月没有可放宽的原料额度。';
  const firstAdd = first === 'a' || first === 'b' ? 8 : first === 'c' ? 2 : 1;
  addSpot(state, first, firstAdd);
  const parts = [`${materialName(first)}现货 +${firstAdd}`];
  if (ranked.length > 1 && Math.random() < 0.3) {
    const second = pick(ranked.slice(1));
    const secondAdd = second === 'a' || second === 'b' ? 4 : 1;
    addSpot(state, second, secondAdd);
    parts.push(`${materialName(second)}现货 +${secondAdd}`);
  }
  return `到岗调货：${parts.join('，')}，计入本月现货额度`;
}

export function contractQtyOptions(id: MaterialId): number[] {
  if (id === 'a' || id === 'b') return [4, 8];
  if (id === 'c') return [1, 2];
  return [1];
}

export function contractUnitPrice(state: GameState, id: MaterialId): number {
  const off = state.modifiers.contractPrepayDiscount ?? 0;
  return roundPrice((state.materialPrices[id] ?? 0) * (1 - off));
}

export function contractPrepayOf(state: GameState, id: MaterialId, monthlyQty: number): number {
  return roundMoney(contractUnitPrice(state, id) * monthlyQty);
}

export function canSignContract(state: GameState, id: MaterialId, monthlyQty: number): string | null {
  if (state.phase !== 'actions') return '事件结束后才能签协议。';
  if (state.month > lastContractSignMonthOf(state)) {
    return `剩余月份不足 ${contractCoverMonthsOf(state)} 个月，不能新签。`;
  }
  if (id === 'd' && !state.materialDUnlocked) return '特种合金尚未开线。';
  if (!contractQtyOptions(id).includes(monthlyQty)) return '月供档位不对。';
  ensureContracts(state);
  const live = liveContracts(state);
  if (live.some((item) => item.material === id)) return '这种原料已有长期协议。';
  if (live.length >= maxLiveContractsOf(state)) {
    return maxLiveContractsOf(state) > 1 ? '长期协议已满。' : '已有一份长期协议。';
  }
  if (!contractApFreeOf(state) && state.ap <= 0) return '行动点不足。';
  if (state.cash < contractPrepayOf(state, id, monthlyQty)) return '现金不够支付预付。';
  return null;
}

function ensureContracts(state: GameState): void {
  if (!Array.isArray(state.supplyContracts)) {
    state.supplyContracts = state.supplyContract ? [state.supplyContract] : [];
  }
  state.supplyContracts = state.supplyContracts.filter((item) => item.remainingMonths > 0 || item.pendingQty > 0);
  state.supplyContract = state.supplyContracts[0] ?? null;
}

function syncPrepaid(state: GameState): void {
  ensureContracts(state);
  state.prepaid = roundMoney(state.supplyContracts.reduce((sum, item) => sum + (item.prepaid ?? 0), 0));
  state.supplyContract = state.supplyContracts[0] ?? null;
}

function writeOffPrepaid(state: GameState, contract: SupplyContract, reason: string): void {
  const lost = roundMoney(contract.prepaid ?? 0);
  if (lost > 0) {
    state.ledger.extraExpense = roundMoney(state.ledger.extraExpense + lost);
    contract.prepaid = 0;
    noteDept(state, 'store', `${reason}，预付 ${money(lost)} 不予退还`, false);
  }
  syncPrepaid(state);
}

function removeContract(state: GameState, contract: SupplyContract): void {
  ensureContracts(state);
  state.supplyContracts = state.supplyContracts.filter((item) => item !== contract);
  syncPrepaid(state);
}

function queueContractDelivery(state: GameState): void {
  ensureContracts(state);
  for (const contract of state.supplyContracts) {
    if (contract.remainingMonths <= 0 && contract.pendingQty <= 0) continue;
    if (contract.pendingQty > 0 || contract.remainingMonths <= 0) continue;
    contract.pendingQty = contract.monthlyQty;
    contract.pendingCost = roundMoney(contract.monthlyQty * contract.unitPrice);
  }
  syncPrepaid(state);
}

function deliverOneContract(state: GameState, contract: SupplyContract): boolean {
  if (contract.pendingQty <= 0) return false;
  const qty = contract.pendingQty;
  const cost = contract.pendingCost;
  if (contract.prepaid + 1e-6 >= cost) {
    contract.prepaid = roundMoney(contract.prepaid - cost);
    syncPrepaid(state);
  } else if (state.cash + 1e-6 >= cost) {
    pay(state, cost, 'buy');
  } else {
    return false;
  }
  state.materialLayers[contract.material] = addLayer(
    state.materialLayers[contract.material],
    qty,
    cost,
    state.month,
  );
  syncMaterialBooks(state);
  contract.pendingQty = 0;
  contract.pendingCost = 0;
  contract.remainingMonths -= 1;
  contract.missed = 0;
  noteDept(
    state,
    'store',
    `协议到货：${materialName(contract.material)} ${qty} 件，锁价 ${money(contract.unitPrice)}/件`,
  );
  if (contract.remainingMonths <= 0) {
    writeOffPrepaid(state, contract, '协议履行完毕');
    removeContract(state, contract);
  }
  return true;
}

function deliverContract(state: GameState, material?: MaterialId): boolean {
  ensureContracts(state);
  const targets = state.supplyContracts.filter(
    (item) => item.pendingQty > 0 && (!material || item.material === material),
  );
  let any = false;
  for (const contract of targets) {
    if (deliverOneContract(state, contract)) any = true;
  }
  return any;
}

function forfeitContractLot(state: GameState): void {
  ensureContracts(state);
  for (const contract of [...state.supplyContracts]) {
    if (contract.pendingQty <= 0) continue;
    contract.pendingQty = 0;
    contract.pendingCost = 0;
    contract.remainingMonths -= 1;
    contract.missed += 1;
    noteDept(state, 'store', `${materialName(contract.material)}本月协议到货未付，份额作废`);
    if (contract.missed >= 2 || contract.remainingMonths <= 0) {
      writeOffPrepaid(state, contract, '长期协议解约');
      removeContract(state, contract);
    }
  }
  syncPrepaid(state);
}

export function sameRdAssign(a: RdAssign, b: RdAssign): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'tech' && b.kind === 'tech') return (a.ipId ?? null) === (b.ipId ?? null);
  if (a.kind === 'product' && b.kind === 'product') return (a.archetype ?? null) === (b.archetype ?? null);
  if (a.kind === 'replace' && b.kind === 'replace') return a.dropId === b.dropId;
  return true;
}

export function purchaseQtyOptions(remaining: number, crate = 1): number[] {
  if (remaining <= 0) return [];
  const size = Math.max(1, crate);
  const opts: number[] = [];
  const add = (n: number) => {
    const v = Math.max(0, Math.min(remaining, Math.floor(n)));
    if (v > 0 && !opts.includes(v)) opts.push(v);
  };
  add(size);
  add(size * 2);
  add(Math.floor(remaining / (2 * size)) * size);
  add(remaining);
  opts.sort((a, b) => a - b);
  if (opts.length <= 3) return opts;
  const half = remaining / 2;
  const mid = opts.reduce((best, n) => (Math.abs(n - half) < Math.abs(best - half) ? n : best));
  return [...new Set([opts[0], mid, opts[opts.length - 1]])].sort((a, b) => a - b);
}

export function loanAmountOptions(max: number): number[] {
  const cap = roundMoney(Math.max(0, max));
  if (cap <= 0) return [];
  if (cap <= 2) return [cap];
  const opts = purchaseQtyOptions(cap, 2).filter((n) => n < cap - 1e-6);
  opts.push(cap);
  if (opts.length <= 3) return opts;
  const half = cap / 2;
  const mid = opts
    .slice(0, -1)
    .reduce((best, n) => (Math.abs(n - half) < Math.abs(best - half) ? n : best), opts[0]!);
  return [...new Set([opts[0], mid, cap])].sort((a, b) => a - b);
}

export function materialCrateSize(id: MaterialId): number {
  return id === 'a' || id === 'b' ? 4 : 1;
}

export function volumeProductOf(state: GameState): ProductId {
  const unlocked = unlockedCatalog(state);
  if (!unlocked.length) return 'basic';
  return unlocked.reduce((best, item) => (item.baseDemand > best.baseDemand ? item : best), unlocked[0]!).id;
}

export function productionPlan(
  state: GameState,
  acceptedIds: string[] = state.acceptedOrderIds ?? [],
  extra: Partial<Record<ProductId, number>> = state.extraProduce ?? {},
): ProductionPlan {
  const sell: Partial<Record<ProductId, number>> = {};
  for (const order of state.monthOrders ?? []) {
    if (!acceptedIds.includes(order.id)) continue;
    sell[order.productId] = (sell[order.productId] ?? 0) + order.qty;
  }
  const produce: Partial<Record<ProductId, number>> = {};
  const ids = new Set<ProductId>([
    ...state.unlockedProducts,
    ...(Object.keys(sell) as ProductId[]),
    ...(Object.keys(extra) as ProductId[]),
  ]);
  let capUsed = 0;
  const materialNeed = emptyMats();
  for (const id of ids) {
    const extraQty = Math.max(0, Math.floor(extra[id] ?? 0));
    const need = sell[id] ?? 0;
    const stock = state.finished[id] ?? 0;
    const qty = extraQty + Math.max(0, need - stock);
    produce[id] = qty;
    capUsed += qty;
    const bomNeed = unitsNeeded(state, id, qty);
    for (const key of MATERIAL_IDS) {
      materialNeed[key] = roundMoney(materialNeed[key] + (bomNeed[key] ?? 0));
    }
  }
  const capTotal = capacityOf(state);
  const missing: string[] = [];
  if (capUsed > capTotal) missing.push(`产能差 ${capUsed - capTotal}`);
  for (const key of MATERIAL_IDS) {
    if (materialNeed[key] > (state.materials[key] ?? 0)) {
      missing.push(`${materialName(key)}差 ${materialNeed[key] - (state.materials[key] ?? 0)}`);
    }
  }
  return {
    sell,
    produce,
    capUsed,
    capTotal,
    materialNeed,
    ok: missing.length === 0,
    missing,
  };
}

export function canAcceptOrder(state: GameState, orderId: string): boolean {
  const accepted = state.acceptedOrderIds ?? [];
  if (accepted.includes(orderId)) return true;
  return productionPlan(state, [...accepted, orderId], state.extraProduce ?? {}).ok;
}

export function maxExtraProduce(state: GameState, productId: ProductId): number {
  const extra = { ...(state.extraProduce ?? {}) };
  extra[productId] = 0;
  const plan = productionPlan(state, state.acceptedOrderIds ?? [], extra);
  const capLeft = Math.max(0, plan.capTotal - plan.capUsed);
  const unitNeed = unitsNeeded(state, productId, 1);
  let byMat = capLeft;
  for (const key of MATERIAL_IDS) {
    const unit = unitNeed[key] ?? 0;
    if (unit <= 0) continue;
    const left = Math.max(0, (state.materials[key] ?? 0) - (plan.materialNeed[key] ?? 0));
    byMat = Math.min(byMat, Math.floor(left / unit));
  }
  return Math.max(0, byMat);
}

function syncDemandFromOrders(state: GameState): void {
  const demand: Partial<Record<ProductId, number>> = {};
  for (const order of state.monthOrders ?? []) {
    demand[order.productId] = (demand[order.productId] ?? 0) + order.qty;
  }
  state.demand = demand;
}

function orderSizePool(state: GameState, productId: ProductId): number[] {
  const boosted = Boolean(climateById(state.climateId).mods?.biggerOrders);
  const def = productOf(state, productId);
  if (isVolumeProduct(def)) return boosted ? [10, 12, 16] : [8, 10, 12];
  if (isPremiumProduct(def)) return boosted ? [1, 2] : [1];
  return boosted ? [4, 6] : [3, 4];
}

function sizeAfterDemand(state: GameState, qty: number, productId: ProductId, extra: number): number {
  const volume = isVolumeProduct(productOf(state, productId));
  if (extra <= -6) return Math.max(volume ? 6 : 1, qty - (volume ? 4 : 1));
  if (extra >= 8) return qty + (volume ? 4 : 1);
  return qty;
}

function weightedProducts(state: GameState): ProductId[] {
  const climate = climateById(state.climateId);
  const copies: ProductId[] = [];
  for (const def of unlockedCatalog(state)) {
    let weight = isVolumeProduct(def) ? 3 : isPremiumProduct(def) ? 1 : 2;
    if (state.staff.sales >= 2 && isPremiumProduct(def)) weight += 1;
    if (isVolumeProduct(def)) weight += climate.mods?.volumeWeight ?? 0;
    if (isPremiumProduct(def) || (def.bom.c ?? 0) > 0) weight += climate.mods?.premiumWeight ?? 0;
    weight = Math.max(1, weight);
    for (let i = 0; i < weight; i += 1) copies.push(def.id);
  }
  return copies.length ? copies : ['basic'];
}

function pushOrder(state: GameState, order: Omit<MonthOrder, 'id'>): MonthOrder {
  const full: MonthOrder = { ...order, id: nextUid(state) };
  state.monthOrders = [...(state.monthOrders ?? []), full];
  return full;
}

function rollMonthOrders(state: GameState): void {
  state.monthOrders = [];
  state.acceptedOrderIds = [];
  state.extraProduce = {};
  const climate = climateById(state.climateId);
  let count = orderCountFor(state.staff.sales) + (climate.mods?.extraOrders ?? 0);
  if ((state.modifiers.extraDemand ?? 0) <= -8) count -= 1;
  if ((state.modifiers.extraDemand ?? 0) >= 8) count += 1;
  count = clamp(count, 2, MAX_MONTH_ORDERS);

  if (state.pendingDeal) {
    const deal = state.pendingDeal;
    pushOrder(state, {
      productId: deal.productId,
      qty: deal.minSold,
      kind: 'contract',
      penalty: deal.penalty,
      okLog: deal.okLog,
      failLog: deal.failLog,
    });
  }

  const volume = volumeProductOf(state);
  const volumeQty = sizeAfterDemand(
    state,
    pick(orderSizePool(state, volume)),
    volume,
    state.modifiers.extraDemand ?? 0,
  );
  pushOrder(state, { productId: volume, qty: volumeQty, kind: 'market', penalty: 0 });

  const pool = weightedProducts(state);
  let guard = 0;
  while ((state.monthOrders?.length ?? 0) < count && guard < 12) {
    guard += 1;
    const productId = pick(pool);
    const qty = sizeAfterDemand(
      state,
      pick(orderSizePool(state, productId)),
      productId,
      state.modifiers.extraDemand ?? 0,
    );
    const dup = (state.monthOrders ?? []).some((item) => item.productId === productId && item.qty === qty && item.kind === 'market');
    if (dup && guard < 8) continue;
  pushOrder(state, { productId, qty, kind: 'market', penalty: 0 });
  }
  for (const launch of state.pendingLaunchOrders ?? []) {
    pushOrder(state, { productId: launch.productId, qty: launch.qty, kind: 'market', penalty: 0 });
  }
  state.pendingLaunchOrders = [];
  syncDemandFromOrders(state);
}

function addMarketOrder(state: GameState, productId: ProductId, qty: number): MonthOrder {
  const order = pushOrder(state, { productId, qty, kind: 'market', penalty: 0 });
  syncDemandFromOrders(state);
  return order;
}

function rollOneMarketOrder(state: GameState): MonthOrder {
  const pool = weightedProducts(state);
  let productId = volumeProductOf(state);
  let qty = 4;
  for (let guard = 0; guard < 8; guard += 1) {
    productId = pick(pool);
    qty = sizeAfterDemand(
      state,
      pick(orderSizePool(state, productId)),
      productId,
      state.modifiers.extraDemand ?? 0,
    );
    const dup = (state.monthOrders ?? []).some(
      (item) => item.productId === productId && item.qty === qty && item.kind === 'market',
    );
    if (!dup) break;
  }
  return addMarketOrder(state, productId, qty);
}

function clampExtraProduce(state: GameState): void {
  const extra = { ...(state.extraProduce ?? {}) };
  for (const id of state.unlockedProducts) {
    const max = maxExtraProduce({ ...state, extraProduce: { ...extra, [id]: 0 } }, id);
    extra[id] = Math.min(Math.max(0, extra[id] ?? 0), max);
  }
  state.extraProduce = extra;
}

export function monthOutlook(state: GameState): string {
  const cap = capacityOf(state);
  const orders = state.monthOrders ?? [];
  if (!orders.length) return `本月产能 ${cap}。订单尚未开出。`;
  const accepted = (state.acceptedOrderIds ?? []).length;
  const plan = productionPlan(state);
  const contract = orders.find((item) => item.kind === 'contract');
  if (contract && !(state.acceptedOrderIds ?? []).includes(contract.id)) {
    return `合同 ${skuName(state, contract.productId)} ${contract.qty} 件未接。已接 ${accepted}/${orders.length} 张，产能 ${plan.capUsed}/${plan.capTotal}。`;
  }
  return `订单 ${orders.length} 张，已接 ${accepted} 张。产能 ${plan.capUsed}/${plan.capTotal}。`;
}

export function materialValue(state: GameState): number {
  return MATERIAL_IDS.reduce((sum, id) => sum + (state.materialCost?.[id] ?? 0), 0);
}

export function finishedValue(state: GameState): number {
  return (Object.keys(state.finished) as ProductId[]).reduce((sum, id) => sum + (state.finishedCost?.[id] ?? 0), 0);
}

export function wipValue(state: GameState): number {
  return state.wip ?? 0;
}

export function inventoryValue(state: GameState): number {
  return roundMoney(Math.max(0, materialValue(state) + wipValue(state) + finishedValue(state) - (state.inventoryProvision ?? 0)));
}

export function receivablesGross(state: GameState): number {
  return roundMoney((state.receivables ?? []).reduce((sum, lot) => sum + lot.amount, 0));
}

export function receivablesNet(state: GameState): number {
  return roundMoney(Math.max(0, receivablesGross(state) - (state.badDebtProvision ?? 0)));
}

export function inventoryProvisionOf(state: GameState): number {
  return state.inventoryProvision ?? 0;
}

export function fixedAssetCostOf(state: GameState): number {
  return roundMoney((state.machineGross ?? 0) + (state.factoryGross ?? 0));
}

export function accumDepOf(state: GameState): number {
  return roundMoney((state.accumDepMachines ?? 0) + (state.accumDepFactories ?? 0));
}

export function bookAssets(state: GameState): number {
  return roundMoney(fixedAssetCostOf(state) - accumDepOf(state));
}

export function netAssetsOf(state: GameState): number {
  return roundMoney(
    state.cash +
      (state.prepaid ?? 0) +
      receivablesNet(state) +
      inventoryValue(state) +
      bookAssets(state) -
      state.debt -
      state.wagesPayable -
      (state.taxPayable ?? 0),
  );
}

export function equityAccounts(state: GameState): { paidIn: number; surplus: number; retained: number; total: number } {
  const paidIn = state.paidInCapital ?? 0;
  const surplus = state.surplusReserve ?? 0;
  const total = netAssetsOf(state);
  return {
    paidIn,
    surplus,
    retained: roundMoney(total - paidIn - surplus),
    total,
  };
}

export function scoreNetAssets(state: GameState): number {
  return netAssetsOf(state);
}

export function monthlySalary(staff: Staff): number {
  return (
    staff.production * SALARY.production +
    staff.management * SALARY.management +
    staff.sales * SALARY.sales +
    staff.rd * SALARY.rd +
    (staff.procurement ?? 0) * SALARY.procurement
  );
}

function pushLog(state: GameState, line: string): void {
  state.log = [line, ...state.log].slice(0, 40);
}

function emptyDeptActs(): Record<DeptId, string[]> {
  return { ceo: [], finance: [], hr: [], infra: [], store: [], rd: [], sales: [] };
}

function noteDept(state: GameState, dept: DeptId, text: string, toLog = true): void {
  state.deptActs[dept] = [...state.deptActs[dept], text];
  if (toLog) pushLog(state, text);
}

export function emptyLedger(): MonthLedger {
  return {
    openingCash: 0,
    revenue: 0,
    cogs: 0,
    taxes: 0,
    selling: 0,
    admin: 0,
    finance: 0,
    extraIncome: 0,
    extraExpense: 0,
    rd: 0,
    creditImpairment: 0,
    creditReversal: 0,
    assetImpairment: 0,
    incomeTax: 0,
    cfSales: 0,
    cfBuy: 0,
    cfEmployees: 0,
    cfTaxes: 0,
    cfOtherOpIn: 0,
    cfOtherOpOut: 0,
    cfCapex: 0,
    cfBorrow: 0,
    cfRepay: 0,
    cfInterest: 0,
  };
}

export function emptyBooks(): MonthBooks {
  return {
    month: 0,
    title: '开业',
    cash: 0,
    materials: 0,
    wip: 0,
    finished: 0,
    inventory: 0,
    inventoryProvision: 0,
    receivables: 0,
    badDebtProvision: 0,
    receivablesNet: 0,
    prepaid: 0,
    fixedAssetCost: 0,
    accumDep: 0,
    fixedAssets: 0,
    borrowings: 0,
    wagesPayable: 0,
    taxPayable: 0,
    paidInCapital: 0,
    surplusReserve: 0,
    retainedEarnings: 0,
    equity: 0,
    ledger: emptyLedger(),
  };
}

export function snapshotBooks(state: GameState, title: string): MonthBooks {
  const equity = equityAccounts(state);
  const materials = materialValue(state);
  const wip = wipValue(state);
  const finished = finishedValue(state);
  const inventoryProvision = state.inventoryProvision ?? 0;
  const receivables = receivablesGross(state);
  const badDebtProvision = state.badDebtProvision ?? 0;
  return {
    month: state.month,
    title,
    cash: state.cash,
    materials,
    wip,
    finished,
    inventory: roundMoney(materials + wip + finished),
    inventoryProvision,
    receivables,
    badDebtProvision,
    receivablesNet: roundMoney(Math.max(0, receivables - badDebtProvision)),
    prepaid: state.prepaid ?? 0,
    fixedAssetCost: fixedAssetCostOf(state),
    accumDep: accumDepOf(state),
    fixedAssets: bookAssets(state),
    borrowings: state.debt,
    wagesPayable: state.wagesPayable,
    taxPayable: state.taxPayable ?? 0,
    paidInCapital: equity.paidIn,
    surplusReserve: equity.surplus,
    retainedEarnings: equity.retained,
    equity: equity.total,
    ledger: clone(state.ledger),
  };
}

function pay(
  state: GameState,
  amount: number,
  kind: 'buy' | 'wage' | 'selling' | 'admin' | 'tax' | 'incomeTax' | 'extra' | 'capex' | 'repay' | 'finance' | 'opOut',
): void {
  const n = roundMoney(amount);
  if (n <= 0) return;
  state.cash = roundMoney(state.cash - n);
  if (kind === 'buy') state.ledger.cfBuy = roundMoney(state.ledger.cfBuy + n);
  if (kind === 'wage') {
    state.ledger.admin = roundMoney(state.ledger.admin + n);
    state.ledger.cfEmployees = roundMoney(state.ledger.cfEmployees + n);
  }
  if (kind === 'selling') {
    state.ledger.selling = roundMoney(state.ledger.selling + n);
    state.ledger.cfOtherOpOut = roundMoney(state.ledger.cfOtherOpOut + n);
  }
  if (kind === 'admin') {
    state.ledger.admin = roundMoney(state.ledger.admin + n);
    state.ledger.cfOtherOpOut = roundMoney(state.ledger.cfOtherOpOut + n);
  }
  if (kind === 'tax') {
    state.ledger.taxes = roundMoney(state.ledger.taxes + n);
    state.ledger.cfTaxes = roundMoney(state.ledger.cfTaxes + n);
  }
  if (kind === 'incomeTax') {
    state.ledger.cfTaxes = roundMoney(state.ledger.cfTaxes + n);
  }
  if (kind === 'opOut') {
    state.ledger.cfOtherOpOut = roundMoney(state.ledger.cfOtherOpOut + n);
  }
  if (kind === 'extra') {
    state.ledger.extraExpense = roundMoney(state.ledger.extraExpense + n);
    state.ledger.cfOtherOpOut = roundMoney(state.ledger.cfOtherOpOut + n);
  }
  if (kind === 'capex') state.ledger.cfCapex = roundMoney(state.ledger.cfCapex + n);
  if (kind === 'repay') state.ledger.cfRepay = roundMoney(state.ledger.cfRepay + n);
  if (kind === 'finance') {
    state.ledger.finance = roundMoney(state.ledger.finance + n);
    state.ledger.cfInterest = roundMoney(state.ledger.cfInterest + n);
  }
}

function accrueRoleWages(state: GameState, role: Role, amount: number): void {
  const n = roundMoney(amount);
  if (n <= 0) return;
  if (!state.wagesAccruedByRole) state.wagesAccruedByRole = emptyWageAccrual();
  state.wagesPayable = roundMoney(state.wagesPayable + n);
  state.wagesAccruedThisMonth = roundMoney(state.wagesAccruedThisMonth + n);
  state.wagesAccruedByRole[role] = roundMoney((state.wagesAccruedByRole[role] ?? 0) + n);
  if (role === 'production') {
    state.wip = roundMoney((state.wip ?? 0) + n);
  } else if (role === 'sales') {
    state.ledger.selling = roundMoney((state.ledger.selling ?? 0) + n);
  } else if (role === 'rd') {
    state.ledger.rd = roundMoney((state.ledger.rd ?? 0) + n);
  } else {
    state.ledger.admin = roundMoney(state.ledger.admin + n);
  }
}

function syncMonthWages(state: GameState): number {
  if (!state.wagesAccruedByRole) state.wagesAccruedByRole = emptyWageAccrual();
  (['production', 'management', 'sales', 'rd', 'procurement'] as Role[]).forEach((role) => {
    const need = roundMoney((state.staff[role] ?? 0) * SALARY[role]);
    accrueRoleWages(state, role, roundMoney(need - (state.wagesAccruedByRole[role] ?? 0)));
  });
  return roundMoney(monthlySalary(state.staff));
}

function payAccruedWages(state: GameState, amount: number): void {
  const n = roundMoney(Math.min(amount, state.wagesPayable));
  if (n <= 0) return;
  state.cash = roundMoney(state.cash - n);
  state.wagesPayable = roundMoney(state.wagesPayable - n);
  state.ledger.cfEmployees = roundMoney(state.ledger.cfEmployees + n);
}

function receive(state: GameState, amount: number, kind: 'sales' | 'extra' | 'borrow'): void {
  const n = roundMoney(amount);
  if (n <= 0) return;
  state.cash = roundMoney(state.cash + n);
  if (kind === 'sales') {
    state.ledger.revenue = roundMoney(state.ledger.revenue + n);
    state.ledger.cfSales = roundMoney(state.ledger.cfSales + n);
  }
  if (kind === 'extra') {
    state.ledger.extraIncome = roundMoney(state.ledger.extraIncome + n);
    state.ledger.cfOtherOpIn = roundMoney(state.ledger.cfOtherOpIn + n);
  }
  if (kind === 'borrow') {
    addLoan(state, n);
    state.ledger.cfBorrow = roundMoney(state.ledger.cfBorrow + n);
    if (state.quarterStats) state.quarterStats.borrowed = true;
  }
  notePeakCash(state);
}

function unlockAchievement(state: GameState, id: string): void {
  if (state.achievements.includes(id)) return;
  const def = ACHIEVEMENTS.find((item) => item.id === id);
  if (!def) return;
  state.achievements = [...state.achievements, id];
  pushLog(state, `成就达成：${def.name}`);
}

export function booksForView(state: GameState): {
  prev: MonthBooks;
  curr: MonthBooks;
  older: MonthBooks | null;
  currClosed: boolean;
} {
  const settledThisMonth = state.lastReport?.month === state.month;
  const closed = state.closedBooks;
  const opening = state.openBooks;
  if (settledThisMonth) {
    const curr = closed[closed.length - 1] ?? snapshotBooks(state, MONTH_NAMES[state.month - 1] ?? '本月');
    const prev = closed[closed.length - 2] ?? opening;
    const older = closed[closed.length - 3] ?? (closed.length >= 2 ? opening : null);
    return { prev, curr, older, currClosed: true };
  }
  const curr = snapshotBooks(state, '本月');
  const prev = closed[closed.length - 1] ?? opening;
  const older = closed[closed.length - 2] ?? (closed.length >= 1 ? opening : null);
  return { prev, curr, older, currClosed: false };
}

export function checkAchievements(state: GameState): void {
  if (state.phase === 'title') return;
  if (state.debt > 0) state.everDebt = true;
  unlockAchievement(state, 'open');
  if (state.lastReport) unlockAchievement(state, 'firstSettle');
  if (state.hand.length > 0 || Boolean(state.quarterStats?.playedCard)) unlockAchievement(state, 'cards');
  if (totalStaff(state.staff) >= 6) unlockAchievement(state, 'hire6');
  if (state.machines >= 2) unlockAchievement(state, 'machine2');
  if (state.factories >= 2) unlockAchievement(state, 'factory2');
  if (state.staff.rd >= 1) unlockAchievement(state, 'rd1');
  if (state.unlockedProducts.length > 3) unlockAchievement(state, 'newProduct');
  if ((state.ownedIps ?? []).length > 0) unlockAchievement(state, 'patent');
  if (state.cash >= 50) unlockAchievement(state, 'cash500');
  if (netAssetsOf(state) >= 100) unlockAchievement(state, 'net1000');
  if (state.debt > 0) unlockAchievement(state, 'loan');
  if (state.everDebt && state.debt <= 0) unlockAchievement(state, 'debtFree');
  if (state.month >= 6) unlockAchievement(state, 'survive6');
  if (state.lastReport?.productName.includes('旗舰款')) unlockAchievement(state, 'premium');
}

function notePeakCash(state: GameState): void {
  if (!state.quarterStats) return;
  state.quarterStats.peakCash = Math.max(state.quarterStats.peakCash, state.cash);
}

function noteStockout(state: GameState): void {
  if (!state.quarterStats) return;
  if ((state.materials.a ?? 0) <= 0) state.quarterStats.stockoutA = true;
  if ((state.materials.b ?? 0) <= 0) state.quarterStats.stockoutB = true;
  if ((state.materials.a ?? 0) <= 0 && (state.materials.b ?? 0) <= 0) {
    state.quarterStats.stockoutAB = true;
  }
}

function settleQuarter(state: GameState, quarter: 1 | 2 | 3 | 4): void {
  if (state.boardHistory.some((item) => item.quarter === quarter)) return;
  const basic = currentBasicGoal(state);
  const basicOk = basic.reached(state);
  const challengeHits = (state.challengeGoalIds ?? []).filter((id) => goalById(id).reached(state));
  const points = (basicOk ? 0 : -BASIC_PENALTY) + challengeHits.length * CHALLENGE_POINTS;
  const challengeLines = (state.challengeGoalIds ?? []).map((id) => {
    const goal = goalById(id);
    return challengeHits.includes(id) ? `挑战目标「${goal.name}」已兑现。` : `挑战目标「${goal.name}」未兑现。`;
  });
  const minutes = [
    `${QUARTER_LABEL[quarter]}考核：`,
    basicOk ? `基本目标「${basic.name}」达成。` : `基本目标「${basic.name}」未达成，扣 ${BASIC_PENALTY} 分。`,
    ...challengeLines,
    `本季董事会计分 ${points} 分。`,
  ].join('');
  state.boardHistory = [
    ...state.boardHistory,
    {
      quarter,
      climateId: state.climateId,
      basicId: basic.id,
      basicOk,
      challengeIds: [...(state.challengeGoalIds ?? [])],
      challengeHits,
      minutes,
      points,
    },
  ];
  state.boardMinutes = minutes;
  pushLog(state, minutes);
}

function beginQuarter(state: GameState, quarter: 1 | 2 | 3 | 4): void {
  if (quarter > 1) settleQuarter(state, (quarter - 1) as 1 | 2 | 3 | 4);
  state.quarter = quarter;
  const unused = CLIMATES.filter((item) => !state.usedClimateIds.includes(item.id));
  const pool = unused.length > 0 ? unused : CLIMATES;
  const climate = pick(pool);
  state.climateId = climate.id;
  state.usedClimateIds = [...state.usedClimateIds, climate.id];
  state.marketTrend = dealMarketTrend(climate.id, state.unlockedProducts, state.materialDUnlocked, catalogOf(state));
  state.basicGoalId = dealBasicGoal(quarter, climate.id).id;
  state.challengePoolIds = dealChallengePool(quarter, climate.id).map((goal) => goal.id);
  state.challengeGoalIds = [];
  state.challengeDraft = [];
  state.quarterStats = emptyQuarterStats(totalStaff(state.staff), state.debt, state.cash, state.machines);
  state.quarterStats.peakCash = Math.max(0, state.cash);
  state.quarterEventTones = [];
  state.quarterSpotBonus = {};
  state.shop = [];
  state.cardsBoughtThisMonth = 0;
  state.phase = 'board';
  pushLog(state, `${QUARTER_LABEL[quarter]}行情定调：${marketTrendLog(state)}`);
}

function emptyWageAccrual(): Record<Role, number> {
  return { production: 0, management: 0, sales: 0, rd: 0, procurement: 0 };
}

function openingMaterialCost(materials: Materials): Materials {
  const cost = { a: 0, b: 0, c: 0, d: 0 };
  for (const item of MATERIALS) {
    cost[item.id] = roundMoney(materials[item.id] * item.basePrice);
  }
  return cost;
}

function emptyMaterialLayers(): Record<MaterialId, StockLayer[]> {
  return { a: [], b: [], c: [], d: [] };
}

function openingMaterialLayers(materials: Materials): Record<MaterialId, StockLayer[]> {
  const layers = emptyMaterialLayers();
  for (const item of MATERIALS) {
    const qty = materials[item.id];
    if (qty > 0) {
      layers[item.id] = [{ qty, cost: roundMoney(qty * item.basePrice), receivedMonth: 1 }];
    }
  }
  return layers;
}

function compactLayers(layers: StockLayer[]): StockLayer[] {
  const merged: StockLayer[] = [];
  for (const layer of layers) {
    if (layer.qty <= 0 || layer.cost <= 0) continue;
    const last = merged[merged.length - 1];
    if (last && last.receivedMonth === layer.receivedMonth) {
      last.qty += layer.qty;
      last.cost = roundMoney(last.cost + layer.cost);
    } else {
      merged.push({ ...layer });
    }
  }
  return merged;
}

function takeFromLayers(layers: StockLayer[], qty: number): { qty: number; cost: number; layers: StockLayer[] } {
  let need = qty;
  let cost = 0;
  const next: StockLayer[] = [];
  for (const layer of layers) {
    if (need <= 0) {
      next.push(layer);
      continue;
    }
    const take = Math.min(layer.qty, need);
    const takeCost = layer.qty > 0 ? roundMoney(layer.cost * (take / layer.qty)) : 0;
    cost = roundMoney(cost + takeCost);
    need -= take;
    const remainQty = layer.qty - take;
    if (remainQty > 0) next.push({ ...layer, qty: remainQty, cost: roundMoney(layer.cost - takeCost) });
  }
  return { qty: roundMoney(qty - need), cost: roundMoney(cost), layers: compactLayers(next) };
}

function addLayer(layers: StockLayer[] | undefined, qty: number, cost: number, month: number): StockLayer[] {
  if (qty <= 0 || cost <= 0) return compactLayers(layers ?? []);
  return compactLayers([...(layers ?? []), { qty, cost: roundMoney(cost), receivedMonth: month }]);
}

function syncMaterialBooks(state: GameState): void {
  if (!state.materialLayers) state.materialLayers = emptyMaterialLayers();
  for (const id of MATERIAL_IDS) {
    const layers = state.materialLayers[id] ?? [];
    state.materials[id] = layers.reduce((sum, layer) => sum + layer.qty, 0);
    state.materialCost[id] = roundMoney(layers.reduce((sum, layer) => sum + layer.cost, 0));
  }
}

function syncFinishedBooks(state: GameState): void {
  if (!state.finishedLayers) state.finishedLayers = {};
  const finished: Partial<Record<ProductId, number>> = {};
  const finishedCost: Partial<Record<ProductId, number>> = {};
  (Object.keys(state.finishedLayers) as ProductId[]).forEach((id) => {
    const layers = compactLayers(state.finishedLayers[id] ?? []);
    state.finishedLayers[id] = layers;
    const qty = layers.reduce((sum, layer) => sum + layer.qty, 0);
    const cost = roundMoney(layers.reduce((sum, layer) => sum + layer.cost, 0));
    if (qty > 0) {
      finished[id] = qty;
      finishedCost[id] = cost;
    }
  });
  state.finished = finished;
  state.finishedCost = finishedCost;
}

function layerAge(layer: StockLayer, month: number, bias = 0): number {
  return Math.max(0, month - layer.receivedMonth + bias);
}

export function materialMaxAge(state: GameState, id: MaterialId): number {
  const layers = state.materialLayers?.[id] ?? [];
  if (!layers.length) return 0;
  return Math.max(...layers.map((layer) => layerAge(layer, state.month, state.modifiers?.stockAgeBias ?? 0)));
}

export function finishedMaxAge(state: GameState, id: ProductId): number {
  const layers = state.finishedLayers?.[id] ?? [];
  if (!layers.length) return 0;
  return Math.max(...layers.map((layer) => layerAge(layer, state.month, state.modifiers?.stockAgeBias ?? 0)));
}

export function materialProvisionOf(state: GameState, id: MaterialId): number {
  const bias = state.modifiers?.stockAgeBias ?? 0;
  return roundMoney(
    (state.materialLayers?.[id] ?? []).reduce(
      (sum, layer) => sum + layer.cost * inventoryWriteDownRate(layerAge(layer, state.month, bias)),
      0,
    ),
  );
}

export function finishedProvisionOf(state: GameState, id: ProductId): number {
  const bias = state.modifiers?.stockAgeBias ?? 0;
  return roundMoney(
    (state.finishedLayers?.[id] ?? []).reduce(
      (sum, layer) => sum + layer.cost * inventoryWriteDownRate(layerAge(layer, state.month, bias)),
      0,
    ),
  );
}

function targetInventoryProvision(state: GameState): number {
  let total = 0;
  for (const id of MATERIAL_IDS) total = roundMoney(total + materialProvisionOf(state, id));
  (Object.keys(state.finishedLayers ?? {}) as ProductId[]).forEach((id) => {
    total = roundMoney(total + finishedProvisionOf(state, id));
  });
  return total;
}

function remeasureInventoryProvision(state: GameState): number {
  const target = targetInventoryProvision(state);
  const delta = roundMoney(target - (state.inventoryProvision ?? 0));
  state.inventoryProvision = target;
  if (delta !== 0) state.ledger.assetImpairment = roundMoney((state.ledger.assetImpairment ?? 0) + delta);
  return delta;
}

export function creditSaleRateOf(state: GameState): number {
  if ((state.modifiers?.creditSaleRate ?? 0) > 0) return Math.min(1, state.modifiers.creditSaleRate);
  const n = state.staff.sales ?? 0;
  if (n >= 4) return SALES_CREDIT_4;
  if (n >= 3) return SALES_CREDIT_3;
  return CREDIT_SALE_RATE;
}

function arTermOf(state: GameState): number {
  return AR_TERM_MONTHS + (state.modifiers?.arTermExtra ?? 0);
}

function overdueAmount(state: GameState): number {
  return roundMoney(
    (state.receivables ?? []).reduce(
      (sum, lot) => (lot.overdue || state.month - lot.dueMonth >= 1 ? sum + lot.amount : sum),
      0,
    ),
  );
}

export function arOverdueOf(state: GameState): number {
  return overdueAmount(state);
}

function targetBadDebtProvision(state: GameState): number {
  return roundMoney(
    (state.receivables ?? []).reduce((sum, lot) => {
      const past = state.month - lot.dueMonth;
      const overdue = Boolean(lot.overdue) || past >= 1;
      return sum + lot.amount * arCreditLossRate(past, overdue);
    }, 0),
  );
}

function remeasureBadDebt(state: GameState): number {
  const target = Math.min(targetBadDebtProvision(state), receivablesGross(state));
  const delta = roundMoney(target - (state.badDebtProvision ?? 0));
  state.badDebtProvision = target;
  if (delta > 0) state.ledger.creditImpairment = roundMoney((state.ledger.creditImpairment ?? 0) + delta);
  if (delta < 0) state.ledger.creditReversal = roundMoney((state.ledger.creditReversal ?? 0) - delta);
  return delta;
}

function chargeReceivableWriteOff(state: GameState, amount: number): void {
  const written = roundMoney(amount);
  if (written <= 0) return;
  const allowance = state.badDebtProvision ?? 0;
  const used = roundMoney(Math.min(allowance, written));
  state.badDebtProvision = roundMoney(allowance - used);
  const extra = roundMoney(written - used);
  if (extra > 0) state.ledger.creditImpairment = roundMoney((state.ledger.creditImpairment ?? 0) + extra);
}

export function collectReceivables(state: GameState, bonus = 0, dueAndOverdueOnly = true): number {
  if (!state.receivables) state.receivables = [];
  let collected = 0;
  const kept: ReceivableLot[] = [];
  const sales = state.staff.sales ?? 0;
  for (const lot of state.receivables) {
    const past = state.month - lot.dueMonth;
    if (lot.overdue || past >= 1) lot.overdue = true;
    if (dueAndOverdueOnly && past < 0 && !lot.overdue) {
      kept.push(lot);
      continue;
    }
    let rate = 0;
    if (lot.overdue) {
      rate = past <= 0 ? 0 : arRecoveryRate(past, sales);
      if (bonus > 0 && past >= 1) rate = Math.min(1, rate + bonus);
    } else if (past === 0) {
      if (bonus >= 1 || Math.random() >= AR_OVERDUE_CHANCE) {
        rate = 1;
      } else {
        lot.overdue = true;
        noteDept(state, 'finance', `应收账款 ${money(lot.amount)} 整笔逾期，下月起催收`);
        rate = 0;
      }
    }
    rate = Math.min(1, Math.max(0, rate));
    const take = roundMoney(lot.amount * rate);
    if (take > 0) {
      state.cash = roundMoney(state.cash + take);
      state.ledger.cfSales = roundMoney(state.ledger.cfSales + take);
      lot.amount = roundMoney(lot.amount - take);
      collected = roundMoney(collected + take);
      notePeakCash(state);
    }
    if (lot.amount > 0.05) kept.push(lot);
  }
  state.receivables = kept;
  return collected;
}

function writeOffAgedReceivables(state: GameState): number {
  if (!state.receivables) state.receivables = [];
  let written = 0;
  const kept: ReceivableLot[] = [];
  for (const lot of state.receivables) {
    const past = state.month - lot.dueMonth;
    if ((lot.overdue || past >= 1) && past >= AR_WRITEOFF_PAST_DUE) {
      written = roundMoney(written + lot.amount);
    } else {
      kept.push(lot);
    }
  }
  state.receivables = kept;
  if (written > 0) {
    chargeReceivableWriteOff(state, written);
    noteDept(state, 'finance', `逾期应收 ${money(written)} 已核销`);
  }
  return written;
}

function recognizeSale(state: GameState, revenue: number): { cash: number; credit: number } {
  const rate = creditSaleRateOf(state);
  const credit = roundMoney(revenue * rate);
  const cash = roundMoney(revenue - credit);
  state.ledger.revenue = roundMoney(state.ledger.revenue + revenue);
  if (cash > 0) {
    state.cash = roundMoney(state.cash + cash);
    state.ledger.cfSales = roundMoney(state.ledger.cfSales + cash);
    notePeakCash(state);
  }
  if (credit > 0) {
    if (!state.receivables) state.receivables = [];
    state.receivables.push({
      amount: credit,
      originMonth: state.month,
      dueMonth: state.month + arTermOf(state),
    });
  }
  return { cash, credit };
}

function ensureImpairmentState(state: GameState): void {
  if (!state.materialLayers) {
    state.materialLayers = emptyMaterialLayers();
    for (const id of MATERIAL_IDS) {
      const qty = state.materials[id] ?? 0;
      const cost = state.materialCost?.[id] ?? 0;
      if (qty > 0) state.materialLayers[id] = [{ qty, cost, receivedMonth: state.month }];
    }
  }
  if (!state.finishedLayers) {
    state.finishedLayers = {};
    (Object.keys(state.finished ?? {}) as ProductId[]).forEach((id) => {
      const qty = state.finished[id] ?? 0;
      const cost = state.finishedCost?.[id] ?? 0;
      if (qty > 0) state.finishedLayers[id] = [{ qty, cost, receivedMonth: state.month }];
    });
  }
  if (!state.receivables) state.receivables = [];
  ensureLoans(state);
  if (typeof state.inventoryProvision !== 'number') state.inventoryProvision = 0;
  if (typeof state.badDebtProvision !== 'number') state.badDebtProvision = 0;
  if (typeof state.ledger.creditReversal !== 'number') state.ledger.creditReversal = 0;
  if (typeof state.ledger.creditImpairment !== 'number') state.ledger.creditImpairment = 0;
  if (!state.modifiers) state.modifiers = emptyModifiers();
  if (typeof state.modifiers.collectionBonus !== 'number') state.modifiers.collectionBonus = 0;
  if (typeof state.modifiers.creditSaleRate !== 'number') state.modifiers.creditSaleRate = 0;
  if (typeof state.modifiers.arTermExtra !== 'number') state.modifiers.arTermExtra = 0;
  if (typeof state.modifiers.stockAgeBias !== 'number') state.modifiers.stockAgeBias = 0;
}

function avgMaterialCost(state: GameState, id: MaterialId): number {
  const qty = state.materials[id] ?? 0;
  if (qty <= 0) return 0;
  return (state.materialCost[id] ?? 0) / qty;
}

function takeMaterialCost(state: GameState, id: MaterialId, qty: number): { qty: number; cost: number } {
  ensureImpairmentState(state);
  const taken = takeFromLayers(state.materialLayers[id] ?? [], qty);
  state.materialLayers[id] = taken.layers;
  syncMaterialBooks(state);
  noteStockout(state);
  return { qty: taken.qty, cost: taken.cost };
}

function writeOffInventoryLoss(state: GameState, cost: number): void {
  const n = roundMoney(cost);
  if (n <= 0) return;
  state.ledger.extraExpense = roundMoney((state.ledger.extraExpense ?? 0) + n);
}

function spendAp(state: GameState, n = 1): boolean {
  if (state.ap < n) return false;
  state.ap -= n;
  return true;
}

function nextUid(state: GameState): string {
  state.uidSeq += 1;
  return `c${state.uidSeq}`;
}

function rollMarket(state: GameState): void {
  ensureMarketTrend(state);
  snapshotQuotedPrices(state);
  for (const mat of MATERIALS) {
    if (mat.id === 'd' && !state.materialDUnlocked) {
      state.materialPrices.d = mat.basePrice;
      continue;
    }
    moveMaterialPrice(state, mat.id, trendStep(state.marketTrend.materials[mat.id] ?? 0));
  }
  for (const product of unlockedCatalog(state)) {
    moveProductPrice(state, product.id, trendStep(state.marketTrend.products[product.id] ?? 0));
  }
  applyCostPassThrough(state);
}

function bomCostAtPrices(bom: Bom, prices: Partial<Record<MaterialId, number>>): number {
  let cost = 0;
  for (const key of MATERIAL_IDS) {
    cost += (bom[key] ?? 0) * (prices[key] ?? 0);
  }
  return roundPrice(cost);
}

function applyCostPassThrough(state: GameState): void {
  const rate = passThroughRateOf(state);
  const delta: Partial<Record<ProductId, number>> = {};
  if (rate > 0) {
    for (const product of unlockedCatalog(state)) {
      const before = bomCostAtPrices(product.bom, state.prevMaterialPrices ?? {});
      const after = bomSpotCost(state, product.bom);
      const dCost = roundMoney(after - before);
      if (dCost <= 0) continue;
      const bump = roundMoney(dCost * rate);
      if (bump <= 0) continue;
      const current = state.productPrices[product.id] ?? product.basePrice;
      state.productPrices[product.id] = boundProductPrice(state, product.id, current + bump);
      delta[product.id] = bump;
    }
  }
  state.passThroughDelta = delta;
}

function rollSpotQty(id: MaterialId, state: GameState): number {
  if (id === 'd' && !state.materialDUnlocked) return 0;
  const climatePool = climateSpotPool(state.climateId, id);
  const trend = state.marketTrend?.materials[id] ?? 0;
  let pool = climatePool;
  if (!pool) {
    if (id === 'a') pool = [8, 10, 12, 16];
    else if (id === 'b') pool = [6, 8, 10, 12];
    else if (id === 'c') pool = [2, 3, 4];
    else pool = [1, 2];
  }
  let qty = pick(pool);
  if (trend > 0) qty -= id === 'c' || id === 'd' ? 1 : 4;
  if (trend < 0) qty += id === 'c' || id === 'd' ? 1 : 4;
  if (id === 'a' || id === 'b') return clamp(qty, 4, 24);
  if (id === 'c') return clamp(qty, 0, 6);
  return clamp(qty, 0, 3);
}

function rollMaterialSpot(state: GameState): void {
  const next = emptySpot();
  for (const id of MATERIAL_IDS) next[id] = rollSpotQty(id, state);
  state.materialSpot = next;
  applySpotGrowth(state);
  rollTraderSpot(state);
}

function adjustSpot(state: GameState, id: MaterialId, delta: number): number {
  if (!state.materialSpot) state.materialSpot = emptySpot();
  state.materialSpot[id] = Math.max(0, (state.materialSpot[id] ?? 0) + delta);
  return state.materialSpot[id];
}

function eventEligible(state: GameState, event: EventDef): boolean {
  if (event.minMonth && state.month < event.minMonth) return false;
  const climateIds = event.climateIds ?? (event.channelOnly ? ['channel'] : undefined);
  if (climateIds?.length && !climateIds.includes(state.climateId)) return false;
  for (const req of event.requires ?? []) {
    if (req === 'receivables' && !(state.receivables ?? []).length) return false;
    if (req === 'rdStaff' && state.staff.rd <= 0) return false;
    if (req === 'finished' && Object.values(state.finished ?? {}).every((qty) => !qty)) return false;
    if (req === 'debt' && state.debt <= 0) return false;
  }
  return true;
}

function poolForTone(state: GameState, tone: EventTone, unusedOnly: boolean): EventDef[] {
  return EVENTS.filter(
    (event) =>
      event.tone === tone &&
      (!unusedOnly || !state.usedEventIds.includes(event.id)) &&
      eventEligible(state, event),
  );
}

export function eligibleEventsForTone(state: GameState, tone: EventTone): EventDef[] {
  const unused = poolForTone(state, tone, true);
  if (unused.length) return unused;
  return poolForTone(state, tone, false);
}

export function eventToneWeights(state: GameState): Record<EventTone, number> {
  return eventToneWeightsFor(state.eventGoodStreak ?? 0, state.difficulty ?? DEFAULT_DIFFICULTY);
}

function pickEvent(state: GameState): string {
  const weights = eventToneWeights(state);
  const tones: EventTone[] = ['good', 'bad', 'mixed'];
  const live = tones.filter((tone) => eligibleEventsForTone(state, tone).length > 0);
  const source = live.length ? live : tones;
  const tickets = source.flatMap((tone) => {
    const n = Math.max(1, Math.round(Math.max(0, weights[tone]) * 20));
    return Array.from({ length: n }, () => tone);
  });
  const tone = pick(tickets);
  const pool = eligibleEventsForTone(state, tone);
  const fallback = EVENTS.filter((event) => eventEligible(state, event));
  const use = pool.length ? pool : fallback.length ? fallback : [...EVENTS];
  const recent = state.recentEventFamilies ?? [];
  const fresh = use.filter((event) => !recent.includes(event.family));
  const pickFrom = fresh.length ? fresh : use;
  const flavored = new Set(climateById(state.climateId).eventIds ?? []);
  const ids = pickFrom.flatMap((event) => Array.from({ length: flavored.has(event.id) ? 2 : 1 }, () => event.id));
  return pick(ids);
}

function grantMaterial(state: GameState, id: MaterialId, qty: number): number {
  if (qty <= 0) return 0;
  const cost = roundMoney(Math.max(0.1, (state.materialPrices[id] ?? 0) * qty));
  state.materialLayers[id] = addLayer(state.materialLayers[id], qty, cost, state.month);
  syncMaterialBooks(state);
  return qty;
}

function takeMaterial(state: GameState, id: MaterialId, qty: number): number {
  const lost = takeMaterialCost(state, id, qty);
  writeOffInventoryLoss(state, lost.cost);
  remeasureInventoryProvision(state);
  return lost.qty;
}

function prepareMonth(state: GameState): void {
  state.modifiers = emptyModifiers();
  applyClimateModifiers(state);
  state.shop = [];
  state.cardsBoughtThisMonth = 0;
  state.overtimeUsedThisMonth = false;
  state.selectedProduct = null;
  state.pendingDeal = null;
  state.monthOrders = [];
  state.acceptedOrderIds = [];
  state.extraProduce = {};
  state.ledger = emptyLedger();
  state.deptActs = emptyDeptActs();
  state.wagesAccruedThisMonth = 0;
  state.wagesAccruedByRole = emptyWageAccrual();
  state.ledger.openingCash = state.cash;
  state.depreciableMachineGross = state.machineGross ?? 0;
  state.depreciableFactoryGross = state.factoryGross ?? 0;
  state.maxAp = maxApFor(state.staff);
  state.ap = state.maxAp;
  rollMarket(state);
  rollMaterialSpot(state);
  dealMonthProposals(state);
  state.eventId = pickEvent(state);
  state.eventNote = null;
  state.phase = 'briefing';
}

function consumeBom(state: GameState, id: ProductId, count: number): number {
  const need = unitsNeeded(state, id, count);
  let cost = 0;
  for (const key of MATERIAL_IDS) {
    const qty = need[key] ?? 0;
    if (qty <= 0) continue;
    const lost = takeMaterialCost(state, key, qty);
    cost = roundMoney(cost + lost.cost);
  }
  return cost;
}

function accrueDepreciation(state: GameState): { total: number; machine: number; factory: number } {
  const machineNbv = Math.max(0, (state.machineGross ?? 0) - (state.accumDepMachines ?? 0));
  const factoryNbv = Math.max(0, (state.factoryGross ?? 0) - (state.accumDepFactories ?? 0));
  const machineDep = roundMoney(Math.min((state.depreciableMachineGross ?? 0) / MACHINE_LIFE_MONTHS, machineNbv));
  const factoryDep = roundMoney(Math.min((state.depreciableFactoryGross ?? 0) / FACTORY_LIFE_MONTHS, factoryNbv));
  state.accumDepMachines = roundMoney((state.accumDepMachines ?? 0) + machineDep);
  state.accumDepFactories = roundMoney((state.accumDepFactories ?? 0) + factoryDep);
  return { total: roundMoney(machineDep + factoryDep), machine: machineDep, factory: factoryDep };
}

function chargeAdmin(state: GameState, amount: number): void {
  const n = roundMoney(amount);
  if (n <= 0) return;
  state.ledger.admin = roundMoney(state.ledger.admin + n);
}

function sellFinished(
  state: GameState,
  productId: ProductId,
  qty: number,
): { sold: number; leftover: number; cogs: number } {
  ensureImpairmentState(state);
  syncFinishedBooks(state);
  const sold = Math.min(state.finished[productId] ?? 0, Math.max(0, qty));
  const taken = takeFromLayers(state.finishedLayers[productId] ?? [], sold);
  state.finishedLayers[productId] = taken.layers;
  syncFinishedBooks(state);
  state.ledger.cogs = roundMoney(state.ledger.cogs + taken.cost);
  return { sold: taken.qty, leftover: state.finished[productId] ?? 0, cogs: taken.cost };
}

function settleIncomeTax(state: GameState): number {
  const tax = profitBeforeTaxOf(state.ledger) > 0 ? roundMoney(profitBeforeTaxOf(state.ledger) * INCOME_TAX_RATE) : 0;
  state.ledger.incomeTax = tax;
  const due = roundMoney(tax + (state.taxPayable ?? 0));
  const paid = roundMoney(Math.min(due, Math.max(0, state.cash)));
  if (paid > 0) pay(state, paid, 'incomeTax');
  state.taxPayable = roundMoney(due - paid);
  return paid;
}

function appropriateStatutoryReserve(state: GameState, netProfit: number): number {
  const current = equityAccounts(state);
  const oldRetained = roundMoney(current.retained - netProfit);
  const afterLoss = roundMoney(netProfit + Math.min(0, oldRetained));
  const raw = roundMoney(Math.max(0, afterLoss) * STATUTORY_RESERVE_RATE);
  const room = roundMoney(Math.max(0, (state.paidInCapital ?? 0) * STATUTORY_RESERVE_CAP - (state.surplusReserve ?? 0)));
  const add = roundMoney(Math.min(raw, room));
  state.surplusReserve = roundMoney((state.surplusReserve ?? 0) + add);
  return add;
}

function pnlSettlementLines(ledger: MonthLedger, reserve: number): SettlementLine[] {
  const lines: SettlementLine[] = [];
  const push = (label: string, value: number, tone?: 'good' | 'bad' | 'mute', always = false) => {
    if (!always && Math.abs(value) < 1e-6) return;
    lines.push({ label, value, tone });
  };
  push('营业收入', ledger.revenue, 'good');
  push('减：营业成本', -ledger.cogs, 'bad');
  push('减：税金及附加', -ledger.taxes, 'bad');
  push('减：销售费用', -ledger.selling, 'bad');
  push('减：管理费用', -ledger.admin, 'bad');
  push('减：研发费用', -(ledger.rd ?? 0), 'bad');
  push('减：财务费用', -ledger.finance, 'bad');
  push('减：信用减值损失', -(ledger.creditImpairment ?? 0), 'bad');
  push('加：坏账准备转回', ledger.creditReversal ?? 0, 'good');
  push('减：资产减值损失', -(ledger.assetImpairment ?? 0), (ledger.assetImpairment ?? 0) >= 0 ? 'bad' : 'good');
  push('营业利润', operatingProfitOf(ledger), operatingProfitOf(ledger) >= 0 ? 'good' : 'bad', true);
  push('加：营业外收入', ledger.extraIncome, 'good');
  push('减：营业外支出', -ledger.extraExpense, 'bad');
  push('利润总额', profitBeforeTaxOf(ledger), profitBeforeTaxOf(ledger) >= 0 ? 'good' : 'bad', true);
  push('减：所得税费用', -(ledger.incomeTax ?? 0), 'bad');
  push('净利润', netProfitOf(ledger), netProfitOf(ledger) >= 0 ? 'good' : 'bad', true);
  push('提取法定盈余公积', -reserve, 'mute');
  return lines;
}

function setRdProgress(state: GameState, track: RdTrack, value: number): void {
  if (track === 'product') state.rdProductProgress = Math.max(0, value);
  else state.rdTechProgress = Math.max(0, value);
}

function setRdFailBonus(state: GameState, track: RdTrack, value: number): void {
  if (track === 'product') state.rdProductFailBonus = value;
  else state.rdTechFailBonus = value;
}

function launchQtyOf(state: GameState, productId: ProductId): number {
  const def = productOf(state, productId);
  if (isVolumeProduct(def)) return LAUNCH_QTY_VOLUME;
  if (isPremiumProduct(def)) return LAUNCH_QTY_PREMIUM;
  return LAUNCH_QTY_STANDARD;
}

function grantLaunchOrders(state: GameState, productId: ProductId): void {
  const qty = launchQtyOf(state, productId);
  if (state.phase === 'actions') {
    addMarketOrder(state, productId, qty);
    return;
  }
  state.pendingLaunchOrders = [...(state.pendingLaunchOrders ?? []), { productId, qty }];
}

function climateTrendFor(state: GameState, def: ProductDef) {
  const climate = climateById(state.climateId);
  if (climate.productTrend[def.id] != null) return climate.productTrend[def.id] ?? 0;
  if (isVolumeProduct(def)) return climate.productTrend.basic ?? climate.productTrend.economy ?? 0;
  if (isPremiumProduct(def)) return climate.productTrend.premium ?? climate.productTrend.special ?? 0;
  return climate.productTrend.standard ?? 0;
}

function applyProductDef(state: GameState, def: ProductDef): void {
  if ((def.bom.d ?? 0) > 0 && !state.materialDUnlocked) {
    state.materialDUnlocked = true;
    ensureMarketTrend(state);
    state.marketTrend.materials.d = climateById(state.climateId).materialTrend.d ?? 0;
  }
  if (state.unlockedProducts.includes(def.id)) return;
  state.unlockedProducts.push(def.id);
  state.productPrices[def.id] = def.basePrice;
  state.prevProductPrices = { ...(state.prevProductPrices ?? {}), [def.id]: def.basePrice };
  ensureMarketTrend(state);
  state.marketTrend.products[def.id] = climateTrendFor(state, def);
  state.demand[def.id] = state.demand[def.id] ?? 0;
  grantLaunchOrders(state, def.id);
}

function rdProductName(state: GameState): string {
  const catalog = catalogOf(state);
  const usedNames = new Set(catalog.map((item) => item.name));
  const stems = RD_NAME_STEMS.filter((stem) => !usedNames.has(`${stem}款`));
  const stem = stems.length ? pick(stems) : `改型${(state.extraProducts?.length ?? 0) + 1}`;
  return stem.endsWith('款') ? stem : `${stem}款`;
}

function finishRdDraft(state: GameState, bom: Bom, price: number, blurb: string): ProductDef {
  const usesD = (bom.d ?? 0) > 0;
  const usesC = (bom.c ?? 0) > 0;
  let tier = '走量';
  let demand = 16 + Math.floor(Math.random() * 5);
  if (usesD || price >= 5) {
    tier = '高端';
    demand = 5 + Math.floor(Math.random() * 4);
  } else if (usesC || price >= 3) {
    tier = '普通';
    demand = 8 + Math.floor(Math.random() * 5);
  }
  const slot = (state.extraProducts?.length ?? 0) === 0 ? 'rd1' : 'rd2';
  return { id: slot, name: rdProductName(state), tier, bom, basePrice: price, baseDemand: demand, blurb };
}

function mutateSimplifyBom(parent: ProductDef): Bom {
  const bom: Bom = { ...parent.bom };
  if ((bom.d ?? 0) > 0) {
    delete bom.d;
    bom.a = (bom.a ?? 0) + 1;
  } else if ((bom.c ?? 0) > 0) {
    delete bom.c;
    const add = (bom.a ?? 0) >= (bom.b ?? 0) ? 'a' : 'b';
    bom[add] = (bom[add] ?? 0) + 1;
  } else {
    const key = (['a', 'b', 'c', 'd'] as MaterialId[])
      .filter((id) => (bom[id] ?? 0) > 0)
      .sort((a, b) => (bom[b] ?? 0) - (bom[a] ?? 0))[0];
    if (key && (bom[key] ?? 0) > 1) bom[key] = (bom[key] ?? 0) - 1;
    else if (key && (bom[key] ?? 0) === 1 && MATERIAL_IDS.reduce((sum, id) => sum + (bom[id] ?? 0), 0) > 1) {
      delete bom[key];
    }
  }
  const total = MATERIAL_IDS.reduce((sum, id) => sum + (bom[id] ?? 0), 0);
  if (total < 1) bom.a = 1;
  return bom;
}

function mutateSubstituteBom(parent: ProductDef): Bom {
  const bom: Bom = { ...parent.bom };
  const chips = bom.c ?? 0;
  if (chips <= 0) return mutateSimplifyBom(parent);
  delete bom.c;
  bom.a = (bom.a ?? 0) + chips;
  return bom;
}

export function rollRdProduct(state: GameState, archetype: RdProductArchetype = 'margin'): ProductDef {
  const catalog = catalogOf(state);
  const usedBoms = new Set(catalog.map((item) => bomKey(item.bom)));
  const parents = unlockedCatalog(state);
  const parent = parents.length ? pick(parents) : catalog[0]!;
  const parentMargin = listedGrossOf(state, parent.id);

  if (archetype === 'simplify' || archetype === 'substitute') {
    let source = parent;
    let bom = archetype === 'simplify' ? mutateSimplifyBom(source) : mutateSubstituteBom(source);
    for (let attempt = 0; attempt < 8 && usedBoms.has(bomKey(bom)); attempt += 1) {
      source = pick(parents);
      bom = archetype === 'simplify' ? mutateSimplifyBom(source) : mutateSubstituteBom(source);
    }
    if (usedBoms.has(bomKey(bom))) bom.a = (bom.a ?? 0) + 1;
    const cost = bomSpotCost(state, bom);
    const price = roundPrice(cost + parentMargin);
    const margin = roundMoney(price - cost);
    const tag = archetype === 'simplify' ? '简化结构' : '替代芯片';
    const blurb = `${tag}：相对${source.name}。BOM ${bomLabel(bom)}。立项毛利 ${money(margin)}/件，与亲本持平。`;
    return finishRdDraft(state, bom, price, blurb);
  }

  const allowD = state.materialDUnlocked || Math.random() < 0.35;
  const pool: MaterialId[] = allowD ? ['a', 'b', 'c', 'd'] : ['a', 'b', 'c'];
  let bom: Bom = { a: 2 };
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const next: Bom = {};
    const count = 1 + Math.floor(Math.random() * Math.min(3, pool.length));
    for (const id of shuffled(pool).slice(0, count)) {
      next[id] = 1 + Math.floor(Math.random() * 3);
    }
    const total = MATERIAL_IDS.reduce((sum, id) => sum + (next[id] ?? 0), 0);
    if (total < 2) continue;
    if (usedBoms.has(bomKey(next))) continue;
    bom = next;
    break;
  }
  const cost = bomSpotCost(state, bom);
  const floor = lowestUnlockedMargin(state);
  const bump = 0.1 + Math.floor(Math.random() * 4) * 0.1;
  const price = roundPrice(cost + floor + bump);
  const margin = roundMoney(price - cost);
  const blurb = `冲毛利。BOM ${bomLabel(bom)}。立项毛利 ${money(margin)}/件，高于现有最低档 ${money(floor)}。`;
  return finishRdDraft(state, bom, price, blurb);
}

function resolveRd(state: GameState, track: RdTrack): string {
  const staff = rdTrackStaff(state, track);
  const chance = rdTrackRate(state, track);
  const success = Math.random() < chance;
  setRdProgress(state, track, 0);
  if (track === 'product') {
    const draft = currentProductProject(state);
    if (!draft) return '量产课题已经做完。';
    if (success) {
      applyProductDef(state, draft);
      state.extraProducts = [...(state.extraProducts ?? []), draft];
      state.rdProductDraft = null;
      state.rdUnlockIndex += 1;
      setRdFailBonus(state, 'product', 0);
      const dNote = (draft.bom.d ?? 0) > 0 ? '特种合金开线。' : '';
      const body = `产品研发交付：${draft.name} 上市。${bomLabel(draft.bom)}。销售部接到首批新单。${dNote}`;
      const reveal: RdReveal = {
        track,
        success: true,
        title: `${draft.name} 已交付`,
        body,
        chance,
        staff,
      };
      state.pendingRdReveals = [...(state.pendingRdReveals ?? []), reveal];
      return body;
    }
    setRdFailBonus(state, 'product', RD_FAIL_BONUS);
      const body = `${draft.name} 没跑通，进度清零。若继续攻关，下次成功率 +${pctLabel(RD_FAIL_BONUS)}（3 人时可到 100%）。`;
    state.pendingRdReveals = [
      ...(state.pendingRdReveals ?? []),
      { track, success: false, title: `${draft.name} 未过关`, body, chance, staff },
    ];
    return body;
  }

  const ip = currentTechProject(state);
  if (!ip) return '工艺专利已经齐了。';
  if (success) {
    state.rdTechProjectId = null;
    setRdFailBonus(state, 'tech', 0);
    const active = state.ownedIps ?? [];
    if (active.length >= MAX_ACTIVE_IPS) {
      state.pendingIpReplace = ip.id;
      const body = `已掌握「${ip.name}」。${ip.effect}。同时只能生效 ${MAX_ACTIVE_IPS} 项工艺，请让出一项。`;
      state.pendingRdReveals = [
        ...(state.pendingRdReveals ?? []),
        { track, success: true, title: `掌握 ${ip.name}`, body, chance, staff },
      ];
      return body;
    }
    state.ownedIps = [...active, ip.id];
    state.rdIpIndex = state.ownedIps.length;
    const body = `知识产权入账：${ip.name}。${ip.effect}。同时最多 ${MAX_ACTIVE_IPS} 项生效，不资本化。`;
    state.pendingRdReveals = [
      ...(state.pendingRdReveals ?? []),
      { track, success: true, title: `掌握 ${ip.name}`, body, chance, staff },
    ];
    return body;
  }
  setRdFailBonus(state, 'tech', RD_FAIL_BONUS);
  const body = `${ip.name} 样件没过，进度清零。若继续攻关，下次成功率 +${pctLabel(RD_FAIL_BONUS)}（3 人时可到 100%）。`;
  state.pendingRdReveals = [
    ...(state.pendingRdReveals ?? []),
    { track, success: false, title: `${ip.name} 未过关`, body, chance, staff },
  ];
  return body;
}

function advanceRd(state: GameState, track: RdTrack, points: number): string | null {
  ensureRdState(state);
  if (points <= 0) return null;
  if (!rdHasProject(state, track)) {
    if (track === 'product') {
      const remain = MAX_RD_PRODUCTS - (state.extraProducts?.length ?? 0);
      return remain > 0 ? '产品实验室闲置，等待开题。' : '量产课题已经做完，团队在做工艺微调。';
    }
    return availableTechIps(state).length > 0
      ? '工艺实验室闲置，等待点选课题。'
      : '工艺专利已经齐了，团队在做持续改善。';
  }
  const cycle = rdCycleOf(track, rdTrackStaff(state, track));
  const next = rdTrackProgress(state, track) + points;
  setRdProgress(state, track, next);
  if (next < cycle) {
    const rate = rdTrackRate(state, track);
    const name =
      track === 'product' ? currentProductProject(state)?.name ?? '产品课题' : currentTechProject(state)?.name ?? '工艺课题';
    return `${RD_TRACK_LABEL[track]}推进 ${points} 个月，${name} 进度 ${next}/${cycle}，成功率 ${pctLabel(rate)}。`;
  }
  return resolveRd(state, track);
}

function pickLabRushTrack(state: GameState): RdTrack | null {
  const candidates: RdTrack[] = [];
  if (rdHasProject(state, 'product')) candidates.push('product');
  if (rdHasProject(state, 'tech')) candidates.push('tech');
  if (candidates.length === 0) return null;
  const scored = candidates.map((track) => {
    const cycle = rdCycleOf(track, rdTrackStaff(state, track));
    const progress = rdTrackProgress(state, track);
    const staff = rdTrackStaff(state, track);
    return { track, remain: cycle - progress, staff };
  });
  scored.sort((a, b) => {
    if (a.staff > 0 !== b.staff > 0) return a.staff > 0 ? -1 : 1;
    if (a.remain !== b.remain) return a.remain - b.remain;
    return a.track === 'product' ? -1 : 1;
  });
  return scored[0]?.track ?? null;
}

function applyRd(state: GameState): string | null {
  ensureRdState(state);
  const notes: string[] = [];
  if (rdTrackStaff(state, 'product') > 0) {
    const note = advanceRd(state, 'product', 1);
    if (note) notes.push(note);
  }
  if (rdTrackStaff(state, 'tech') > 0) {
    const note = advanceRd(state, 'tech', 1);
    if (note) notes.push(note);
  }
  return notes.length ? notes.join(' ') : null;
}

function suitWeight(state: GameState, suit: Role): number {
  return 1 + state.staff[suit] * 0.85;
}

function dealMonthProposals(state: GameState): void {
  const n = shopCountOf(state);
  state.shop = Array.from({ length: n }, () => rollCard(state));
}

export function isProposalReady(card: CardInstance, month: number): boolean {
  return (card.readyMonth ?? 0) <= month;
}

function rollCard(state: GameState): CardInstance {
  const weighted = CARDS.flatMap((card) => {
    const copies = Math.max(1, Math.round(suitWeight(state, card.suit) * 2));
    return Array.from({ length: copies }, () => card.id);
  });
  return { uid: nextUid(state), defId: pick(weighted), readyMonth: 0 };
}

function playCardEffect(state: GameState, defId: string, material?: MaterialId): string {
  switch (defId) {
    case 'overtime':
      state.modifiers.extraCapacity += 10;
      break;
    case 'kaizen':
      state.modifiers.extraCapacity += 5;
      state.modifiers.nextBuyDiscount = Math.max(state.modifiers.nextBuyDiscount, 0.1);
      break;
    case 'lean':
      state.ap += 1;
      state.maxAp += 1;
      break;
    case 'bulk':
      state.modifiers.nextBuyDiscount = Math.max(state.modifiers.nextBuyDiscount, 0.2);
      break;
    case 'client': {
      const order = addMarketOrder(state, volumeProductOf(state), 8);
      noteDept(state, 'sales', `大客户加单：${skuName(state, order.productId)} ${order.qty} 件`, false);
      return `渠道加了一张 ${skuName(state, order.productId)} ${order.qty} 件的市场单。`;
    }
    case 'premiumPush':
      state.modifiers.priceBonus += 0.2;
      break;
    case 'labRush': {
      ensureRdState(state);
      const track = pickLabRushTrack(state);
      if (!track) return '实验室已无课题可赶。';
      const note = advanceRd(state, track, 1);
      noteDept(state, 'rd', note ?? `实验室通宵：${RD_TRACK_LABEL[track]}进度 +1`, false);
      return note ?? cardById(defId).playText;
    }
    case 'bridge':
      receive(state, 5, 'borrow');
      break;
    case 'clearance': {
      ensureImpairmentState(state);
      const gross = finishedValue(state);
      if (gross <= 0) return '库里没有成品可清。';
      const cash = roundMoney(gross * 0.7);
      state.ledger.revenue = roundMoney(state.ledger.revenue + cash);
      state.cash = roundMoney(state.cash + cash);
      state.ledger.cfSales = roundMoney(state.ledger.cfSales + cash);
      state.ledger.cogs = roundMoney(state.ledger.cogs + gross);
      state.finishedLayers = {};
      syncFinishedBooks(state);
      remeasureInventoryProvision(state);
      notePeakCash(state);
      noteDept(state, 'store', `折价清库，成品按七折变现 ${money(cash)}`, false);
      return `成品账面 ${money(gross)} 按七折变现 ${money(cash)}，库龄清掉。`;
    }
    case 'collect': {
      ensureImpairmentState(state);
      const collected = collectReceivables(state, 1, true);
      remeasureBadDebt(state);
      if (collected <= 0) return '没有到期或逾期的应收账款可催。';
      noteDept(state, 'finance', `催收到账 ${money(collected)}`, false);
      return `催收到账 ${money(collected)}。`;
    }
    case 'creditPush': {
      state.modifiers.creditSaleRate = 1;
      state.modifiers.arTermExtra = Math.max(state.modifiers.arTermExtra, 1);
      const order = addMarketOrder(state, volumeProductOf(state), 6);
      noteDept(state, 'sales', `赊销铺货加单：${skuName(state, order.productId)} ${order.qty} 件`, false);
      return `加了一张 ${skuName(state, order.productId)} ${order.qty} 件的单，货款全赊、账期拉长。`;
    }
    case 'rushBuy': {
      const id = material;
      if (!id || (id === 'd' && !state.materialDUnlocked)) return '请选择一种本月能买的原料。';
      const add = rushSpotBonus(id);
      addSpot(state, id, add);
      noteDept(state, 'store', `紧急调货：${materialName(id)}现货 +${add}`, false);
      return `货代把一车${materialName(id)}抢了回来，本月现货 +${add}。`;
    }
    case 'secondSource': {
      const id = material;
      if (!id || (id === 'd' && !state.materialDUnlocked)) return '请选择一种本月能买的原料。';
      const add = seasonSpotBonus(id);
      if (!state.quarterSpotBonus) state.quarterSpotBonus = {};
      state.quarterSpotBonus[id] = (state.quarterSpotBonus[id] ?? 0) + add;
      addSpot(state, id, add);
      noteDept(state, 'store', `第二货源：${materialName(id)}本季现货生成 +${add}`, false);
      return `备用供应商备案完成，${materialName(id)}本季配额 +${add}。`;
    }
    case 'importChips': {
      addSpot(state, 'c', 3);
      noteDept(state, 'store', '进口到港：芯片现货 +3', false);
      return '报关单下来了，本月芯片现货 +3。';
    }
    default:
      break;
  }
  return cardById(defId).playText;
}

function applyEvent(state: GameState): void {
  const event = eventById(state.eventId!);
  const bits: string[] = [];
  const shock = rollShock(state.month);

  switch (event.id) {
    case 'steelSpike': {
      const mult = shockOf(shock, 1.3, 1.5, 1.7);
      const cut = shockOf(shock, 4, 6, 8);
      const before = state.materialPrices.a;
      state.materialPrices.a = boundMaterialPrice('a', before * mult);
      setMaterialTrend(state, 'a', 1);
      const lost = takeMaterial(state, 'a', cut);
      const left = adjustSpot(state, 'a', -cut);
      bits.push(`钢材报价上调 ${quotedPct(before, state.materialPrices.a)}%，现为 ${money(state.materialPrices.a)}/件`);
      bits.push(`本季钢材定调改为${trendWord(1)}`);
      bits.push(`本月钢材现货额度砍至 ${left}`);
      if (lost > 0) bits.push(`到货配额被砍，钢材库存 -${lost}`);
      break;
    }
    case 'plasticSpike': {
      const mult = shockOf(shock, 1.3, 1.5, 1.7);
      const cut = shockOf(shock, 3, 5, 7);
      const before = state.materialPrices.b;
      state.materialPrices.b = boundMaterialPrice('b', before * mult);
      setMaterialTrend(state, 'b', 1);
      const lost = takeMaterial(state, 'b', cut);
      const left = adjustSpot(state, 'b', -cut);
      bits.push(`塑料报价上调 ${quotedPct(before, state.materialPrices.b)}%，现为 ${money(state.materialPrices.b)}/件`);
      bits.push(`本季塑料定调改为${trendWord(1)}`);
      bits.push(`本月塑料现货额度砍至 ${left}`);
      if (lost > 0) bits.push(`到货配额被砍，塑料库存 -${lost}`);
      break;
    }
    case 'bigOrder': {
      const qty = shockOf(shock, 8, 12, 16);
      const penalty = shockOf(shock, 4, 6, 8);
      state.pendingDeal = {
        productId: 'basic',
        minSold: qty,
        penalty,
        okLog: '超市加单已按量交付。',
        failLog: `超市加单未能交齐，违约金 ${penalty} 万已扣。`,
      };
      bits.push(`合同单：基础款 ${qty} 件，交不出违约金 ${penalty} 万`);
      break;
    }
    case 'resign':
      if (state.staff.production > 0) {
        state.staff.production -= 1;
        bits.push('生产人员 -1，编制立刻空出一档');
      } else {
        state.modifiers.extraCapacity -= 4;
        bits.push('产线本就无人，本月产能再削 4');
      }
      break;
    case 'quality': {
      const fine = shockOf(shock, 2, 4, 6);
      const demandCut = shockOf(shock, 5, 8, 10);
      pay(state, fine, 'extra');
      ensureImpairmentState(state);
      const finishedLoss = finishedValue(state);
      writeOffInventoryLoss(state, finishedLoss);
      state.finished = {};
      state.finishedCost = {};
      state.finishedLayers = {};
      remeasureInventoryProvision(state);
      state.modifiers.extraDemand -= demandCut;
      bits.push(`罚款 ${fine} 万已划走`);
      bits.push('成品库存清零，本月订单收紧');
      break;
    }
    case 'dump': {
      const priceCut = shockOf(shock, 0.1, 0.15, 0.2);
      const demandCut = shockOf(shock, 5, 8, 12);
      moveAllProductPrices(state, -1);
      setAllProductTrends(state, -1);
      state.modifiers.priceBonus -= priceCut;
      state.modifiers.extraDemand -= demandCut;
      bits.push(`本月售价 -${Math.round(priceCut * 100)}%，订单收紧`);
      bits.push(`本季成品定调改为${trendWord(-1)}`);
      break;
    }
    case 'blackout': {
      const cut = shockOf(shock, 5, 8, 10);
      state.modifiers.extraCapacity -= cut;
      bits.push(`错峰限电，本月产能 -${cut}`);
      break;
    }
    case 'tax': {
      const amount = shockOf(shock, 3, 5, 7);
      pay(state, amount, 'tax');
      bits.push(`进项转出补税 ${amount} 万，现金已划走`);
      break;
    }
    case 'chipSqueeze': {
      const mult = shockOf(shock, 1.3, 1.5, 1.8);
      const cut = shockOf(shock, 1, 1, 2);
      const before = state.materialPrices.c;
      state.materialPrices.c = boundMaterialPrice('c', before * mult);
      setMaterialTrend(state, 'c', 1);
      const lost = takeMaterial(state, 'c', cut);
      const left = adjustSpot(state, 'c', -cut);
      bits.push(`芯片报价上调 ${quotedPct(before, state.materialPrices.c)}%，现为 ${money(state.materialPrices.c)}/件`);
      bits.push(`本季芯片定调改为${trendWord(1)}`);
      bits.push(`本月芯片现货额度砍至 ${left}`);
      if (lost > 0) bits.push(`配额被收，库存芯片 -${lost}`);
      break;
    }
    case 'machineDown': {
      const prepaid = shockOf(shock, 1, 2, 3);
      pay(state, prepaid, 'admin');
      state.modifiers.extraCapacity -= MACHINE_BASE_CAP;
      bits.push(`抢修预付 ${prepaid} 万，本月产能 -${MACHINE_BASE_CAP}（少一台设备）`);
      break;
    }
    case 'channelHold': {
      const reserve = shockOf(shock, 2, 3, 5);
      const demandCut = shockOf(shock, 4, 6, 8);
      pay(state, reserve, 'extra');
      state.modifiers.extraDemand -= demandCut;
      bits.push(`渠道准备金 ${reserve} 万已划走，本月订单收紧`);
      break;
    }
    case 'bankCall': {
      const call = shockOf(shock, 3, 4, 6);
      const fee = shockOf(shock, 2, 3, 4);
      if (state.debt > 0) {
        const amount = Math.min(call, state.debt, Math.max(0, state.cash));
        if (amount > 0) {
          pay(state, amount, 'repay');
          applyLoanRepay(state, amount);
          if (state.quarterStats) state.quarterStats.repaid = true;
          bits.push(`银行抽贷，强制收回 ${money(amount)}`);
        }
        if (state.debt > 0 && state.cash <= 0) {
          bits.push('账上现金不够扣回全部抽贷，剩余负债仍在');
        }
      } else {
        pay(state, fee, 'admin');
        bits.push(`授信审查评估费 ${fee} 万已划走`);
      }
      break;
    }
    case 'rushOrder': {
      const qty = shockOf(shock, 8, 12, 16);
      const penalty = shockOf(shock, 3, 5, 7);
      state.modifiers.priceBonus -= 0.1;
      state.pendingDeal = {
        productId: 'basic',
        minSold: qty,
        penalty,
        okLog: '经销商压货已按量交付。',
        failLog: `经销商压货未能交齐，违约金 ${penalty} 万已扣。`,
      };
      bits.push('售价 -10%');
      bits.push(`合同单：基础款 ${qty} 件，交不出违约金 ${penalty} 万`);
      break;
    }
    case 'rushStandard': {
      const qty = shockOf(shock, 2, 3, 4);
      const penalty = shockOf(shock, 3, 4, 6);
      state.pendingDeal = {
        productId: 'standard',
        minSold: qty,
        penalty,
        okLog: '标准款加急已按量交付。',
        failLog: `标准款加急未能交齐，违约金 ${penalty} 万已扣。`,
      };
      bits.push(`合同单：标准款 ${qty} 件，交不出违约金 ${penalty} 万`);
      break;
    }
    case 'poach':
      ensureRdState(state);
      if (state.staff.rd > 0) {
        if ((state.rdProductStaff ?? 0) >= (state.rdTechStaff ?? 0) && (state.rdProductStaff ?? 0) > 0) {
          state.rdProductStaff -= 1;
          bits.push('产品实验室被挖走 1 人');
        } else if ((state.rdTechStaff ?? 0) > 0) {
          state.rdTechStaff -= 1;
          bits.push('工艺实验室被挖走 1 人');
        }
        state.staff.rd = Math.max(0, (state.rdProductStaff ?? 0) + (state.rdTechStaff ?? 0));
      } else {
        if ((state.rdProductProgress ?? 0) > 0 || (state.rdTechProgress ?? 0) > 0) {
          if ((state.rdProductProgress ?? 0) >= (state.rdTechProgress ?? 0) && (state.rdProductProgress ?? 0) > 0) {
            state.rdProductProgress -= 1;
            bits.push('产品课题进度 -1');
          } else {
            state.rdTechProgress = Math.max(0, (state.rdTechProgress ?? 0) - 1);
            bits.push('工艺课题进度 -1');
          }
        }
        state.modifiers.extraCapacity -= 3;
        bits.push('工艺无人盯线，本月产能 -3');
      }
      break;
    case 'rebate': {
      const amount = shockOf(shock, 2, 3, 5);
      receive(state, amount, 'extra');
      bits.push(`出口退税 ${amount} 万到账`);
      break;
    }
    case 'stockAge': {
      ensureImpairmentState(state);
      const bump = (layers: StockLayer[]) =>
        layers.map((layer) => ({ ...layer, receivedMonth: layer.receivedMonth - 1 }));
      for (const id of MATERIAL_IDS) state.materialLayers[id] = bump(state.materialLayers[id] ?? []);
      (Object.keys(state.finishedLayers) as ProductId[]).forEach((id) => {
        state.finishedLayers[id] = bump(state.finishedLayers[id] ?? []);
      });
      const delta = remeasureInventoryProvision(state);
      bits.push(delta > 0 ? `库龄 +1 个月，补提存货跌价 ${money(delta)}` : '库龄 +1 个月，本月尚无需补提跌价');
      break;
    }
    case 'dampStock': {
      ensureImpairmentState(state);
      let touched = false;
      for (const id of MATERIAL_IDS) {
        state.materialLayers[id] = (state.materialLayers[id] ?? []).map((layer) => {
          if (layerAge(layer, state.month) < 1) return layer;
          touched = true;
          return { ...layer, receivedMonth: layer.receivedMonth - 2 };
        });
      }
      const delta = remeasureInventoryProvision(state);
      bits.push(
        touched
          ? `受潮原料库龄加快，存货跌价 ${delta > 0 ? money(delta) : '暂无新增'}`
          : '库龄均不足一个月，受潮尚未构成跌价',
      );
      break;
    }
    case 'arDelay': {
      ensureImpairmentState(state);
      if (!state.receivables.length) {
        bits.push('账上暂无应收账款可推迟');
        break;
      }
      state.receivables = state.receivables.map((lot) => ({ ...lot, dueMonth: lot.dueMonth + 1 }));
      const delta = remeasureBadDebt(state);
      bits.push(`全部应收到期日推迟 1 个月${delta > 0 ? `，信用减值 ${money(delta)}` : delta < 0 ? `，坏账准备转回 ${money(-delta)}` : ''}`);
      break;
    }
    case 'customerBreak': {
      ensureImpairmentState(state);
      if (!state.receivables.length) {
        bits.push('账上暂无应收账款可核销');
        break;
      }
      const overdue = state.receivables.filter((lot) => lot.overdue || state.month - lot.dueMonth >= 1);
      const pool = overdue.length ? overdue : state.receivables;
      const target = [...pool].sort((a, b) => b.amount - a.amount)[0]!;
      const write = overdue.length ? target.amount : roundMoney(target.amount * 0.5);
      target.amount = roundMoney(target.amount - write);
      chargeReceivableWriteOff(state, write);
      state.receivables = state.receivables.filter((lot) => lot.amount > 0.05);
      remeasureBadDebt(state);
      bits.push(`核销应收账款 ${money(write)}`);
      break;
    }
    case 'arRecover': {
      ensureImpairmentState(state);
      const due = state.receivables.filter((lot) => state.month - lot.dueMonth >= 0);
      if (!due.length) {
        bits.push('没有已到期应收可收回');
        break;
      }
      const target = [...due].sort((a, b) => b.amount - a.amount)[0]!;
      const take = target.amount;
      state.cash = roundMoney(state.cash + take);
      state.ledger.cfSales = roundMoney(state.ledger.cfSales + take);
      target.amount = 0;
      state.receivables = state.receivables.filter((lot) => lot.amount > 0.05);
      remeasureBadDebt(state);
      notePeakCash(state);
      bits.push(`陈欠收回 ${money(take)}`);
      break;
    }
    case 'talentIn':
      state.staff.production += 1;
      accrueRoleWages(state, 'production', SALARY.production);
      if (state.quarterStats) state.quarterStats.hired = (state.quarterStats.hired ?? 0) + 1;
      bits.push('校招入职 1 名生产人员，当月薪酬已计提');
      break;
    case 'govSubsidy': {
      const amount = shockOf(shock, 3, 4, 6);
      receive(state, amount, 'extra');
      bits.push(`稳岗补贴 ${amount} 万到账`);
      break;
    }
    case 'priceRally': {
      const bonus = shockOf(shock, 0.08, 0.1, 0.15);
      const demand = shockOf(shock, 4, 6, 8);
      moveAllProductPrices(state, 1);
      setAllProductTrends(state, 1);
      state.modifiers.priceBonus += bonus;
      state.modifiers.extraDemand += demand;
      bits.push(`本月售价 +${Math.round(bonus * 100)}%，订单放宽`);
      bits.push(`本季成品定调改为${trendWord(1)}`);
      break;
    }
    case 'chipAlloc': {
      const qty = shockOf(shock, 1, 2, 3);
      const extra = shockOf(shock, 1, 1, 2);
      const before = state.materialPrices.c;
      grantMaterial(state, 'c', qty);
      const left = adjustSpot(state, 'c', extra);
      moveMaterialPrice(state, 'c', -1);
      setMaterialTrend(state, 'c', -1);
      bits.push(`芯片配额到货 ${qty} 件，已按市价入库`);
      bits.push(`本月芯片现货额度 +${extra}，剩余 ${left}`);
      if (state.materialPrices.c !== before) {
        bits.push(`芯片报价落到 ${money(state.materialPrices.c)}/件`);
      }
      bits.push(`本季芯片定调改为${trendWord(-1)}`);
      break;
    }
    case 'vendorCredit':
      state.modifiers.nextBuyDiscount = Math.max(state.modifiers.nextBuyDiscount, 0.15);
      bits.push('下一次原料采购八五折');
      break;
    case 'inspectBonus': {
      const demand = shockOf(shock, 4, 6, 8);
      state.modifiers.extraDemand += demand;
      bits.push('抽检合格公示，本月订单放宽');
      break;
    }
    case 'wageAudit': {
      const amount = shockOf(shock, 2, 3, 5);
      pay(state, amount, 'admin');
      bits.push(`社保补缴 ${amount} 万，现金已划走`);
      break;
    }
    case 'logisticsJam': {
      const cap = shockOf(shock, 3, 5, 7);
      const demand = shockOf(shock, 3, 4, 6);
      state.modifiers.extraCapacity -= cap;
      state.modifiers.extraDemand -= demand;
      bits.push(`运力紧张，本月产能 -${cap}，订单收紧`);
      break;
    }
    case 'idleSeason': {
      const demand = shockOf(shock, 6, 10, 14);
      setAllProductTrends(state, -1);
      state.modifiers.extraDemand -= demand;
      bits.push('淡季空窗，本月订单明显收紧');
      bits.push(`本季成品定调改为${trendWord(-1)}`);
      break;
    }
    case 'moldWear': {
      const prepaid = shockOf(shock, 1, 2, 3);
      const cap = shockOf(shock, 3, 4, 6);
      pay(state, prepaid, 'admin');
      state.modifiers.extraCapacity -= cap;
      bits.push(`模具配件预付 ${prepaid} 万，本月产能 -${cap}`);
      break;
    }
    case 'salesLeave':
      if (state.staff.sales > 0) {
        state.staff.sales -= 1;
        bits.push('销售人员 -1');
      } else {
        state.modifiers.extraDemand -= 6;
        bits.push('销售岗本就空着，本月订单再收一档');
      }
      break;
    case 'utilityBill': {
      const amount = shockOf(shock, 1, 2, 3);
      pay(state, amount, 'admin');
      bits.push(`电费清算 ${amount} 万，现金已划走`);
      break;
    }
    case 'traderDump':
      addSpot(state, 'a', 8);
      addTrader(state, 'a', 4);
      bits.push(`本月钢材现货 +8，贸易商钢材 +4`);
      break;
    case 'plasticRestart': {
      const qty = grantMaterial(state, 'b', 4);
      addSpot(state, 'b', 4);
      bits.push(`塑料免费入库 ${qty} 件，本月塑料现货再 +4`);
      break;
    }
    case 'contractWindow':
      state.modifiers.contractApFree = true;
      state.modifiers.contractPrepayDiscount = 0.1;
      bits.push('本月签订长期协议不耗 AP，预付九折');
      break;
    case 'buyerLeave':
      if (procurementOf(state) > 0) {
        state.staff.procurement -= 1;
        bits.push('采购人员 -1');
      } else {
        addSpot(state, 'a', -4);
        addSpot(state, 'b', -4);
        addSpot(state, 'c', -1);
        bits.push('采购岗本就空着，本月现货各砍一档');
      }
      break;
    case 'nightShift': {
      const cap = shockOf(shock, 4, 5, 6);
      state.modifiers.extraCapacity += cap;
      bits.push(`夜班加开，本月产能 +${cap}`);
      break;
    }
    case 'steelAlloc': {
      const qty = grantMaterial(state, 'a', 4);
      addSpot(state, 'a', 4);
      bits.push(`钢材免费入库 ${qty} 件，本月钢材现货再 +4`);
      break;
    }
    case 'showLead': {
      const demand = shockOf(shock, 4, 6, 8);
      state.modifiers.extraDemand += demand;
      bits.push('展会带回意向，本月订单放宽');
      break;
    }
    case 'energyRebate': {
      const amount = shockOf(shock, 1, 1.5, 2);
      receive(state, amount, 'extra');
      bits.push(`电费返还 ${amount} 万到账`);
      break;
    }
    case 'yieldUp': {
      const cap = shockOf(shock, 3, 4, 5);
      state.modifiers.extraCapacity += cap;
      bits.push(`良率爬坡，本月产能 +${cap}`);
      break;
    }
    case 'channelPrepay': {
      const amount = shockOf(shock, 2, 3, 4);
      receive(state, amount, 'extra');
      bits.push(`渠道预付款 ${amount} 万到账`);
      break;
    }
    case 'spotThaw':
      addSpot(state, 'a', 4);
      addSpot(state, 'b', 4);
      addSpot(state, 'c', 1);
      bits.push('本月钢材现货 +4，塑料现货 +4，芯片现货 +1');
      break;
    case 'scrapSale': {
      const amount = shockOf(shock, 1, 1.5, 2);
      receive(state, amount, 'extra');
      bits.push(`边角料变现 ${amount} 万到账`);
      break;
    }
    case 'freightAid': {
      const cap = shockOf(shock, 2, 3, 4);
      const demand = shockOf(shock, 3, 4, 5);
      state.modifiers.extraCapacity += cap;
      state.modifiers.extraDemand += demand;
      bits.push(`物流补贴，本月产能 +${cap}，订单放宽`);
      break;
    }
    case 'paidOvertime': {
      const cap = shockOf(shock, 4, 5, 6);
      const fee = shockOf(shock, 1, 1.5, 2);
      pay(state, fee, 'admin');
      state.modifiers.extraCapacity += cap;
      bits.push(`加班赶工，本月产能 +${cap}，加班费 ${fee} 万已划走`);
      break;
    }
    case 'volumeDeal': {
      const cut = shockOf(shock, 0.05, 0.08, 0.1);
      const demand = shockOf(shock, 6, 8, 10);
      state.modifiers.priceBonus -= cut;
      state.modifiers.extraDemand += demand;
      bits.push(`以价换量，本月售价 -${Math.round(cut * 100)}%，订单放宽`);
      break;
    }
    case 'reworkSwap': {
      const cap = shockOf(shock, 2, 3, 4);
      const demand = shockOf(shock, 4, 6, 8);
      state.modifiers.extraCapacity -= cap;
      state.modifiers.extraDemand += demand;
      bits.push(`返工换单，本月产能 -${cap}，订单放宽`);
      break;
    }
    case 'rushSpot': {
      const fee = shockOf(shock, 1, 1.5, 2);
      pay(state, fee, 'extra');
      addSpot(state, 'a', 6);
      bits.push(`加急现货费 ${fee} 万已划走，本月钢材现货 +6`);
      break;
    }
    case 'sampleRun': {
      const cap = shockOf(shock, 2, 3, 4);
      const demand = shockOf(shock, 3, 4, 6);
      state.modifiers.extraCapacity -= cap;
      state.modifiers.extraDemand += demand;
      bits.push(`样品试产占线，本月产能 -${cap}，订单放宽`);
      break;
    }
    case 'cashCut': {
      const cut = shockOf(shock, 0.04, 0.05, 0.08);
      const demand = shockOf(shock, 4, 5, 6);
      state.modifiers.priceBonus -= cut;
      state.modifiers.extraDemand += demand;
      bits.push(`现款折扣，本月售价 -${Math.round(cut * 100)}%，订单放宽`);
      break;
    }
    case 'weekendShift': {
      const cap = shockOf(shock, 3, 4, 5);
      state.modifiers.extraCapacity += cap;
      accrueRoleWages(state, 'production', SALARY.production);
      bits.push(`周末连班，本月产能 +${cap}，加计生产薪酬 ${SALARY.production} 万`);
      break;
    }
    case 'bridgeIn': {
      const amount = shockOf(shock, 3, 4, 5);
      receive(state, amount, 'borrow');
      bits.push(`过桥资金 ${amount} 万到账，负债同步记上`);
      break;
    }
    case 'safetyDrill': {
      const cap = shockOf(shock, 2, 3, 4);
      state.modifiers.extraCapacity -= cap;
      bits.push(`安全演练占班，本月产能 -${cap}`);
      break;
    }
    case 'quoteHold': {
      const demand = shockOf(shock, 3, 4, 6);
      state.modifiers.extraDemand -= demand;
      bits.push('询盘观望，本月订单收紧');
      break;
    }
    default:
      bits.push(event.impact);
      break;
  }

  if (event.tone === 'good') state.eventGoodStreak = (state.eventGoodStreak ?? 0) + 1;
  else if (event.tone === 'bad') state.eventGoodStreak = 0;

  state.usedEventIds = [...state.usedEventIds, event.id].slice(-EVENTS.length);
  state.recentEventFamilies = [...(state.recentEventFamilies ?? []), event.family].slice(-2);
  state.quarterEventTones = [...(state.quarterEventTones ?? []), event.tone];
  state.maxAp = maxApFor(state.staff);
  const note = bits.join('。') + '。';
  state.eventNote = note;
  pushLog(state, `事件「${event.title}」已落地：${note}`);
}

export function createInitialState(): GameState {
  const materials = { a: 16, b: 8, c: 2, d: 0 };
  const state: GameState = {
    phase: 'title',
    month: 1,
    cash: STARTING_CASH,
    debt: 0,
    loans: [],
    wagesPayable: 0,
    wagesAccruedThisMonth: 0,
    wagesAccruedByRole: emptyWageAccrual(),
    taxPayable: 0,
    paidInCapital: 0,
    surplusReserve: 0,
    machineGross: MACHINE_COST,
    factoryGross: FACTORY_COST,
    accumDepMachines: 0,
    accumDepFactories: 0,
    depreciableMachineGross: MACHINE_COST,
    depreciableFactoryGross: FACTORY_COST,
    materialCost: openingMaterialCost(materials),
    finishedCost: {},
    materialLayers: openingMaterialLayers(materials),
    finishedLayers: {},
    inventoryProvision: 0,
    receivables: [],
    badDebtProvision: 0,
    wip: 0,
    ap: BASE_AP,
    maxAp: BASE_AP,
    factories: 1,
    slots: SLOTS_PER_FACTORY,
    machines: 1,
    staff: { production: 1, management: 0, sales: 0, rd: 0, procurement: 0 },
    materials,
    finished: {},
    materialPrices: { a: 0.4, b: 0.4, c: 1, d: 2 },
    productPrices: { basic: 1.5, standard: 4, premium: 6 },
    prevMaterialPrices: { a: 0.4, b: 0.4, c: 1, d: 2 },
    prevProductPrices: { basic: 1.5, standard: 4, premium: 6 },
    marketTrend: emptyMarketTrend(),
    materialSpot: { a: 0, b: 0, c: 0, d: 0 },
    traderSpot: { a: 0, b: 0, c: 0, d: 0 },
    prepaid: 0,
    supplyContract: null,
    supplyContracts: [],
    overtimeUsedThisMonth: false,
    passThroughDelta: {},
    quarterSpotBonus: {},
    demand: { basic: 20, standard: 10, premium: 5 },
    unlockedProducts: ['basic', 'standard', 'premium'],
    materialDUnlocked: false,
    rdProductStaff: 0,
    rdTechStaff: 0,
    rdProductProgress: 0,
    rdTechProgress: 0,
    rdUnlockIndex: 0,
    rdIpIndex: 0,
    rdTechProjectId: null,
    extraProducts: [],
    rdProductDraft: null,
    rdProductFailBonus: 0,
    rdTechFailBonus: 0,
    ownedIps: [],
    pendingRdReveals: [],
    pendingLaunchOrders: [],
    pendingIpReplace: null,
    shop: [],
    cardsBoughtThisMonth: 0,
    hand: [],
    modifiers: emptyModifiers(),
    eventId: null,
    eventNote: null,
    usedEventIds: [],
    difficulty: DEFAULT_DIFFICULTY,
    eventGoodStreak: 0,
    selectedProduct: null,
    monthOrders: [],
    acceptedOrderIds: [],
    extraProduce: {},
    lastReport: null,
    prevReport: null,
    log: ['北港制造开业。账上有启动资金，一台设备和一名工人，办公室要自己招。'],
    deptActs: emptyDeptActs(),
    endKind: null,
    uidSeq: 0,
    pendingDeal: null,
    ledger: emptyLedger(),
    openBooks: emptyBooks(),
    closedBooks: [],
    achievements: [],
    milestones: [],
    everDebt: false,
    quarter: 1,
    climateId: 'steel',
    basicGoalId: 'q1-net20',
    challengeGoalIds: [],
    challengeDraft: [],
    challengePoolIds: [],
    boardHistory: [],
    boardMinutes: null,
    quarterStats: emptyQuarterStats(1, 0, STARTING_CASH, 1),
    usedClimateIds: [],
    recentEventFamilies: [],
    quarterEventTones: [],
  };
  state.paidInCapital = netAssetsOf(state);
  state.maxAp = maxApFor(state.staff);
  state.ap = state.maxAp;
  return state;
}

function startGame(prev: GameState): GameState {
  const state = createInitialState();
  state.uidSeq = prev.uidSeq;
  state.ledger.openingCash = state.cash;
  state.openBooks = snapshotBooks(state, '开业');
  beginQuarter(state, 1);
  pushLog(state, '第一季度董事会召开。');
  checkAchievements(state);
  return state;
}

function purchaseMaterials(
  state: GameState,
  items: { material: MaterialId; qty: number; channel?: BuyChannel }[],
): GameState {
  const lines = items.filter((line) => line.qty > 0);
  if (lines.length === 0) return state;
  for (const line of lines) {
    if (line.material === 'd' && !state.materialDUnlocked) {
      pushLog(state, '特种合金尚未开线。');
      return state;
    }
  }
  if (!state.materialSpot) state.materialSpot = emptySpot();
  if (!state.traderSpot) state.traderSpot = emptySpot();
  const leftoverSpot = { ...state.materialSpot };
  const leftoverTrader = { ...state.traderSpot };
  const filled: { material: MaterialId; qty: number; asked: number; channel: BuyChannel }[] = [];
  for (const line of lines) {
    const channel = line.channel ?? 'spot';
    const pool = channel === 'trader' ? leftoverTrader : leftoverSpot;
    const qty = Math.min(line.qty, pool[line.material] ?? 0);
    if (qty <= 0) continue;
    pool[line.material] = (pool[line.material] ?? 0) - qty;
    filled.push({ material: line.material, qty, asked: line.qty, channel });
  }
  if (filled.length === 0) {
    pushLog(state, '本月现货不足，采购未成交。');
    return state;
  }
  const total = buyCartCost(state, filled);
  if (state.cash < total) {
    pushLog(state, '采购金额超过现金。');
    return state;
  }
  if (!q3ProcurementFree(state.month) && !spendAp(state)) {
    pushLog(state, '行动点不足。');
    return state;
  }
  const parts: string[] = [];
  let bought = 0;
  let usedSpotDiscount = false;
  for (const line of filled) {
    const cost = buyLineCost(state, line.material, line.qty, line.channel);
    pay(state, cost, 'buy');
    state.materialLayers[line.material] = addLayer(
      state.materialLayers[line.material],
      line.qty,
      cost,
      state.month,
    );
    if (line.channel === 'trader') state.traderSpot[line.material] = leftoverTrader[line.material] ?? 0;
    else {
      state.materialSpot[line.material] = leftoverSpot[line.material] ?? 0;
      usedSpotDiscount = true;
    }
    bought += line.qty;
    const tag = line.channel === 'trader' ? '贸易商' : '厂供';
    const short = line.qty < line.asked ? `（${tag}只够 ${line.qty} 件）` : '';
    parts.push(`${tag}${materialName(line.material)}${line.qty}件 ${money(cost)}${short}`);
  }
  if (state.quarterStats) {
    state.quarterStats.boughtQty = (state.quarterStats.boughtQty ?? 0) + bought;
  }
  syncMaterialBooks(state);
  const off = Math.round(factoryBuyDiscountOf(state) * 100);
  const apNote = q3ProcurementFree(state.month) ? '，本季采购不耗 AP' : '';
  const discNote = usedSpotDiscount && off > 0 ? `（厂供 ${100 - off}折）` : '';
  const buyNote = `采购 ${parts.join('，')}，合计 ${money(total)}${discNote}${apNote}`;
  noteDept(state, 'store', buyNote);
  if (usedSpotDiscount && state.modifiers.nextBuyDiscount > 0) {
    pushLog(state, `集采折扣已使用（${off}% off）。`);
    state.modifiers.nextBuyDiscount = 0;
  }
  return state;
}

function reduceInner(prev: GameState, action: GameAction): GameState {

  const state = clone(prev);
  if (typeof state.wagesPayable !== 'number' || Number.isNaN(state.wagesPayable)) state.wagesPayable = 0;
  if (typeof state.wagesAccruedThisMonth !== 'number' || Number.isNaN(state.wagesAccruedThisMonth)) state.wagesAccruedThisMonth = 0;
  if (!state.wagesAccruedByRole) state.wagesAccruedByRole = emptyWageAccrual();
  if (typeof state.taxPayable !== 'number' || Number.isNaN(state.taxPayable)) state.taxPayable = 0;
  if (typeof state.surplusReserve !== 'number' || Number.isNaN(state.surplusReserve)) state.surplusReserve = 0;
  if (typeof state.machineGross !== 'number') state.machineGross = state.machines * MACHINE_COST;
  if (typeof state.factoryGross !== 'number') state.factoryGross = state.factories * FACTORY_COST;
  if (typeof state.accumDepMachines !== 'number') state.accumDepMachines = 0;
  if (typeof state.accumDepFactories !== 'number') state.accumDepFactories = 0;
  if (typeof state.depreciableMachineGross !== 'number') state.depreciableMachineGross = state.machineGross;
  if (typeof state.depreciableFactoryGross !== 'number') state.depreciableFactoryGross = state.factoryGross;
  if (!state.materialCost) state.materialCost = openingMaterialCost(state.materials);
  if (!state.finishedCost) state.finishedCost = {};
  if (typeof state.wip !== 'number') state.wip = 0;
  ensureImpairmentState(state);
  if (typeof state.paidInCapital !== 'number') state.paidInCapital = netAssetsOf(state);
  if (typeof state.cardsBoughtThisMonth !== 'number' || Number.isNaN(state.cardsBoughtThisMonth)) state.cardsBoughtThisMonth = 0;
  if (!Array.isArray(state.shop)) state.shop = [];
  if (!Array.isArray(state.hand)) state.hand = [];
  state.hand = state.hand.map((card) => ({
    ...card,
    readyMonth: typeof card.readyMonth === 'number' ? card.readyMonth : 1,
  }));
  if (!Array.isArray(state.milestones)) state.milestones = [];
  if (typeof state.eventNote !== 'string' && state.eventNote !== null) state.eventNote = null;
  if (!Array.isArray(state.boardHistory)) state.boardHistory = [];
  if (!Array.isArray(state.challengeGoalIds)) state.challengeGoalIds = [];
  if (!Array.isArray(state.challengeDraft)) state.challengeDraft = [];
  if (!Array.isArray(state.usedClimateIds)) state.usedClimateIds = [];
  if (!CLIMATES.some((item) => item.id === state.climateId)) state.climateId = 'steel';
  if (!Array.isArray(state.challengePoolIds)) state.challengePoolIds = [];
  if (!Array.isArray(state.recentEventFamilies)) state.recentEventFamilies = [];
  if (!Array.isArray(state.quarterEventTones)) state.quarterEventTones = [];
  if (typeof state.difficulty !== 'string') state.difficulty = DEFAULT_DIFFICULTY;
  if (typeof state.eventGoodStreak !== 'number' || Number.isNaN(state.eventGoodStreak)) state.eventGoodStreak = 0;
  if (!state.quarterStats) state.quarterStats = emptyQuarterStats(totalStaff(state.staff), state.debt, state.cash, state.machines);
  if (typeof state.quarterStats.coveringMonths !== 'number') {
    state.quarterStats.coveringMonths = state.quarterStats.coveringMonth ? 1 : 0;
  }
  if (typeof state.quarterStats.nonBasicSold !== 'number') state.quarterStats.nonBasicSold = 0;
  if (typeof state.quarterStats.stockoutA !== 'boolean') state.quarterStats.stockoutA = false;
  if (typeof state.quarterStats.stockoutB !== 'boolean') state.quarterStats.stockoutB = false;
  if (typeof state.quarterStats.startCash !== 'number') state.quarterStats.startCash = state.cash;
  if (typeof state.quarterStats.startMachines !== 'number') state.quarterStats.startMachines = state.machines;
  if (typeof state.quarterStats.hired !== 'number') state.quarterStats.hired = 0;
  if (typeof state.quarterStats.boughtQty !== 'number') state.quarterStats.boughtQty = 0;
  if (!Array.isArray(state.monthOrders)) state.monthOrders = [];
  if (!Array.isArray(state.acceptedOrderIds)) state.acceptedOrderIds = [];
  if (!state.extraProduce) state.extraProduce = {};
  if (typeof state.staff.procurement !== 'number') state.staff.procurement = 0;
  if (!state.traderSpot) state.traderSpot = emptySpot();
  if (typeof state.prepaid !== 'number') state.prepaid = state.supplyContract?.prepaid ?? 0;
  if (state.supplyContract === undefined) state.supplyContract = null;
  ensureContracts(state);
  if (typeof state.overtimeUsedThisMonth !== 'boolean') state.overtimeUsedThisMonth = false;
  if (!state.passThroughDelta) state.passThroughDelta = {};
  if (state.pendingIpReplace === undefined) state.pendingIpReplace = null;
  if (!state.quarterSpotBonus) state.quarterSpotBonus = {};
  if (typeof state.modifiers.contractApFree !== 'boolean') state.modifiers.contractApFree = false;
  if (typeof state.modifiers.contractPrepayDiscount !== 'number') state.modifiers.contractPrepayDiscount = 0;
  ensureRdState(state);
  if (!state.marketTrend?.materials) {
    state.marketTrend = dealMarketTrend(
      state.climateId,
      state.unlockedProducts ?? ['basic'],
      Boolean(state.materialDUnlocked),
      catalogOf(state),
    );
  }
  if (!state.prevMaterialPrices) state.prevMaterialPrices = { ...state.materialPrices };
  if (!state.prevProductPrices) state.prevProductPrices = { ...state.productPrices };
  if (!state.materialSpot) {
    state.materialSpot = emptySpot();
    if (state.phase === 'briefing' || state.phase === 'event' || state.phase === 'actions' || state.phase === 'produce') {
      rollMaterialSpot(state);
    }
  }

  switch (action.type) {
    case 'TO_TITLE':
      return createInitialState();

    case 'TOGGLE_BOARD_GOAL': {
      if (state.phase !== 'board') return prev;
      const id = action.id;
      const allowed = goalById(id);
      if (allowed.kind !== 'challenge' || allowed.quarter !== state.quarter) return prev;
      const pool = state.challengePoolIds ?? [];
      if (pool.length > 0 && !pool.includes(id)) return prev;
      if (state.challengeDraft.includes(id)) {
        state.challengeDraft = state.challengeDraft.filter((item) => item !== id);
      } else {
        state.challengeDraft = [id];
      }
      return state;
    }

    case 'CONFIRM_BOARD': {
      if (state.phase !== 'board' || state.challengeDraft.length !== CHALLENGE_PICK) return prev;
      state.challengeGoalIds = [...state.challengeDraft];
      prepareMonth(state);
      syncMonthWages(state);
      const picked = state.challengeGoalIds.map((id) => `「${goalById(id).name}」`).join('、');
      pushLog(
        state,
        `${QUARTER_LABEL[state.quarter]}决议：基本目标「${goalById(state.basicGoalId).name}」；挑战目标${picked}。`,
      );
      pushLog(state, monthMarketLog(state));
      return state;
    }

    case 'CONFIRM_BRIEFING':
      if (state.phase !== 'briefing') return prev;
      applyEvent(state);
      state.phase = 'event';
      syncMonthWages(state);
      return state;

    case 'ACK_EVENT': {
      if (state.phase !== 'event' || !state.eventId) return prev;
      state.phase = 'actions';
      state.ap = maxApFor(state.staff);
      state.maxAp = state.ap;
      rollMonthOrders(state);
      syncMonthWages(state);
      queueContractDelivery(state);
      deliverContract(state);
      return state;
    }

    case 'BUY_MACHINE': {
      if (state.phase !== 'actions') return prev;
      if (state.machines >= state.slots) {
        pushLog(state, '厂区已满，先扩建再买设备。');
        return state;
      }
      if (state.cash < MACHINE_COST) {
        pushLog(state, '现金不够买下一台设备。');
        return state;
      }
      pay(state, MACHINE_COST, 'capex');
      state.machines += 1;
      state.machineGross = roundMoney((state.machineGross ?? 0) + MACHINE_COST);
      noteDept(state, 'infra', `购入设备 1台，花费 ${money(MACHINE_COST)}，产线现为 ${state.machines} 台`);
      return state;
    }

    case 'EXPAND_FACTORY': {
      if (state.phase !== 'actions') return prev;
      if (state.cash < FACTORY_COST) {
        pushLog(state, '扩建资金不足。');
        return state;
      }
      pay(state, FACTORY_COST, 'capex');
      state.factories += 1;
      state.factoryGross = roundMoney((state.factoryGross ?? 0) + FACTORY_COST);
      state.slots += SLOTS_PER_FACTORY;
      noteDept(state, 'infra', `扩建厂区 1座，花费 ${money(FACTORY_COST)}，机位现为 ${state.slots}`);
      return state;
    }

    case 'HIRE': {
      if (state.phase !== 'actions') return prev;
      const hireFee = HIRE_COST[action.role];
      if (state.cash < hireFee) {
        pushLog(state, '招聘费不足。');
        return state;
      }
      if (action.role === 'rd') {
        ensureRdState(state);
        const track = action.rdTrack ?? 'product';
        if (rdTrackStaff(state, track) >= RD_STAFF_CAP) {
          pushLog(state, `${RD_TRACK_LABEL[track]}已满员（${RD_STAFF_CAP} 人），不能再编入。`);
          return state;
        }
      }
      pay(state, hireFee, 'admin');
      if (action.role === 'rd') {
        const track = action.rdTrack ?? 'product';
        if (track === 'product') {
          state.rdProductStaff = (state.rdProductStaff ?? 0) + 1;
        } else {
          state.rdTechStaff = (state.rdTechStaff ?? 0) + 1;
          if (!state.rdTechProjectId && action.ipId && !hasIp(state, action.ipId)) {
            state.rdTechProjectId = action.ipId;
          }
        }
        state.staff.rd = (state.rdProductStaff ?? 0) + (state.rdTechStaff ?? 0);
      } else {
        state.staff[action.role] += 1;
      }
      if (state.quarterStats) state.quarterStats.hired = (state.quarterStats.hired ?? 0) + 1;
      state.maxAp = maxApFor(state.staff);
      accrueRoleWages(state, action.role, SALARY[action.role]);
      const hireDept: Record<Role, DeptId> = {
        management: 'ceo',
        sales: 'sales',
        production: 'infra',
        rd: 'rd',
        procurement: 'store',
      };
      let hireNote =
        hireFee > 0
          ? `招聘${ROLE_LABEL[action.role]} 1人。招聘费 ${money(hireFee)} 已付，月薪 ${money(SALARY[action.role])} 计入应付职工薪酬`
          : `招聘${ROLE_LABEL[action.role]} 1人。免招聘费，月薪 ${money(SALARY[action.role])} 计入应付职工薪酬`;
      if (action.role === 'sales') {
        const order = rollOneMarketOrder(state);
        hireNote += `。立刻带来${skuName(state, order.productId)} ${order.qty} 件`;
      }
      if (action.role === 'procurement') {
        hireNote += `。${grantHireSpot(state)}`;
      }
      if (action.role === 'rd') {
        const track = action.rdTrack ?? 'product';
        hireNote += `。编入${RD_TRACK_LABEL[track]}，成功率提升至 ${pctLabel(rdTrackRate(state, track))}`;
        if (track === 'product' && state.rdProductDraft) {
          hireNote += `，立项「${state.rdProductDraft.name}」`;
        }
        if (track === 'tech' && state.rdTechProjectId) {
          hireNote += `，攻关「${ipById(state.rdTechProjectId).name}」`;
        }
      }
      noteDept(state, hireDept[action.role], hireNote);
      return state;
    }

    case 'PICK_RD_TECH': {
      if (state.phase !== 'actions') return prev;
      ensureRdState(state);
      if (hasIp(state, action.ipId)) {
        pushLog(state, '这项知识产权已经装备。');
        return state;
      }
      const current = state.rdTechProjectId;
      if (current && current !== action.ipId && rdTrackProgress(state, 'tech') > 0) {
        pushLog(state, '当前课题已有进度，不能中途换题。');
        return state;
      }
      state.rdTechProjectId = action.ipId;
      if (current !== action.ipId) setRdProgress(state, 'tech', 0);
      noteDept(state, 'rd', `工艺实验室开题：${ipById(action.ipId).name}`, false);
      return state;
    }

    case 'OPEN_PRODUCT_RD': {
      if (state.phase !== 'actions') return prev;
      ensureRdState(state);
      if (rdTrackStaff(state, 'product') <= 0) {
        pushLog(state, '产品实验室没人，无法开题。');
        return state;
      }
      if (state.rdProductDraft) {
        pushLog(state, '已有进行中的产品课题。');
        return state;
      }
      if ((state.extraProducts?.length ?? 0) >= MAX_RD_PRODUCTS) {
        pushLog(state, '量产课题已经做完。');
        return state;
      }
      state.rdProductDraft = rollRdProduct(state, action.archetype);
      setRdProgress(state, 'product', 0);
      noteDept(state, 'rd', `产品实验室开题（${RD_ARCHETYPE_LABEL[action.archetype]}）：${state.rdProductDraft.name}。${state.rdProductDraft.blurb}`, false);
      return state;
    }

    case 'BUY_MATERIAL': {
      if (state.phase !== 'actions') return prev;
      return purchaseMaterials(state, [{ material: action.material, qty: action.qty }]);
    }
    case 'BUY_MATERIALS': {
      if (state.phase !== 'actions') return prev;
      return purchaseMaterials(state, action.items);
    }

    case 'SIGN_CONTRACT': {
      if (state.phase !== 'actions') return prev;
      const blocked = canSignContract(state, action.material, action.monthlyQty);
      if (blocked) {
        pushLog(state, blocked);
        return state;
      }
      const unit = contractUnitPrice(state, action.material);
      const prepay = roundMoney(unit * action.monthlyQty);
      const cover = contractCoverMonthsOf(state);
      if (!contractApFreeOf(state) && !spendAp(state)) {
        pushLog(state, '行动点不足。');
        return state;
      }
      pay(state, prepay, 'buy');
      ensureContracts(state);
      const signed: SupplyContract = {
        material: action.material,
        monthlyQty: action.monthlyQty,
        unitPrice: unit,
        remainingMonths: cover,
        prepaid: prepay,
        missed: 0,
        pendingQty: 0,
        pendingCost: 0,
      };
      state.supplyContracts = [...state.supplyContracts, signed];
      syncPrepaid(state);
      const apNote = contractApFreeOf(state) ? '，不耗 AP' : '';
      noteDept(
        state,
        'store',
        `签订长期协议：${materialName(action.material)} ${action.monthlyQty} 件/月 × ${cover} 个月，锁价 ${money(unit)}/件，预付 ${money(prepay)}${apNote}`,
      );
      return state;
    }

    case 'COLLECT_CONTRACT': {
      if (state.phase !== 'actions' && state.phase !== 'produce') return prev;
      if (!deliverContract(state, action.material)) {
        pushLog(state, '协议到货未收：现金不够，或本月没有待付到货。');
      }
      return state;
    }

    case 'CANCEL_CONTRACT': {
      if (state.phase !== 'actions') return prev;
      ensureContracts(state);
      const target =
        (action.material
          ? state.supplyContracts.find((item) => item.material === action.material)
          : state.supplyContracts[0]) ?? null;
      if (!target) {
        pushLog(state, '没有可解约的长期协议。');
        return state;
      }
      writeOffPrepaid(state, target, '主动解约');
      removeContract(state, target);
      noteDept(state, 'store', `长期协议已解除：${materialName(target.material)}`);
      return state;
    }

    case 'USE_OVERTIME': {
      if (state.phase !== 'actions' && state.phase !== 'produce') return prev;
      if (!canUseOvertime(state)) {
        pushLog(state, '现在不能连班：需要 6 名生产工、2 台设备，本月未连过班，并付加班费。');
        return state;
      }
      pay(state, PROD_OVERTIME_COST, 'extra');
      state.modifiers.extraCapacity += PROD_OVERTIME_CAP;
      state.overtimeUsedThisMonth = true;
      noteDept(
        state,
        'infra',
        `连班：加班费 ${money(PROD_OVERTIME_COST)}，本月产能 +${PROD_OVERTIME_CAP}`,
        false,
      );
      return state;
    }

    case 'BORROW': {
      if (state.phase !== 'actions') return prev;
      ensureLoans(state);
      if (loanOverdueOf(state) > 0) {
        pushLog(state, '有到期未还借款，须先还款才能再借。');
        return state;
      }
      const room = Math.max(0, loanLimit(state.machines) - state.debt);
      const amount = Math.min(action.amount, room);
      if (amount <= 0) {
        pushLog(state, '设备抵押额度已用尽。');
        return state;
      }
      if (!spendAp(state)) {
        pushLog(state, '行动点不足。');
        return state;
      }
      receive(state, amount, 'borrow');
      const dueMonth = state.month + LOAN_TERM_MONTHS;
      const dueLabel = MONTH_NAMES[dueMonth - 1] ?? `${dueMonth}月`;
      const interest = monthlyInterest(state.debt);
      noteDept(
        state,
        'finance',
        `借入 ${money(amount)}，期限 ${LOAN_TERM_MONTHS} 个月（${dueLabel}到期），负债现为 ${money(state.debt)} / 上限 ${money(loanLimit(state.machines))}，月末将计提财务费用 ${money(interest)}`,
      );
      return state;
    }

    case 'REPAY': {
      if (state.phase !== 'actions') return prev;
      const amount = Math.min(action.amount, state.debt, Math.max(0, state.cash));
      if (amount <= 0) {
        pushLog(state, '没有可还的债，或现金不足。');
        return state;
      }
      pay(state, amount, 'repay');
      applyLoanRepay(state, amount);
      if (state.quarterStats) state.quarterStats.repaid = true;
      noteDept(state, 'finance', `偿还 ${money(amount)}，负债现为 ${money(state.debt)}`);
      return state;
    }

    case 'BUY_CARD': {
      if (state.phase !== 'actions' || !state.shop[action.index]) return prev;
      if ((state.cardsBoughtThisMonth ?? 0) >= cardBuyLimitOf(state)) {
        pushLog(state, `本月已经立过 ${cardBuyLimitOf(state)} 项，下月再看新提案。`);
        return state;
      }
      if (state.hand.length >= handLimitOf(state)) {
        if (!action.replaceUid) {
          pushLog(state, `待执行已满（${handLimitOf(state)}）。立项时请换下一份。`);
          return state;
        }
        const dropAt = state.hand.findIndex((card) => card.uid === action.replaceUid);
        if (dropAt < 0) return prev;
        const [dropped] = state.hand.splice(dropAt, 1);
        pushLog(state, `换下「${cardById(dropped!.defId).name}」，腾出立项位子。`);
      }
      const card = state.shop[action.index]!;
      state.hand.push({ ...card, readyMonth: state.month + 1 });
      state.shop.splice(action.index, 1);
      state.cardsBoughtThisMonth = (state.cardsBoughtThisMonth ?? 0) + 1;
      const name = cardById(card.defId).name;
      noteDept(state, 'ceo', `立项「${name}」，本月不耗现金和行动点，下月可落地`);
      return state;
    }

    case 'PLAY_CARD': {
      if (state.phase !== 'actions') return prev;
      const index = state.hand.findIndex((card) => card.uid === action.uid);
      if (index < 0) return prev;
      const held = state.hand[index]!;
      const def = cardById(held.defId);
      if (!isProposalReady(held, state.month)) {
        pushLog(state, `「${def.name}」本月立项，下月才能落地。`);
        return state;
      }
      if (cardNeedsMaterial(held.defId)) {
        const id = action.material;
        if (!id || (id === 'd' && !state.materialDUnlocked)) {
          pushLog(state, `落地「${def.name}」时请选择一种原料。`);
          return state;
        }
      }
      if (!spendAp(state)) {
        pushLog(state, '行动点不足，无法落地。');
        return state;
      }
      state.hand.splice(index, 1);
      const text = playCardEffect(state, held.defId, action.material);
      if (state.quarterStats) state.quarterStats.playedCard = true;
      noteDept(state, 'ceo', `落地「${def.name}」：${def.playText}`, false);
      pushLog(state, text);
      return state;
    }

    case 'GO_PRODUCE':
      if (state.phase !== 'actions') return prev;
      state.phase = 'produce';
      state.deptActs.infra = state.deptActs.infra.filter((line) => !line.startsWith('转入排产'));
      noteDept(state, 'infra', '转入排产', false);
      return state;

    case 'BACK_TO_ACTIONS':
      if (state.phase !== 'produce') return prev;
      state.phase = 'actions';
      state.deptActs.infra = state.deptActs.infra.filter((line) => !line.startsWith('转入排产'));
      return state;

    case 'TOGGLE_ORDER': {
      if (state.phase !== 'actions' && state.phase !== 'produce') return prev;
      const order = (state.monthOrders ?? []).find((item) => item.id === action.id);
      if (!order) return prev;
      const accepted = state.acceptedOrderIds ?? [];
      if (accepted.includes(action.id)) {
        state.acceptedOrderIds = accepted.filter((id) => id !== action.id);
        clampExtraProduce(state);
        state.deptActs.sales = state.deptActs.sales.filter((line) => !line.startsWith('接单'));
        noteDept(state, 'sales', `放下${skuName(state, order.productId)} ${order.qty} 件`, false);
        return state;
      }
      if (!canAcceptOrder(state, action.id)) {
        pushLog(state, `接不下 ${skuName(state, order.productId)} ${order.qty} 件：产能或原料不够。可加价买、等协议到货，或放下这张。`);
        return state;
      }
      state.acceptedOrderIds = [...accepted, action.id];
      state.deptActs.sales = state.deptActs.sales.filter((line) => !line.startsWith('接单') && !line.startsWith('放下'));
      noteDept(state, 'sales', `接单${skuName(state, order.productId)} ${order.qty} 件`, false);
      return state;
    }

    case 'SET_EXTRA_PRODUCE': {
      if (state.phase !== 'actions' && state.phase !== 'produce') return prev;
      if (!state.unlockedProducts.includes(action.productId)) return prev;
      const qty = Math.max(0, Math.floor(action.qty));
      const extra = { ...(state.extraProduce ?? {}), [action.productId]: 0 };
      const max = maxExtraProduce({ ...state, extraProduce: extra }, action.productId);
      state.extraProduce = { ...extra, [action.productId]: Math.min(qty, max) };
      state.deptActs.infra = state.deptActs.infra.filter((line) => !line.startsWith('超产'));
      if ((state.extraProduce[action.productId] ?? 0) > 0) {
        noteDept(state, 'infra', `超产${skuName(state, action.productId)} ${state.extraProduce[action.productId]} 件入库`, false);
      }
      return state;
    }

    case 'ASSIGN_RD_REVEAL': {
      const queue = state.pendingRdReveals ?? [];
      const reveal = queue[0];
      if (!reveal) return prev;
      const options = rdRevealOptions(state);
      const picked = options.find((item) => sameRdAssign(item.assign, action.assign));
      if (!picked) {
        pushLog(state, '请先安排这批研发人员。');
        return state;
      }
      const note = applyRdAssign(state, reveal, picked.assign);
      noteDept(state, 'rd', note);
      state.pendingRdReveals = queue.slice(1);
      return state;
    }

    case 'SETTLE':
      if (state.phase !== 'produce' && state.phase !== 'actions') return prev;
      if (!productionPlan(state).ok) {
        pushLog(state, `当前接单超出产能或原料：${productionPlan(state).missing.join('，')}`);
        return state;
      }
      if (state.phase === 'actions') state.phase = 'produce';
      return settleMonth(state);

    case 'NEXT_MONTH':
      if (state.phase !== 'report') return prev;
      if ((state.pendingRdReveals ?? []).length > 0) {
        pushLog(state, '请先安排空出来的研发人员。');
        return state;
      }
      if (state.endKind) {
        state.phase = 'ended';
        return state;
      }
      state.month += 1;
      if (state.month === 4 || state.month === 7 || state.month === 10) {
        beginQuarter(state, quarterOf(state.month));
        return state;
      }
      prepareMonth(state);
      syncMonthWages(state);
      pushLog(state, monthMarketLog(state));
      return state;

    default:
      return prev;
  }
}

export function reduce(prev: GameState, action: GameAction): GameState {
  const next = action.type === 'START_GAME' || action.type === 'RESTART' ? startGame(prev) : reduceInner(prev, action);
  if (next !== prev) checkAchievements(next);
  return next;
}

function settleMonth(state: GameState): GameState {
  ensureImpairmentState(state);
  syncFinishedBooks(state);
  forfeitContractLot(state);
  const plan = productionPlan(state);
  const salaries = syncMonthWages(state);
  const producedEntries = (Object.entries(plan.produce) as Array<[ProductId, number]>).filter(([, qty]) => qty > 0);
  const made = producedEntries.reduce((sum, [, qty]) => sum + qty, 0);
  const produced = producedEntries.reduce((sum, [, qty]) => sum + qty + yieldExtraOf(qty, state), 0);
  const openingById: Partial<Record<ProductId, { qty: number; cost: number }>> = {};
  for (const id of state.unlockedProducts) {
    openingById[id] = { qty: state.finished[id] ?? 0, cost: state.finishedCost[id] ?? 0 };
  }
  const skuMap = new Map<ProductId, SettlementSku>();
  const ensureSku = (id: ProductId): SettlementSku => {
    const existing = skuMap.get(id);
    if (existing) return existing;
    const opening = openingById[id];
    const created: SettlementSku = {
      name: skuName(state, id),
      produced: 0,
      sold: 0,
      leftover: 0,
      unitPrice: sellPriceOf(state, id),
      revenue: 0,
      cogs: 0,
      materialIn: 0,
      conversionIn: 0,
      openingQty: opening?.qty ?? 0,
    };
    skuMap.set(id, created);
    return created;
  };

  const depreciation = accrueDepreciation(state);
  const upkeep = roundMoney(state.factories * FACTORY_UPKEEP);
  if (made > 0) {
    pay(state, upkeep, 'opOut');
    const conversion = roundMoney((state.wip ?? 0) + depreciation.total + upkeep);
    let allocated = 0;
    producedEntries.forEach(([productId, qty], index) => {
      const materialCost = consumeBom(state, productId, qty);
      const share =
        index === producedEntries.length - 1
          ? roundMoney(conversion - allocated)
          : roundMoney((conversion * qty) / made);
      allocated = roundMoney(allocated + share);
      const output = qty + yieldExtraOf(qty, state);
      state.finishedLayers[productId] = addLayer(
        state.finishedLayers[productId],
        output,
        roundMoney(materialCost + share),
        state.month,
      );
      const sku = ensureSku(productId);
      sku.produced = output;
      sku.materialIn = materialCost;
      sku.conversionIn = share;
    });
    state.wip = 0;
    syncFinishedBooks(state);
  } else {
    chargeAdmin(state, roundMoney((state.wip ?? 0) + depreciation.total));
    state.wip = 0;
    pay(state, upkeep, 'admin');
  }

  let sold = 0;
  let leftover = 0;
  let cogs = 0;
  let revenue = 0;
  const soldNames: string[] = [];
  for (const id of state.unlockedProducts) {
    const sellQty = plan.sell[id] ?? 0;
    if (sellQty > 0) {
      const result = sellFinished(state, id, sellQty);
      sold += result.sold;
      leftover += result.leftover;
      cogs = roundMoney(cogs + result.cogs);
      const lineRevenue = roundMoney(result.sold * sellPriceOf(state, id));
      revenue = roundMoney(revenue + lineRevenue);
      soldNames.push(`${skuName(state, id)} ${result.sold}件`);
      const sku = ensureSku(id);
      sku.sold = result.sold;
      sku.leftover = result.leftover;
      sku.revenue = lineRevenue;
      sku.cogs = result.cogs;
      sku.unitPrice = sellPriceOf(state, id);
      if (state.quarterStats) {
        if (id !== 'basic') {
          state.quarterStats.nonBasic = true;
          state.quarterStats.nonBasicSold = (state.quarterStats.nonBasicSold ?? 0) + result.sold;
        }
        if (id === 'premium' || id === 'special' || isPremiumProduct(productOf(state, id))) {
          state.quarterStats.premiumOrSpecial = true;
        }
      }
    } else {
      leftover += state.finished[id] ?? 0;
      const remain = state.finished[id] ?? 0;
      if (remain > 0 || (openingById[id]?.qty ?? 0) > 0) {
        const sku = ensureSku(id);
        sku.leftover = remain;
      }
    }
  }
  if (state.quarterStats) state.quarterStats.sold += sold;

  const cfSalesBefore = state.ledger.cfSales;
  const sale = recognizeSale(state, revenue);
  const arCollected = collectReceivables(state, state.modifiers.collectionBonus ?? 0, true);
  const arWritten = writeOffAgedReceivables(state);
  remeasureInventoryProvision(state);
  remeasureBadDebt(state);

  const wagesPaid = roundMoney(state.wagesPayable - salaries);
  payAccruedWages(state, wagesPaid);
  const loanCharges = applyLoanCharges(state);
  const interest = loanCharges.interest;
  if (state.quarterStats && revenue >= salaries + upkeep) {
    state.quarterStats.coveringMonth = true;
    state.quarterStats.coveringMonths = (state.quarterStats.coveringMonths ?? 0) + 1;
  }

  let penalty = roundMoney(loanCharges.defaultFee + loanCharges.lateFee);
  let contractPenalty = 0;
  for (const order of (state.monthOrders ?? []).filter((item) => item.kind === 'contract')) {
    const taken = (state.acceptedOrderIds ?? []).includes(order.id);
    if (taken) {
      if (order.okLog) pushLog(state, order.okLog);
    } else {
      penalty = roundMoney(penalty + (order.penalty ?? 0));
      contractPenalty = roundMoney(contractPenalty + (order.penalty ?? 0));
      if (order.penalty) pay(state, order.penalty, 'extra');
      pushLog(state, order.failLog ?? `合同 ${skuName(state, order.productId)} ${order.qty} 件未交，已扣违约金。`);
    }
  }
  state.pendingDeal = null;

  const rdNote = applyRd(state);
  if (rdNote) pushLog(state, rdNote);

  const taxPaid = settleIncomeTax(state);
  const netProfit = netProfitOf(state.ledger);
  const reserve = appropriateStatutoryReserve(state, netProfit);
  const net = netAssetsOf(state);
  const productNameLine = soldNames.join('、') || '未接单';
  const wages: SettlementWage[] = ROLES.map((role) => ({
    role,
    count: state.staff[role] ?? 0,
    unit: SALARY[role],
    total: state.wagesAccruedByRole?.[role] ?? 0,
  }));
  const facts: SettlementFacts = {
    skus: [...skuMap.values()],
    wages,
    rdProductStaff: state.rdProductStaff ?? 0,
    rdTechStaff: state.rdTechStaff ?? 0,
    produced: made > 0,
    factories: state.factories,
    machines: state.machines,
    machineDep: depreciation.machine,
    factoryDep: depreciation.factory,
    upkeep,
    cashSales: sale.cash,
    creditSales: sale.credit,
    arCollected,
    arWritten,
    interest,
    defaultFee: loanCharges.defaultFee,
    lateFee: loanCharges.lateFee,
    contractPenalty,
    taxPaid,
    reserve,
    settled: true,
  };
  const prevBooks = state.closedBooks[state.closedBooks.length - 1] ?? state.openBooks;
  const currBooks = snapshotBooks(state, MONTH_NAMES[state.month - 1] ?? `${state.month}月`);
  const report: SettlementReport = {
    month: state.month,
    productName: productNameLine,
    produced,
    sold,
    leftover,
    revenue,
    salaries,
    wagesPaid,
    upkeep,
    interest,
    penalty,
    netCash: roundMoney(state.ledger.cfSales - cfSalesBefore - wagesPaid - upkeep - interest - penalty - taxPaid),
    cash: state.cash,
    debt: state.debt,
    netAssets: net,
    rdNote,
    lines: pnlSettlementLines(state.ledger, reserve),
    facts,
    pnlRows: buildPnlRows(facts, state.ledger, operatingProfitOf(state.ledger), profitBeforeTaxOf(state.ledger), netProfit),
    balanceRows: buildBalanceRows(prevBooks, currBooks, facts),
    cashRows: buildCashRows(facts, state.ledger, state.cash, operatingCashOf(state.ledger)),
  };

  state.prevReport = state.lastReport;
  state.lastReport = report;
  currBooks.pnlRows = report.pnlRows;
  currBooks.balanceRows = report.balanceRows;
  currBooks.cashRows = report.cashRows;
  state.closedBooks = [...state.closedBooks, currBooks];
  pushLog(
    state,
    `${state.month} 月结算：${productNameLine}，现销 ${money(sale.cash)}，赊销 ${money(sale.credit)}，账面成本 ${money(cogs)}，净利润 ${money(netProfit)}。`,
  );

  if (state.cash < 0) {
    state.endKind = 'bankrupt';
    state.phase = 'report';
    settleQuarter(state, state.quarter);
    pushLog(state, '现金转负，银行上门封账。本局结束。');
    return state;
  }

  if (state.month >= TOTAL_MONTHS) {
    state.endKind = 'finished';
    state.phase = 'report';
    settleQuarter(state, state.quarter);
    pushLog(state, '十二个月走完。账本合上，看最终评分。');
    return state;
  }

  state.phase = 'report';
  return state;
}

