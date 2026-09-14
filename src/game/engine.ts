import {
  BASE_AP,
  CAP_OVERFLOW,
  CAP_PER_WORKER,
  CARDS,
  EVENTS,
  FACTORY_BOOK,
  FACTORY_COST,
  FACTORY_UPKEEP,
  HAND_LIMIT,
  HIRE_COST,
  INTEREST_RATE,
  LOAN_PER_MACHINE,
  MACHINE_BASE_CAP,
  MACHINE_BOOK,
  MACHINE_COST,
  MATERIALS,
  MATERIAL_IDS,
  PRODUCTS,
  RD_THRESHOLD,
  RD_UNLOCKS,
  SALARY,
  SLOTS_PER_FACTORY,
  TOTAL_MONTHS,
  WORKERS_PER_MACHINE,
  cardById,
  eventById,
  productById,
} from './data';
import { ACHIEVEMENTS } from './achievements';
import { MILESTONES } from './score';
import { MONTH_NAMES, ROLE_LABEL, materialName, money, productName, roundMoney } from './format';
import type {
  CardInstance,
  DeptId,
  GameAction,
  GameState,
  MaterialId,
  Modifiers,
  MonthBooks,
  MonthLedger,
  ProductId,
  Role,
  SettlementReport,
  Staff,
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

function emptyModifiers(): Modifiers {
  return {
    extraCapacity: 0,
    extraDemand: 0,
    priceBonus: 0,
    nextBuyDiscount: 0,
    secondProduct: false,
  };
}

export function totalStaff(staff: Staff): number {
  return staff.production + staff.management + staff.sales + staff.rd;
}

export function maxApFor(staff: Staff): number {
  return BASE_AP + Math.floor(staff.management / 2);
}

export function loanLimit(machines: number): number {
  return machines * LOAN_PER_MACHINE;
}

export function capacityOf(state: GameState): number {
  const capped = Math.min(state.staff.production, state.machines * WORKERS_PER_MACHINE);
  const overflow = Math.max(0, state.staff.production - state.machines * WORKERS_PER_MACHINE);
  return (
    state.machines * MACHINE_BASE_CAP +
    capped * CAP_PER_WORKER +
    overflow * CAP_OVERFLOW +
    state.modifiers.extraCapacity
  );
}

export function demandOf(state: GameState, id: ProductId): number {
  const base = state.demand[id] ?? 0;
  return Math.max(0, Math.round(base + state.modifiers.extraDemand));
}

export function sellPriceOf(state: GameState, id: ProductId): number {
  const base = state.productPrices[id] ?? 0;
  return roundPrice(base * (1 + state.modifiers.priceBonus));
}

export function bomCost(state: GameState, id: ProductId): number {
  const bom = productById(id).bom;
  let cost = 0;
  for (const key of MATERIAL_IDS) {
    const need = bom[key] ?? 0;
    cost += need * state.materialPrices[key];
  }
  return roundPrice(cost);
}

export function maxProduce(state: GameState, id: ProductId): number {
  const bom = productById(id).bom;
  let limit = capacityOf(state);
  for (const key of MATERIAL_IDS) {
    const need = bom[key] ?? 0;
    if (need > 0) limit = Math.min(limit, Math.floor(state.materials[key] / need));
  }
  return Math.max(0, limit);
}

export function materialValue(state: GameState): number {
  return MATERIAL_IDS.reduce((sum, id) => sum + state.materials[id] * state.materialPrices[id], 0);
}

export function finishedValue(state: GameState): number {
  return (Object.keys(state.finished) as ProductId[]).reduce((sum, id) => {
    return sum + (state.finished[id] ?? 0) * sellPriceOf(state, id) * 0.6;
  }, 0);
}

export function bookAssets(state: GameState): number {
  return state.machines * MACHINE_BOOK + state.factories * FACTORY_BOOK;
}

export function netAssetsOf(state: GameState): number {
  return roundMoney(
    state.cash + materialValue(state) + finishedValue(state) + bookAssets(state) - state.debt - state.wagesPayable,
  );
}

export function monthlySalary(staff: Staff): number {
  return (
    staff.production * SALARY.production +
    staff.management * SALARY.management +
    staff.sales * SALARY.sales +
    staff.rd * SALARY.rd
  );
}

function cardsUnlockedNow(state: GameState): boolean {
  return state.month >= 3 || totalStaff(state.staff) >= 6;
}

function pushLog(state: GameState, line: string): void {
  state.log = [line, ...state.log].slice(0, 40);
}

function emptyDeptActs(): Record<DeptId, string[]> {
  return { ceo: [], finance: [], hr: [], infra: [], store: [], rd: [], sales: [] };
}

function noteDept(state: GameState, dept: DeptId, text: string): void {
  state.deptActs[dept] = [...state.deptActs[dept], text];
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
    inventory: 0,
    fixedAssets: 0,
    borrowings: 0,
    wagesPayable: 0,
    equity: 0,
    ledger: emptyLedger(),
  };
}

export function snapshotBooks(state: GameState, title: string): MonthBooks {
  return {
    month: state.month,
    title,
    cash: state.cash,
    inventory: roundMoney(materialValue(state) + finishedValue(state)),
    fixedAssets: bookAssets(state),
    borrowings: state.debt,
    wagesPayable: state.wagesPayable,
    equity: netAssetsOf(state),
    ledger: clone(state.ledger),
  };
}

function pay(
  state: GameState,
  amount: number,
  kind: 'buy' | 'wage' | 'selling' | 'admin' | 'tax' | 'extra' | 'capex' | 'repay' | 'finance',
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

function accrueWages(state: GameState, amount: number): void {
  const n = roundMoney(amount);
  if (n <= 0) return;
  state.wagesPayable = roundMoney(state.wagesPayable + n);
  state.wagesAccruedThisMonth = roundMoney(state.wagesAccruedThisMonth + n);
  state.ledger.admin = roundMoney(state.ledger.admin + n);
}

function syncMonthWages(state: GameState): number {
  const need = roundMoney(monthlySalary(state.staff));
  accrueWages(state, roundMoney(need - state.wagesAccruedThisMonth));
  return need;
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
    state.debt = roundMoney(state.debt + n);
    state.ledger.cfBorrow = roundMoney(state.ledger.cfBorrow + n);
  }
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
  currClosed: boolean;
} {
  const settledThisMonth = state.lastReport?.month === state.month;
  const prev = settledThisMonth
    ? (state.closedBooks[state.closedBooks.length - 2] ?? state.openBooks)
    : (state.closedBooks[state.closedBooks.length - 1] ?? state.openBooks);
  const curr = settledThisMonth
    ? (state.closedBooks[state.closedBooks.length - 1] ?? snapshotBooks(state, MONTH_NAMES[state.month - 1] ?? '本月'))
    : snapshotBooks(state, '本月');
  return { prev, curr, currClosed: settledThisMonth };
}

export function checkAchievements(state: GameState): void {
  if (state.phase === 'title') return;
  if (state.debt > 0) state.everDebt = true;
  unlockAchievement(state, 'open');
  if (state.lastReport) unlockAchievement(state, 'firstSettle');
  if (state.cardsUnlocked) unlockAchievement(state, 'cards');
  if (totalStaff(state.staff) >= 6) unlockAchievement(state, 'hire6');
  if (state.machines >= 2) unlockAchievement(state, 'machine2');
  if (state.factories >= 2) unlockAchievement(state, 'factory2');
  if (state.staff.rd >= 1) unlockAchievement(state, 'rd1');
  if (state.unlockedProducts.length > 3) unlockAchievement(state, 'newProduct');
  if (state.cash >= 50) unlockAchievement(state, 'cash500');
  if (netAssetsOf(state) >= 100) unlockAchievement(state, 'net1000');
  if (state.debt > 0) unlockAchievement(state, 'loan');
  if (state.everDebt && state.debt <= 0) unlockAchievement(state, 'debtFree');
  if (state.month >= 6) unlockAchievement(state, 'survive6');
  if (state.lastReport?.productName === '旗舰款') unlockAchievement(state, 'premium');
  for (const mile of MILESTONES) {
    if (!state.milestones.includes(mile.id) && mile.reached(state)) {
      state.milestones = [...state.milestones, mile.id];
      pushLog(state, `里程碑：${mile.name}（+${mile.points} 分）。`);
    }
  }
}

function spendAp(state: GameState, n = 1): boolean {
  if (state.ap < n) return false;
  state.ap -= n;
  return true;
}

export function nextCardBuyAp(state: GameState): number {
  return state.cardsBoughtThisMonth ?? 0;
}

function nextUid(state: GameState): string {
  state.uidSeq += 1;
  return `c${state.uidSeq}`;
}

function rollMarket(state: GameState, firstMonth: boolean): void {
  for (const mat of MATERIALS) {
    if (mat.id === 'd' && !state.materialDUnlocked) {
      state.materialPrices.d = mat.basePrice;
      continue;
    }
    if (firstMonth) {
      state.materialPrices[mat.id] = mat.basePrice;
      continue;
    }
    const step = pick([-0.2, -0.1, 0, 0.1, 0.2]);
    state.materialPrices[mat.id] = roundPrice(
      clamp(state.materialPrices[mat.id] + step, roundMoney(mat.basePrice * 0.5), roundMoney(mat.basePrice * 2)),
    );
  }

  for (const product of PRODUCTS) {
    if (!state.unlockedProducts.includes(product.id)) continue;
    const salesBoost = 1 + state.staff.sales * 0.1;
    if (firstMonth) {
      state.productPrices[product.id] = product.basePrice;
      state.demand[product.id] = Math.round((product.baseDemand * salesBoost) / 5) * 5;
      continue;
    }
    const step = pick([-0.5, -0.2, 0, 0.2, 0.5]);
    state.productPrices[product.id] = roundPrice(
      clamp(
        (state.productPrices[product.id] ?? product.basePrice) + step,
        roundMoney(product.basePrice * 0.5),
        roundMoney(product.basePrice * 1.5),
      ),
    );
    const demandStep = pick([-10, -5, 0, 5, 10]);
    state.demand[product.id] = Math.max(
      5,
      Math.round(((state.demand[product.id] ?? product.baseDemand) + demandStep + state.staff.sales * 5) / 5) * 5,
    );
  }
}

function pickEvent(state: GameState): string {
  const unused = EVENTS.filter((event) => !state.usedEventIds.includes(event.id));
  const pool = unused.length > 0 ? unused : EVENTS;
  const weighted = pool.flatMap((event) => Array.from({ length: event.weight ?? 1 }, () => event.id));
  return pick(weighted);
}

function takeMaterial(state: GameState, id: MaterialId, qty: number): number {
  const have = state.materials[id] ?? 0;
  const taken = Math.min(qty, have);
  state.materials[id] = have - taken;
  return taken;
}

function prepareMonth(state: GameState, firstMonth: boolean): void {
  state.modifiers = emptyModifiers();
  state.shop = [];
  state.shopDrawn = false;
  state.cardsBoughtThisMonth = 0;
  state.selectedProduct = null;
  state.pendingDeal = null;
  state.ledger = emptyLedger();
  state.deptActs = emptyDeptActs();
  state.wagesAccruedThisMonth = 0;
  state.ledger.openingCash = state.cash;
  state.cardsUnlocked = cardsUnlockedNow(state);
  state.maxAp = maxApFor(state.staff);
  state.ap = state.maxAp;
  rollMarket(state, firstMonth);
  state.eventId = pickEvent(state);
  state.eventNote = null;
  state.phase = 'briefing';
}

function consumeBom(state: GameState, id: ProductId, count: number): void {
  const bom = productById(id).bom;
  for (const key of MATERIAL_IDS) {
    const need = (bom[key] ?? 0) * count;
    state.materials[key] -= need;
  }
}

function applyRd(state: GameState): string | null {
  if (state.staff.rd <= 0) return null;
  state.rdProgress += state.staff.rd;
  if (state.rdProgress < RD_THRESHOLD) {
    return `研发推进 ${state.staff.rd} 点，进度 ${state.rdProgress}/${RD_THRESHOLD}。`;
  }
  if (state.rdUnlockIndex >= RD_UNLOCKS.length) {
    state.rdProgress = RD_THRESHOLD;
    return '实验室已无下一档量产项目，团队在做工艺微调。';
  }
  state.rdProgress -= RD_THRESHOLD;
  const unlock = RD_UNLOCKS[state.rdUnlockIndex]!;
  state.rdUnlockIndex += 1;
  if (unlock.unlockD) state.materialDUnlocked = true;
  if (unlock.product && !state.unlockedProducts.includes(unlock.product)) {
    state.unlockedProducts.push(unlock.product);
    const def = productById(unlock.product);
    state.productPrices[unlock.product] = def.basePrice;
    state.demand[unlock.product] = Math.round(def.baseDemand * (1 + state.staff.sales * 0.12));
  }
  return unlock.note;
}

function suitWeight(state: GameState, suit: Role): number {
  return 1 + state.staff[suit] * 0.85;
}

function rollCard(state: GameState): CardInstance {
  const weighted = CARDS.flatMap((card) => {
    const copies = Math.max(1, Math.round(suitWeight(state, card.suit) * 2));
    return Array.from({ length: copies }, () => card.id);
  });
  return { uid: nextUid(state), defId: pick(weighted) };
}

function playCardEffect(state: GameState, defId: string): string {
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
    case 'client':
      state.modifiers.extraDemand += 15;
      break;
    case 'premiumPush':
      state.modifiers.priceBonus += 0.2;
      break;
    case 'labRush':
      state.rdProgress += 1;
      break;
    case 'bridge':
      receive(state, 5, 'borrow');
      break;
    default:
      break;
  }
  return cardById(defId).playText;
}

function applyEvent(state: GameState): void {
  const event = eventById(state.eventId!);
  const bits: string[] = [];

  switch (event.id) {
    case 'steelSpike': {
      state.materialPrices.a = roundPrice(state.materialPrices.a * 1.5);
      const lost = takeMaterial(state, 'a', 6);
      bits.push(`钢材报价上调 50%，现为 ${money(state.materialPrices.a)}/件`);
      if (lost > 0) bits.push(`到货配额被砍，钢材库存 -${lost}`);
      break;
    }
    case 'bigOrder':
      state.modifiers.extraDemand += 8;
      state.pendingDeal = {
        productId: 'basic',
        minSold: 12,
        penalty: 6,
        okLog: '超市加单已按量交付。',
        failLog: '超市加单未能交齐，违约金 6 万已扣。',
      };
      bits.push('基础款需求 +8');
      bits.push('本月须售出基础款 12 件，否则违约金 6 万');
      break;
    case 'resign':
      if (state.staff.production > 0) {
        state.staff.production -= 1;
        bits.push('生产人员 -1，编制立刻空出一档');
      } else {
        state.modifiers.extraCapacity -= 4;
        bits.push('产线本就无人，本月产能再削 4');
      }
      break;
    case 'quality':
      pay(state, 4, 'extra');
      state.finished = {};
      state.modifiers.extraDemand -= 8;
      bits.push('罚款 4 万已划走');
      bits.push('成品库存清零，本月需求 -8');
      break;
    case 'dump':
      state.modifiers.priceBonus -= 0.15;
      state.modifiers.extraDemand -= 8;
      bits.push('本月售价 -15%，需求 -8');
      break;
    case 'blackout':
      state.modifiers.extraCapacity -= 8;
      bits.push('错峰限电，本月产能 -8');
      break;
    case 'tax':
      pay(state, 5, 'tax');
      bits.push('进项转出补税 5 万，现金已划走');
      break;
    case 'chipSqueeze': {
      state.materialPrices.c = roundPrice(state.materialPrices.c * 1.5);
      const lost = takeMaterial(state, 'c', 1);
      bits.push(`芯片报价上调 50%，现为 ${money(state.materialPrices.c)}/件`);
      if (lost > 0) bits.push('配额被收，库存芯片 -1');
      break;
    }
    case 'machineDown':
      pay(state, 2, 'admin');
      state.modifiers.extraCapacity -= MACHINE_BASE_CAP;
      bits.push(`抢修预付 2 万，本月产能 -${MACHINE_BASE_CAP}（少一台设备）`);
      break;
    case 'channelHold':
      pay(state, 3, 'extra');
      state.modifiers.extraDemand -= 6;
      bits.push('渠道准备金 3 万已划走，本月需求 -6');
      break;
    case 'bankCall':
      if (state.debt > 0) {
        const amount = Math.min(4, state.debt, Math.max(0, state.cash));
        if (amount > 0) {
          pay(state, amount, 'repay');
          state.debt = roundMoney(state.debt - amount);
          bits.push(`银行抽贷，强制收回 ${money(amount)}`);
        }
        if (state.debt > 0 && state.cash <= 0) {
          bits.push('账上现金不够扣回全部抽贷，剩余负债仍在');
        }
      } else {
        pay(state, 3, 'admin');
        bits.push('授信审查评估费 3 万已划走');
      }
      break;
    case 'rushOrder':
      state.modifiers.extraDemand += 14;
      state.modifiers.priceBonus -= 0.1;
      state.pendingDeal = {
        productId: 'basic',
        minSold: 12,
        penalty: 5,
        okLog: '经销商压货已按量交付。',
        failLog: '经销商压货未能交齐，违约金 5 万已扣。',
      };
      bits.push('需求 +14，售价 -10%');
      bits.push('本月须售出基础款 12 件，否则违约金 5 万');
      break;
    case 'poach':
      if (state.staff.rd > 0) {
        state.staff.rd -= 1;
        bits.push('研发人员 -1');
      } else {
        if (state.rdProgress > 0) {
          state.rdProgress -= 1;
          bits.push('实验室空转，研发进度 -1');
        }
        state.modifiers.extraCapacity -= 3;
        bits.push('工艺无人盯线，本月产能 -3');
      }
      break;
    case 'rebate':
      receive(state, 3, 'extra');
      bits.push('出口退税 3 万到账');
      break;
    default:
      bits.push(event.impact);
      break;
  }

  state.usedEventIds = [...state.usedEventIds, event.id].slice(-EVENTS.length);
  state.maxAp = maxApFor(state.staff);
  const note = bits.join('。') + '。';
  state.eventNote = note;
  pushLog(state, `事件「${event.title}」已落地：${note}`);
}

export function createInitialState(): GameState {
  return {
    phase: 'title',
    month: 1,
    cash: 24,
    debt: 0,
    wagesPayable: 0,
    wagesAccruedThisMonth: 0,
    ap: BASE_AP,
    maxAp: BASE_AP,
    factories: 1,
    slots: SLOTS_PER_FACTORY,
    machines: 1,
    staff: { production: 2, management: 1, sales: 1, rd: 0 },
    materials: { a: 16, b: 8, c: 2, d: 0 },
    finished: {},
    materialPrices: { a: 0.4, b: 0.4, c: 1, d: 2 },
    productPrices: { basic: 1.5, standard: 4, premium: 6 },
    demand: { basic: 20, standard: 10, premium: 5 },
    unlockedProducts: ['basic', 'standard', 'premium'],
    materialDUnlocked: false,
    rdProgress: 0,
    rdUnlockIndex: 0,
    cardsUnlocked: false,
    shop: [],
    shopDrawn: false,
    cardsBoughtThisMonth: 0,
    hand: [],
    modifiers: emptyModifiers(),
    eventId: null,
    eventNote: null,
    usedEventIds: [],
    selectedProduct: null,
    lastReport: null,
    prevReport: null,
    log: ['北港制造开业。账上有启动资金，库里有第一批料。'],
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
  };
}

function startGame(prev: GameState): GameState {
  const state = createInitialState();
  state.uidSeq = prev.uidSeq;
  prepareMonth(state, true);
  state.openBooks = snapshotBooks(state, '开业');
  syncMonthWages(state);
  pushLog(state, '第一份行业月报已放在桌上。先看行情，再看本月落地的事件。');
  checkAchievements(state);
  return state;
}

function reduceInner(prev: GameState, action: GameAction): GameState {

  const state = clone(prev);
  if (typeof state.wagesPayable !== 'number' || Number.isNaN(state.wagesPayable)) state.wagesPayable = 0;
  if (typeof state.wagesAccruedThisMonth !== 'number' || Number.isNaN(state.wagesAccruedThisMonth)) state.wagesAccruedThisMonth = 0;
  if (typeof state.cardsBoughtThisMonth !== 'number' || Number.isNaN(state.cardsBoughtThisMonth)) state.cardsBoughtThisMonth = 0;
  if (!Array.isArray(state.milestones)) state.milestones = [];
  if (typeof state.eventNote !== 'string' && state.eventNote !== null) state.eventNote = null;

  switch (action.type) {
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
      if (cardsUnlockedNow(state) && !state.cardsUnlocked) {
        state.cardsUnlocked = true;
        pushLog(state, '决策卡已解锁：本月可免费翻牌，再花钱选购。');
      }
      state.cardsUnlocked = cardsUnlockedNow(state);
      syncMonthWages(state);
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
      if (!spendAp(state)) {
        pushLog(state, '行动点不足。');
        return state;
      }
      pay(state, MACHINE_COST, 'capex');
      state.machines += 1;
      noteDept(state, 'infra', `购入设备 1台，花费 ${money(MACHINE_COST)}，产线现为 ${state.machines} 台`);
      pushLog(state, `新设备到位。产线 ${state.machines} 台，抵押融资上限 ${money(loanLimit(state.machines))}。`);
      return state;
    }

    case 'EXPAND_FACTORY': {
      if (state.phase !== 'actions') return prev;
      if (state.cash < FACTORY_COST) {
        pushLog(state, '扩建资金不足。');
        return state;
      }
      if (!spendAp(state)) {
        pushLog(state, '行动点不足。');
        return state;
      }
      pay(state, FACTORY_COST, 'capex');
      state.factories += 1;
      state.slots += SLOTS_PER_FACTORY;
      noteDept(state, 'infra', `扩建厂区 1座，花费 ${money(FACTORY_COST)}，机位现为 ${state.slots}`);
      pushLog(state, `新厂区开工。机位 ${state.slots}，月维护上调。`);
      return state;
    }

    case 'HIRE': {
      if (state.phase !== 'actions') return prev;
      if (state.cash < HIRE_COST) {
        pushLog(state, '招聘费不足。');
        return state;
      }
      if (!spendAp(state)) {
        pushLog(state, '行动点不足。');
        return state;
      }
      pay(state, HIRE_COST, 'admin');
      state.staff[action.role] += 1;
      state.maxAp = maxApFor(state.staff);
      accrueWages(state, SALARY[action.role]);
      noteDept(
        state,
        'hr',
        `招聘${ROLE_LABEL[action.role]} 1人。招聘费 ${money(HIRE_COST)} 已付，月薪 ${money(SALARY[action.role])} 计入应付职工薪酬`,
      );
      pushLog(
        state,
        `新同事入职：${ROLE_LABEL[action.role]}。招聘费 ${money(HIRE_COST)}，月薪 ${money(SALARY[action.role])} 下月发放。编制 ${totalStaff(state.staff)} 人。`,
      );
      if (cardsUnlockedNow(state) && !state.cardsUnlocked) {
        state.cardsUnlocked = true;
        pushLog(state, '团队够大了，决策卡本月起可用。');
      }
      return state;
    }

    case 'BUY_MATERIAL': {
      if (state.phase !== 'actions') return prev;
      if (action.material === 'd' && !state.materialDUnlocked) {
        pushLog(state, '特种合金尚未开线。');
        return state;
      }
      const unit = state.materialPrices[action.material];
      const discount = 1 - state.modifiers.nextBuyDiscount;
      const cost = roundPrice(unit * action.qty * discount);
      if (state.cash < cost) {
        pushLog(state, '采购金额超过现金。');
        return state;
      }
      if (!spendAp(state)) {
        pushLog(state, '行动点不足。');
        return state;
      }
      pay(state, cost, 'buy');
      state.materials[action.material] += action.qty;
      const off = Math.round(state.modifiers.nextBuyDiscount * 100);
      const buyNote = off > 0
        ? `采购${materialName(action.material)} ${action.qty}件，花费 ${money(cost)}（${100 - off}折）`
        : `采购${materialName(action.material)} ${action.qty}件，花费 ${money(cost)}`;
      noteDept(state, 'store', buyNote);
      if (state.modifiers.nextBuyDiscount > 0) {
        pushLog(state, `集采折扣已使用（${off}% off）。`);
        state.modifiers.nextBuyDiscount = 0;
      }
      pushLog(state, `${buyNote}。`);
      return state;
    }

    case 'BORROW': {
      if (state.phase !== 'actions') return prev;
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
      noteDept(state, 'finance', `借入 ${money(amount)}，负债现为 ${money(state.debt)}`);
      pushLog(state, `放款 ${money(amount)}。负债 ${money(state.debt)} / 上限 ${money(loanLimit(state.machines))}。`);
      return state;
    }

    case 'REPAY': {
      if (state.phase !== 'actions') return prev;
      const amount = Math.min(action.amount, state.debt, Math.max(0, state.cash));
      if (amount <= 0) {
        pushLog(state, '没有可还的债，或现金不足。');
        return state;
      }
      if (!spendAp(state)) {
        pushLog(state, '行动点不足。');
        return state;
      }
      pay(state, amount, 'repay');
      state.debt = roundMoney(state.debt - amount);
      noteDept(state, 'finance', `偿还 ${money(amount)}，负债现为 ${money(state.debt)}`);
      pushLog(state, `还款 ${money(amount)}。剩余负债 ${money(state.debt)}。`);
      return state;
    }

    case 'DRAW_SHOP': {
      if (state.phase !== 'actions' || !state.cardsUnlocked || state.shopDrawn) return prev;
      state.shop = [rollCard(state), rollCard(state), rollCard(state)];
      state.shopDrawn = true;
      noteDept(state, 'ceo', '翻开本月卡铺');
      pushLog(state, '三张决策卡翻开。员工结构越偏哪一类，哪一类牌越常出现。');
      return state;
    }

    case 'BUY_CARD': {
      if (state.phase !== 'actions' || !state.shop[action.index]) return prev;
      if (state.hand.length >= HAND_LIMIT) {
        pushLog(state, `手牌已满（${HAND_LIMIT}）。先打出再买。`);
        return state;
      }
      const card = state.shop[action.index]!;
      const cost = cardById(card.defId).cost;
      if (state.cash < cost) {
        pushLog(state, '买不起这张卡。');
        return state;
      }
      const apCost = state.cardsBoughtThisMonth;
      if (apCost > 0 && !spendAp(state, apCost)) {
        pushLog(state, `再买一张要耗 ${apCost} AP。`);
        return state;
      }
      pay(state, cost, 'admin');
      state.hand.push(card);
      state.shop.splice(action.index, 1);
      state.cardsBoughtThisMonth += 1;
      noteDept(
        state,
        'ceo',
        apCost > 0
          ? `买入「${cardById(card.defId).name}」，花费 ${money(cost)}，耗 ${apCost} AP`
          : `买入「${cardById(card.defId).name}」，花费 ${money(cost)}，本月首张免 AP`,
      );
      pushLog(
        state,
        apCost > 0
          ? `购入「${cardById(card.defId).name}」，耗 ${apCost} AP。`
          : `购入「${cardById(card.defId).name}」，本月首张免 AP。`,
      );
      return state;
    }

    case 'PLAY_CARD': {
      if (state.phase !== 'actions') return prev;
      const index = state.hand.findIndex((card) => card.uid === action.uid);
      if (index < 0) return prev;
      if (!spendAp(state)) {
        pushLog(state, '行动点不足，无法打出卡牌。');
        return state;
      }
      const [card] = state.hand.splice(index, 1);
      const def = cardById(card!.defId);
      const text = playCardEffect(state, card!.defId);
      noteDept(state, 'ceo', `打出「${def.name}」：${def.playText}`);
      pushLog(state, text);
      return state;
    }

    case 'GO_PRODUCE':
      if (state.phase !== 'actions') return prev;
      state.phase = 'produce';
      if (!state.selectedProduct) {
        state.selectedProduct = state.unlockedProducts.find((id) => maxProduce(state, id) > 0) ?? state.unlockedProducts[0] ?? null;
      }
      noteDept(state, 'sales', '转入排产');
      if (state.selectedProduct) {
        noteDept(state, 'sales', `选定${productName(state.selectedProduct)}`);
      }
      return state;

    case 'SELECT_PRODUCT':
      if (state.phase !== 'produce') return prev;
      if (!state.unlockedProducts.includes(action.id)) return prev;
      state.selectedProduct = action.id;
      state.deptActs.sales = state.deptActs.sales.filter((line) => !line.startsWith('选定'));
      noteDept(state, 'sales', `选定${productName(action.id)}`);
      return state;

    case 'SETTLE':
      if (state.phase !== 'produce' || !state.selectedProduct) return prev;
      return settleMonth(state);

    case 'NEXT_MONTH':
      if (state.phase !== 'report') return prev;
      if (state.endKind) {
        state.phase = 'ended';
        return state;
      }
      state.month += 1;
      prepareMonth(state, false);
      syncMonthWages(state);
      pushLog(state, `${state.month} 月行情已更新。`);
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
  const productId = state.selectedProduct!;
  const produced = maxProduce(state, productId);
  consumeBom(state, productId, produced);
  const stock = (state.finished[productId] ?? 0) + produced;
  const sold = Math.min(stock, demandOf(state, productId));
  const leftover = stock - sold;
  state.finished[productId] = leftover;
  const revenue = roundMoney(sold * sellPriceOf(state, productId));
  const cogs = roundMoney(bomCost(state, productId) * produced);
  state.ledger.cogs = roundMoney(state.ledger.cogs + cogs);
  receive(state, revenue, 'sales');

  const salaries = syncMonthWages(state);
  const wagesPaid = roundMoney(state.wagesPayable - salaries);
  payAccruedWages(state, wagesPaid);
  const upkeep = roundMoney(state.factories * FACTORY_UPKEEP);
  const interest = state.debt > 0 ? roundMoney(state.debt * INTEREST_RATE) : 0;
  pay(state, upkeep, 'admin');
  pay(state, interest, 'finance');

  let penalty = 0;
  if (state.pendingDeal) {
    const deal = state.pendingDeal;
    const dealSold = productId === deal.productId ? sold : 0;
    if (dealSold >= deal.minSold) {
      pushLog(state, deal.okLog);
    } else {
      penalty = deal.penalty;
      pay(state, penalty, 'extra');
      pushLog(state, deal.failLog);
    }
    state.pendingDeal = null;
  }

  const rdNote = applyRd(state);
  if (rdNote) pushLog(state, rdNote);

  const net = netAssetsOf(state);
  const report: SettlementReport = {
    month: state.month,
    productName: productName(productId),
    produced,
    sold,
    leftover,
    revenue,
    salaries,
    wagesPaid,
    upkeep,
    interest,
    penalty,
    netCash: roundMoney(revenue - wagesPaid - upkeep - interest - penalty),
    cash: state.cash,
    debt: state.debt,
    netAssets: net,
    rdNote,
    lines: [
      { label: '营业收入', value: revenue, tone: 'good' },
      { label: '营业成本', value: -cogs, tone: 'bad' },
      { label: '计提职工薪酬', value: -salaries, tone: 'bad' },
      { label: '厂区维护', value: -upkeep, tone: 'bad' },
      { label: '财务费用', value: -interest, tone: interest ? 'bad' : 'mute' },
      ...(wagesPaid ? [{ label: '支付上月职工薪酬', value: -wagesPaid, tone: 'bad' as const }] : []),
      ...(penalty ? [{ label: '营业外支出', value: -penalty, tone: 'bad' as const }] : []),
    ],
  };

  state.prevReport = state.lastReport;
  state.lastReport = report;
  state.closedBooks = [...state.closedBooks, snapshotBooks(state, MONTH_NAMES[state.month - 1] ?? `${state.month}月`)];
  pushLog(state, `${state.month} 月结算：售出 ${sold} 件${productName(productId)}，净现金流 ${money(report.netCash)}。`);

  if (net < 0) {
    state.endKind = 'bankrupt';
    state.phase = 'report';
    pushLog(state, '净资产转负，银行上门封账。本局结束。');
    return state;
  }

  if (state.month >= TOTAL_MONTHS) {
    state.endKind = 'finished';
    state.phase = 'report';
    pushLog(state, '十二个月走完。账本合上，看最终评分。');
    return state;
  }

  state.phase = 'report';
  return state;
}

