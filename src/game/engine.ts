import {
  BASE_AP,
  CAP_OVERFLOW,
  CAP_PER_WORKER,
  CARDS,
  EVENTS,
  FACTORY_COST,
  FACTORY_LIFE_MONTHS,
  FACTORY_UPKEEP,
  HAND_LIMIT,
  HIRE_COST,
  INCOME_TAX_RATE,
  INTEREST_RATE,
  LOAN_PER_MACHINE,
  STATUTORY_RESERVE_CAP,
  STATUTORY_RESERVE_RATE,
  AR_TERM_MONTHS,
  AR_WRITEOFF_PAST_DUE,
  CREDIT_SALE_RATE,
  arCollectionRate,
  arCreditLossRate,
  inventoryWriteDownRate,
  MACHINE_BASE_CAP,
  MACHINE_COST,
  MACHINE_LIFE_MONTHS,
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
import {
  BASIC_PENALTY,
  CHALLENGE_POINTS,
  CLIMATES,
  QUARTER_LABEL,
  basicGoalOf,
  climateById,
  emptyQuarterStats,
  goalById,
  q3ProcurementFree,
  quarterOf,
} from './board';
import { MONTH_NAMES, ROLE_LABEL, materialName, money, productName, roundMoney } from './format';
import type {
  CardInstance,
  DeptId,
  GameAction,
  GameState,
  MaterialId,
  Materials,
  Modifiers,
  MonthBooks,
  MonthLedger,
  ProductId,
  ReceivableLot,
  Role,
  SettlementLine,
  SettlementReport,
  Staff,
  StockLayer,
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
    collectionBonus: 0,
    creditSaleRate: 0,
    arTermExtra: 0,
    stockAgeBias: 0,
  };
}

export function totalStaff(staff: Staff): number {
  return staff.production + staff.management + staff.sales + staff.rd;
}

export function maxApFor(staff: Staff): number {
  return BASE_AP + Math.floor(staff.management / 2);
}

function openingDemand(base: number, sales: number): number {
  return Math.max(5, Math.round((base * (1 + sales * 0.1)) / 5) * 5);
}

export function hireEffectLines(state: GameState, role: Role): string[] {
  const card = `${ROLE_LABEL[role]}人员越多，翻开的决策卡越容易出${ROLE_LABEL[role]}花色。`;
  if (role === 'production') {
    const next = { ...state, staff: { ...state.staff, production: state.staff.production + 1 } };
    const before = capacityOf(state);
    const after = capacityOf(next);
    const slots = state.machines * WORKERS_PER_MACHINE;
    const overflow = Math.max(0, next.staff.production - slots);
    return [
      `本月立刻到岗。设备位内每人产能 +${CAP_PER_WORKER}，超出每人 +${CAP_OVERFLOW}。`,
      `本次入职：产能 ${before} → ${after}（可安置 ${slots} 人${overflow ? `，超编 ${overflow} 人` : ''}）。`,
      card,
    ];
  }
  if (role === 'management') {
    const before = maxApFor(state.staff);
    const after = maxApFor({ ...state.staff, management: state.staff.management + 1 });
    const apLine =
      after > before
        ? `本次入职：行动点上限 ${before} → ${after}。本月剩余行动点不补发，下月按新上限刷新。`
        : `本次入职：行动点上限仍为 ${before}。再招 1 名管理后升到 ${before + 1}。`;
    return [`每 2 名管理人员提供 1 点行动点上限（基础 ${BASE_AP} 点）。`, apLine, card];
  }
  if (role === 'sales') {
    const from = state.staff.sales;
    const to = from + 1;
    const shifts = PRODUCTS.filter((item) => state.unlockedProducts.includes(item.id))
      .map((item) => {
        const a = openingDemand(item.baseDemand, from);
        const b = openingDemand(item.baseDemand, to);
        return a === b ? null : `${item.name} ${a} → ${b} 件`;
      })
      .filter((item): item is string => Boolean(item));
    const shiftLine = shifts.length
      ? `本次入职，开盘口径 ${shifts.join('，')}。本月已开订单不重算。`
      : `本次入职：现有产品开盘口径暂无变化（取整到 5 件）。本月已开订单不重算。`;
    return [
      `每名销售使开盘需求相对基准 +10%（取整到 5 件）；新品上市需求 +12%。`,
      shiftLine,
      card,
    ];
  }
  const from = state.staff.rd;
  const to = from + 1;
  const remain = Math.max(0, RD_THRESHOLD - state.rdProgress);
  return [
    `本月结算按在职人数推进，每人 +1 点；累计 ${RD_THRESHOLD} 点解锁一档产品或特种料。`,
    `本次入职：本月推进 ${from} → ${to} 点。当前进度 ${state.rdProgress}/${RD_THRESHOLD}，距下一档 ${remain} 点。`,
    card,
  ];
}

export function loanLimit(machines: number): number {
  return machines * LOAN_PER_MACHINE;
}

export function monthlyInterest(debt: number): number {
  return debt > 0 ? roundMoney(debt * INTEREST_RATE) : 0;
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

export function bomBookCost(state: GameState, id: ProductId): number {
  const bom = productById(id).bom;
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
      (ledger.creditImpairment ?? 0) -
      (ledger.assetImpairment ?? 0),
  );
}

export function profitBeforeTaxOf(ledger: MonthLedger): number {
  return roundMoney(operatingProfitOf(ledger) + ledger.extraIncome - ledger.extraExpense);
}

export function netProfitOf(ledger: MonthLedger): number {
  return roundMoney(profitBeforeTaxOf(ledger) - (ledger.incomeTax ?? 0));
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

export function monthOutlook(state: GameState): string {
  const cap = capacityOf(state);
  if (state.pendingDeal) {
    const deal = state.pendingDeal;
    const can = maxProduce(state, deal.productId) + (state.finished[deal.productId] ?? 0);
    const name = productName(deal.productId);
    if (can >= deal.minSold) {
      return `合同要求 ${name} ${deal.minSold} 件，当前可交 ${can} 件。本月可以交单。`;
    }
    return `合同要求 ${name} ${deal.minSold} 件，当前可交 ${can} 件。本月可能欠单。`;
  }
  const id = state.unlockedProducts.includes('basic') ? 'basic' : state.unlockedProducts[0];
  if (!id) return `本月产能 ${cap}。`;
  const demand = demandOf(state, id);
  const can = maxProduce(state, id);
  const name = productName(id);
  if (can <= 0) return `产能 ${cap}，${name} 需求 ${demand}，原料不够，本月可能交不出货。`;
  if (can < demand) return `产能 ${cap}，${name} 需求 ${demand}，当前可产 ${can}。本月可能欠单。`;
  return `产能 ${cap}，${name} 需求 ${demand}，当前可产 ${can}。`;
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
  const matGross = materialValue(state);
  const fgGross = finishedValue(state);
  const invGross = roundMoney(matGross + fgGross);
  const prov = state.inventoryProvision ?? 0;
  const matProv = invGross > 0 ? roundMoney(prov * (matGross / invGross)) : 0;
  const fgProv = roundMoney(prov - matProv);
  return roundMoney(
    state.cash +
      receivablesNet(state) +
      Math.max(0, matGross - matProv) * 0.5 +
      wipValue(state) +
      Math.max(0, fgGross - fgProv) +
      bookAssets(state) -
      state.debt -
      state.wagesPayable -
      (state.taxPayable ?? 0),
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
    rd: 0,
    creditImpairment: 0,
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
  (['production', 'management', 'sales', 'rd'] as Role[]).forEach((role) => {
    const need = roundMoney(state.staff[role] * SALARY[role]);
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
    state.debt = roundMoney(state.debt + n);
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
}

function notePeakCash(state: GameState): void {
  if (!state.quarterStats) return;
  state.quarterStats.peakCash = Math.max(state.quarterStats.peakCash, state.cash);
}

function noteStockout(state: GameState): void {
  if (!state.quarterStats) return;
  if ((state.materials.a ?? 0) <= 0 && (state.materials.b ?? 0) <= 0) {
    state.quarterStats.stockoutAB = true;
  }
}

function settleQuarter(state: GameState, quarter: 1 | 2 | 3 | 4): void {
  if (state.boardHistory.some((item) => item.quarter === quarter)) return;
  const basic = basicGoalOf(quarter);
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
  state.basicGoalId = basicGoalOf(quarter).id;
  state.challengeGoalIds = [];
  state.challengeDraft = [];
  state.quarterStats = emptyQuarterStats(totalStaff(state.staff), state.debt);
  state.quarterStats.peakCash = Math.max(0, state.cash);
  state.phase = 'board';
}

function emptyWageAccrual(): Record<Role, number> {
  return { production: 0, management: 0, sales: 0, rd: 0 };
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

function creditSaleRateOf(state: GameState): number {
  if ((state.modifiers?.creditSaleRate ?? 0) > 0) return Math.min(1, state.modifiers.creditSaleRate);
  return CREDIT_SALE_RATE;
}

function arTermOf(state: GameState): number {
  return AR_TERM_MONTHS + (state.modifiers?.arTermExtra ?? 0);
}

function overdueAmount(state: GameState): number {
  return roundMoney(
    (state.receivables ?? []).reduce((sum, lot) => (state.month - lot.dueMonth >= 1 ? sum + lot.amount : sum), 0),
  );
}

export function arOverdueOf(state: GameState): number {
  return overdueAmount(state);
}

function targetBadDebtProvision(state: GameState): number {
  return roundMoney(
    (state.receivables ?? []).reduce((sum, lot) => {
      const past = state.month - lot.dueMonth;
      return sum + lot.amount * arCreditLossRate(past);
    }, 0),
  );
}

function remeasureBadDebt(state: GameState): number {
  const target = Math.min(targetBadDebtProvision(state), receivablesGross(state));
  const delta = roundMoney(target - (state.badDebtProvision ?? 0));
  state.badDebtProvision = target;
  if (delta !== 0) state.ledger.creditImpairment = roundMoney((state.ledger.creditImpairment ?? 0) + delta);
  return delta;
}

function collectReceivables(state: GameState, bonus = 0, dueAndOverdueOnly = true): number {
  if (!state.receivables) state.receivables = [];
  let collected = 0;
  const kept: ReceivableLot[] = [];
  for (const lot of state.receivables) {
    const past = state.month - lot.dueMonth;
    if (dueAndOverdueOnly && past < 0) {
      kept.push(lot);
      continue;
    }
    const rate = Math.min(1, Math.max(0, arCollectionRate(past) + bonus));
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
    if (past >= AR_WRITEOFF_PAST_DUE) {
      written = roundMoney(written + lot.amount);
      state.ledger.creditImpairment = roundMoney((state.ledger.creditImpairment ?? 0) + lot.amount);
    } else {
      kept.push(lot);
    }
  }
  state.receivables = kept;
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
  if (typeof state.inventoryProvision !== 'number') state.inventoryProvision = 0;
  if (typeof state.badDebtProvision !== 'number') state.badDebtProvision = 0;
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

export function nextCardBuyAp(state: GameState): number {
  return state.cardsBoughtThisMonth ?? 0;
}

function nextUid(state: GameState): string {
  state.uidSeq += 1;
  return `c${state.uidSeq}`;
}

function rollMarket(state: GameState, firstMonth: boolean): void {
  const climate = climateById(state.climateId);
  for (const mat of MATERIALS) {
    if (mat.id === 'd' && !state.materialDUnlocked) {
      state.materialPrices.d = mat.basePrice;
      continue;
    }
    if (firstMonth) {
      state.materialPrices[mat.id] = mat.basePrice;
      continue;
    }
    let step = pick([-0.1, 0, 0.1]);
    if (climate.id === 'steel' && mat.id === 'a') step += 0.1;
    if (climate.id === 'chip' && mat.id === 'c') step += 0.2;
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
    let step = pick([-0.2, 0, 0.2]);
    if (climate.id === 'priceWar') step -= 0.2;
    state.productPrices[product.id] = roundPrice(
      clamp(
        (state.productPrices[product.id] ?? product.basePrice) + step,
        roundMoney(product.basePrice * 0.5),
        roundMoney(product.basePrice * 1.5),
      ),
    );
    let demandStep = pick([-5, 0, 5]);
    if (climate.id === 'channel') demandStep += 5;
    state.demand[product.id] = Math.max(
      5,
      Math.round(((state.demand[product.id] ?? product.baseDemand) + demandStep) / 5) * 5,
    );
  }
}

function pickEvent(state: GameState): string {
  const climate = climateById(state.climateId);
  let pool = EVENTS.filter((event) => !state.usedEventIds.includes(event.id));
  if (climate.id !== 'channel') {
    pool = pool.filter((event) => event.id !== 'bigOrder' && event.id !== 'rushOrder');
  }
  if (pool.length === 0) {
    pool = climate.id === 'channel' ? [...EVENTS] : EVENTS.filter((event) => event.id !== 'bigOrder' && event.id !== 'rushOrder');
  }
  const weighted = pool.flatMap((event) => {
    const extra = climate.eventIds.includes(event.id) ? 3 : 0;
    return Array.from({ length: Math.max(1, (event.weight ?? 1) + extra) }, () => event.id);
  });
  return pick(weighted);
}

function takeMaterial(state: GameState, id: MaterialId, qty: number): number {
  const lost = takeMaterialCost(state, id, qty);
  writeOffInventoryLoss(state, lost.cost);
  remeasureInventoryProvision(state);
  return lost.qty;
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
  state.wagesAccruedByRole = emptyWageAccrual();
  state.ledger.openingCash = state.cash;
  state.depreciableMachineGross = state.machineGross ?? 0;
  state.depreciableFactoryGross = state.factoryGross ?? 0;
  state.cardsUnlocked = cardsUnlockedNow(state);
  state.maxAp = maxApFor(state.staff);
  state.ap = state.maxAp;
  rollMarket(state, firstMonth);
  state.eventId = pickEvent(state);
  state.eventNote = null;
  state.phase = 'briefing';
}

function consumeBom(state: GameState, id: ProductId, count: number): number {
  const bom = productById(id).bom;
  let cost = 0;
  for (const key of MATERIAL_IDS) {
    const need = (bom[key] ?? 0) * count;
    if (need <= 0) continue;
    const lost = takeMaterialCost(state, key, need);
    cost = roundMoney(cost + lost.cost);
  }
  state.wip = roundMoney((state.wip ?? 0) + cost);
  return cost;
}

function accrueDepreciation(state: GameState): number {
  const machineNbv = Math.max(0, (state.machineGross ?? 0) - (state.accumDepMachines ?? 0));
  const factoryNbv = Math.max(0, (state.factoryGross ?? 0) - (state.accumDepFactories ?? 0));
  const machineDep = roundMoney(Math.min((state.depreciableMachineGross ?? 0) / MACHINE_LIFE_MONTHS, machineNbv));
  const factoryDep = roundMoney(Math.min((state.depreciableFactoryGross ?? 0) / FACTORY_LIFE_MONTHS, factoryNbv));
  state.accumDepMachines = roundMoney((state.accumDepMachines ?? 0) + machineDep);
  state.accumDepFactories = roundMoney((state.accumDepFactories ?? 0) + factoryDep);
  return roundMoney(machineDep + factoryDep);
}

function chargeAdmin(state: GameState, amount: number): void {
  const n = roundMoney(amount);
  if (n <= 0) return;
  state.ledger.admin = roundMoney(state.ledger.admin + n);
}

function sellFinished(
  state: GameState,
  productId: ProductId,
  produced: number,
): { sold: number; leftover: number; cogs: number } {
  ensureImpairmentState(state);
  if (produced > 0) {
    const addedCost = state.wip ?? 0;
    state.wip = 0;
    state.finishedLayers[productId] = addLayer(state.finishedLayers[productId], produced, addedCost, state.month);
  }
  syncFinishedBooks(state);
  const stockQty = state.finished[productId] ?? 0;
  const sold = Math.min(stockQty, demandOf(state, productId));
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
  push('减：信用减值损失', -(ledger.creditImpairment ?? 0), (ledger.creditImpairment ?? 0) >= 0 ? 'bad' : 'good');
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
      noteDept(state, 'store', `折价清库，成品按七折变现 ${money(cash)}`);
      return `成品账面 ${money(gross)} 按七折变现 ${money(cash)}，库龄清掉。`;
    }
    case 'collect': {
      ensureImpairmentState(state);
      const collected = collectReceivables(state, 1, true);
      remeasureBadDebt(state);
      if (collected <= 0) return '没有到期或逾期的应收账款可催。';
      noteDept(state, 'finance', `催收到账 ${money(collected)}`);
      return `催收到账 ${money(collected)}。`;
    }
    case 'creditPush':
      state.modifiers.extraDemand += 12;
      state.modifiers.creditSaleRate = 1;
      state.modifiers.arTermExtra = Math.max(state.modifiers.arTermExtra, 1);
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
    case 'quality': {
      pay(state, 4, 'extra');
      ensureImpairmentState(state);
      const finishedLoss = finishedValue(state);
      writeOffInventoryLoss(state, finishedLoss);
      state.finished = {};
      state.finishedCost = {};
      state.finishedLayers = {};
      remeasureInventoryProvision(state);
      state.modifiers.extraDemand -= 8;
      bits.push('罚款 4 万已划走');
      bits.push('成品库存清零，本月需求 -8');
      break;
    }
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
          if (state.quarterStats) state.quarterStats.repaid = true;
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
      bits.push(`全部应收到期日推迟 1 个月${delta ? `，信用减值 ${money(delta)}` : ''}`);
      break;
    }
    case 'customerBreak': {
      ensureImpairmentState(state);
      if (!state.receivables.length) {
        bits.push('账上暂无应收账款可核销');
        break;
      }
      const overdue = state.receivables.filter((lot) => state.month - lot.dueMonth >= 1);
      const pool = overdue.length ? overdue : state.receivables;
      const target = [...pool].sort((a, b) => b.amount - a.amount)[0]!;
      const write = overdue.length ? target.amount : roundMoney(target.amount * 0.5);
      target.amount = roundMoney(target.amount - write);
      state.ledger.creditImpairment = roundMoney((state.ledger.creditImpairment ?? 0) + write);
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
  const materials = { a: 16, b: 8, c: 2, d: 0 };
  const state: GameState = {
    phase: 'title',
    month: 1,
    cash: 24,
    debt: 0,
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
    staff: { production: 2, management: 1, sales: 1, rd: 0 },
    materials,
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
    quarter: 1,
    climateId: 'steel',
    basicGoalId: 'q1-net20',
    challengeGoalIds: [],
    challengeDraft: [],
    boardHistory: [],
    boardMinutes: null,
    quarterStats: emptyQuarterStats(4, 0),
    usedClimateIds: [],
  };
  state.paidInCapital = netAssetsOf(state);
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
  if (!Array.isArray(state.milestones)) state.milestones = [];
  if (typeof state.eventNote !== 'string' && state.eventNote !== null) state.eventNote = null;
  if (!Array.isArray(state.boardHistory)) state.boardHistory = [];
  if (!Array.isArray(state.challengeGoalIds)) state.challengeGoalIds = [];
  if (!Array.isArray(state.challengeDraft)) state.challengeDraft = [];
  if (!Array.isArray(state.usedClimateIds)) state.usedClimateIds = [];
  if (!state.quarterStats) state.quarterStats = emptyQuarterStats(totalStaff(state.staff), state.debt);

  switch (action.type) {
    case 'TOGGLE_BOARD_GOAL': {
      if (state.phase !== 'board') return prev;
      const id = action.id;
      const allowed = goalById(id);
      if (allowed.kind !== 'challenge' || allowed.quarter !== state.quarter) return prev;
      if (state.challengeDraft.includes(id)) {
        state.challengeDraft = state.challengeDraft.filter((item) => item !== id);
      } else if (state.challengeDraft.length < 2) {
        state.challengeDraft = [...state.challengeDraft, id];
      }
      return state;
    }

    case 'CONFIRM_BOARD': {
      if (state.phase !== 'board' || state.challengeDraft.length !== 2) return prev;
      state.challengeGoalIds = [...state.challengeDraft];
      const firstMonth = state.month === 1 && !state.lastReport;
      prepareMonth(state, firstMonth);
      syncMonthWages(state);
      const climate = climateById(state.climateId);
      const picked = state.challengeGoalIds.map((id) => `「${goalById(id).name}」`).join('、');
      pushLog(
        state,
        `${QUARTER_LABEL[state.quarter]}决议：基本目标「${goalById(state.basicGoalId).name}」；挑战目标${picked}。${climate.headline}`,
      );
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
      state.machineGross = roundMoney((state.machineGross ?? 0) + MACHINE_COST);
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
      state.factoryGross = roundMoney((state.factoryGross ?? 0) + FACTORY_COST);
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
      accrueRoleWages(state, action.role, SALARY[action.role]);
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
      if (!q3ProcurementFree(state.month) && !spendAp(state)) {
        pushLog(state, '行动点不足。');
        return state;
      }
      pay(state, cost, 'buy');
      state.materialLayers[action.material] = addLayer(
        state.materialLayers[action.material],
        action.qty,
        cost,
        state.month,
      );
      syncMaterialBooks(state);
      const off = Math.round(state.modifiers.nextBuyDiscount * 100);
      const buyNote = off > 0
        ? `采购${materialName(action.material)} ${action.qty}件，花费 ${money(cost)}（${100 - off}折）`
        : q3ProcurementFree(state.month)
          ? `采购${materialName(action.material)} ${action.qty}件，花费 ${money(cost)}，本季采购不耗 AP`
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
      const interest = monthlyInterest(state.debt);
      noteDept(state, 'finance', `借入 ${money(amount)}，负债现为 ${money(state.debt)}`);
      pushLog(
        state,
        `放款 ${money(amount)}。负债 ${money(state.debt)} / 上限 ${money(loanLimit(state.machines))}。月末将计提财务费用 ${money(interest)}。`,
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
      state.debt = roundMoney(state.debt - amount);
      if (state.quarterStats) state.quarterStats.repaid = true;
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
      if (state.quarterStats) state.quarterStats.playedCard = true;
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
      state.deptActs.sales = state.deptActs.sales.filter((line) => !line.startsWith('转入排产') && !line.startsWith('选定'));
      noteDept(state, 'sales', '转入排产');
      if (state.selectedProduct) {
        noteDept(state, 'sales', `选定${productName(state.selectedProduct)}`);
      }
      return state;

    case 'BACK_TO_ACTIONS':
      if (state.phase !== 'produce') return prev;
      state.phase = 'actions';
      state.deptActs.sales = state.deptActs.sales.filter((line) => !line.startsWith('转入排产'));
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
      if (state.month === 4 || state.month === 7 || state.month === 10) {
        beginQuarter(state, quarterOf(state.month));
        return state;
      }
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
  const salaries = syncMonthWages(state);
  const produced = maxProduce(state, productId);
  if (produced > 0) consumeBom(state, productId, produced);

  const depreciation = accrueDepreciation(state);
  const upkeep = roundMoney(state.factories * FACTORY_UPKEEP);
  if (produced > 0) {
    state.wip = roundMoney((state.wip ?? 0) + depreciation + upkeep);
    pay(state, upkeep, 'opOut');
  } else {
    chargeAdmin(state, roundMoney((state.wip ?? 0) + depreciation));
    state.wip = 0;
    pay(state, upkeep, 'admin');
  }

  const { sold, leftover, cogs } = sellFinished(state, productId, produced);
  if (state.quarterStats) {
    state.quarterStats.sold += sold;
    if (productId !== 'basic') state.quarterStats.nonBasic = true;
    if (productId === 'premium' || productId === 'special') state.quarterStats.premiumOrSpecial = true;
  }
  const revenue = roundMoney(sold * sellPriceOf(state, productId));
  const cfSalesBefore = state.ledger.cfSales;
  const sale = recognizeSale(state, revenue);
  collectReceivables(state, state.modifiers.collectionBonus ?? 0, true);
  writeOffAgedReceivables(state);
  remeasureInventoryProvision(state);
  remeasureBadDebt(state);

  const wagesPaid = roundMoney(state.wagesPayable - salaries);
  payAccruedWages(state, wagesPaid);
  const interest = monthlyInterest(state.debt);
  pay(state, interest, 'finance');
  if (state.quarterStats && revenue >= salaries + upkeep) {
    state.quarterStats.coveringMonth = true;
  }

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

  const taxPaid = settleIncomeTax(state);
  const netProfit = netProfitOf(state.ledger);
  const reserve = appropriateStatutoryReserve(state, netProfit);
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
    netCash: roundMoney(state.ledger.cfSales - cfSalesBefore - wagesPaid - upkeep - interest - penalty - taxPaid),
    cash: state.cash,
    debt: state.debt,
    netAssets: net,
    rdNote,
    lines: pnlSettlementLines(state.ledger, reserve),
  };

  state.prevReport = state.lastReport;
  state.lastReport = report;
  state.closedBooks = [...state.closedBooks, snapshotBooks(state, MONTH_NAMES[state.month - 1] ?? `${state.month}月`)];
  pushLog(
    state,
    `${state.month} 月结算：售出 ${sold} 件${productName(productId)}，现销 ${money(sale.cash)}，赊销 ${money(sale.credit)}，账面成本 ${money(cogs)}，净利润 ${money(netProfit)}。`,
  );

  if (net < 0) {
    state.endKind = 'bankrupt';
    state.phase = 'report';
    settleQuarter(state, state.quarter);
    pushLog(state, '净资产转负，银行上门封账。本局结束。');
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

