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
import { ROLE_LABEL, money, productName } from './format';
import type {
  CardInstance,
  GameAction,
  GameState,
  Modifiers,
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
  return Math.max(1, Math.round(n * 10) / 10);
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

function totalStaff(staff: Staff): number {
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
  return Math.round(
    (state.cash + materialValue(state) + finishedValue(state) + bookAssets(state) - state.debt) * 10,
  ) / 10;
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
  state.log = [line, ...state.log].slice(0, 18);
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
    const swing = 1 + (Math.random() - 0.5) * 0.28;
    state.materialPrices[mat.id] = roundPrice(
      clamp(state.materialPrices[mat.id] * swing, mat.basePrice * 0.65, mat.basePrice * 1.7),
    );
  }

  for (const product of PRODUCTS) {
    if (!state.unlockedProducts.includes(product.id)) continue;
    const salesBoost = 1 + state.staff.sales * 0.12;
    if (firstMonth) {
      state.productPrices[product.id] = product.basePrice;
      state.demand[product.id] = Math.round(product.baseDemand * salesBoost);
      continue;
    }
    const priceSwing = 1 + (Math.random() - 0.5) * 0.22;
    const demandSwing = 1 + (Math.random() - 0.5) * 0.3;
    state.productPrices[product.id] = roundPrice(
      clamp(
        (state.productPrices[product.id] ?? product.basePrice) * priceSwing,
        product.basePrice * 0.7,
        product.basePrice * 1.55,
      ),
    );
    state.demand[product.id] = Math.max(
      4,
      Math.round((state.demand[product.id] ?? product.baseDemand) * demandSwing * (0.92 + state.staff.sales * 0.04)),
    );
  }
}

function pickEvent(state: GameState): string {
  const unused = EVENTS.filter((event) => !state.usedEventIds.includes(event.id));
  const pool = unused.length > 0 ? unused : EVENTS;
  return pick(pool).id;
}

function prepareMonth(state: GameState, firstMonth: boolean): void {
  state.modifiers = emptyModifiers();
  state.shop = [];
  state.shopDrawn = false;
  state.selectedProduct = null;
  state.supermarketDeal = false;
  state.cardsUnlocked = cardsUnlockedNow(state);
  state.maxAp = maxApFor(state.staff);
  state.ap = state.maxAp;
  rollMarket(state, firstMonth);
  state.eventId = pickEvent(state);
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
      state.modifiers.extraCapacity += 12;
      break;
    case 'kaizen':
      state.modifiers.extraCapacity += 6;
      state.modifiers.nextBuyDiscount = Math.max(state.modifiers.nextBuyDiscount, 0.1);
      break;
    case 'lean':
      state.ap += 1;
      state.maxAp += 1;
      break;
    case 'bulk':
      state.modifiers.nextBuyDiscount = Math.max(state.modifiers.nextBuyDiscount, 0.25);
      break;
    case 'client':
      state.modifiers.extraDemand += 16;
      break;
    case 'premiumPush':
      state.modifiers.priceBonus += 0.18;
      break;
    case 'labRush':
      state.rdProgress += 1;
      break;
    case 'bridge':
      state.cash += 60;
      state.debt += 60;
      break;
    default:
      break;
  }
  return cardById(defId).playText;
}

function applyEvent(state: GameState, choice: number): void {
  const event = eventById(state.eventId!);
  const pickChoice = event.choices[choice] ?? event.choices[0]!;

  switch (event.id) {
    case 'lockPrice':
      if (choice === 0) {
        state.cash -= 40;
        state.materialPrices.a = roundPrice(state.materialPrices.a * 0.8);
      } else {
        state.materialPrices.a = roundPrice(state.materialPrices.a * 1.15);
      }
      break;
    case 'bigOrder':
      if (choice === 0) {
        state.modifiers.extraDemand += 22;
        state.demand.basic = (state.demand.basic ?? 0) + 8;
        state.supermarketDeal = true;
        pushLog(state, '【隐患】超市订单已接：基础款销量需达到 16，否则赔付。');
      }
      break;
    case 'resign':
      if (choice === 0) {
        state.cash -= 30;
      } else if (state.staff.production > 0) {
        state.staff.production -= 1;
        state.cash += 12;
      }
      break;
    case 'banker':
      if (choice === 0) {
        state.cash += 80;
        state.debt += 80;
      }
      break;
    case 'quality':
      if (choice === 0) {
        state.cash -= 25;
      } else if (Math.random() < 0.5) {
        state.cash -= 70;
        pushLog(state, '抽检抽中不合格批次，罚款到账。');
      } else {
        pushLog(state, '抽检没抽到你们。运气也是经营的一部分。');
      }
      break;
    case 'dump':
      if (choice === 0) {
        state.modifiers.priceBonus -= 0.12;
        state.modifiers.extraDemand += 10;
      } else {
        state.modifiers.extraDemand -= 8;
      }
      break;
    case 'subsidy':
      if (choice === 0) {
        state.cash += 60;
      } else {
        state.cash += 30;
        state.staff.sales += 1;
      }
      break;
    case 'blackout':
      if (choice === 0) {
        state.cash -= 35;
      } else {
        state.modifiers.extraCapacity -= 10;
      }
      break;
    case 'influencer':
      if (choice === 0) {
        state.cash -= 20;
        state.modifiers.extraDemand += 14;
        state.modifiers.priceBonus += 0.06;
      }
      break;
    case 'tax':
      if (choice === 0) {
        state.cash -= 40;
      } else {
        state.cash -= 15;
        state.modifiers.nextBuyDiscount = Math.max(state.modifiers.nextBuyDiscount, 0.1);
      }
      break;
    case 'poach':
      if (choice === 0) {
        state.cash -= 30;
        if (state.staff.rd > 0) state.rdProgress += 1;
      } else {
        state.cash -= 10;
        state.rdProgress += 1;
      }
      break;
    case 'yearEnd':
      if (choice === 0) {
        state.modifiers.extraDemand += 18;
        state.modifiers.priceBonus -= 0.05;
      }
      break;
    default:
      break;
  }

  state.usedEventIds = [...state.usedEventIds, event.id].slice(-EVENTS.length);
  state.maxAp = maxApFor(state.staff);
  pushLog(state, `事件「${event.title}」：${pickChoice.label}。`);
}

export function createInitialState(): GameState {
  return {
    phase: 'title',
    month: 1,
    cash: 360,
    debt: 0,
    ap: BASE_AP,
    maxAp: BASE_AP,
    factories: 1,
    slots: SLOTS_PER_FACTORY,
    machines: 1,
    staff: { production: 2, management: 1, sales: 1, rd: 0 },
    materials: { a: 40, b: 24, c: 8, d: 0 },
    finished: {},
    materialPrices: { a: 2, b: 3, c: 8, d: 11 },
    productPrices: { basic: 14, standard: 28, premium: 38 },
    demand: { basic: 54, standard: 29, premium: 13 },
    unlockedProducts: ['basic', 'standard', 'premium'],
    materialDUnlocked: false,
    rdProgress: 0,
    rdUnlockIndex: 0,
    cardsUnlocked: false,
    shop: [],
    shopDrawn: false,
    hand: [],
    modifiers: emptyModifiers(),
    eventId: null,
    usedEventIds: [],
    selectedProduct: null,
    lastReport: null,
    log: ['北港制造开业。账上有启动资金，库里有第一批料。'],
    endKind: null,
    uidSeq: 0,
    supermarketDeal: false,
  };
}

function startGame(prev: GameState): GameState {
  const state = createInitialState();
  state.uidSeq = prev.uidSeq;
  prepareMonth(state, true);
  pushLog(state, '第一份行业月报已放在桌上。先看行情，再应对事件。');
  return state;
}

export function reduce(prev: GameState, action: GameAction): GameState {
  if (action.type === 'START_GAME' || action.type === 'RESTART') {
    return startGame(prev);
  }

  const state = clone(prev);

  switch (action.type) {
    case 'CONFIRM_BRIEFING':
      if (state.phase !== 'briefing') return prev;
      state.phase = 'event';
      return state;

    case 'RESOLVE_EVENT': {
      if (state.phase !== 'event' || !state.eventId) return prev;
      applyEvent(state, action.choice);
      state.phase = 'actions';
      state.ap = maxApFor(state.staff);
      state.maxAp = state.ap;
      if (cardsUnlockedNow(state) && !state.cardsUnlocked) {
        state.cardsUnlocked = true;
        pushLog(state, '决策卡已解锁：本月可免费翻牌，再花钱选购。');
      }
      state.cardsUnlocked = cardsUnlockedNow(state);
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
      state.cash -= MACHINE_COST;
      state.machines += 1;
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
      state.cash -= FACTORY_COST;
      state.factories += 1;
      state.slots += SLOTS_PER_FACTORY;
      pushLog(state, `新厂区开工。机位 ${state.slots}，月维护上调。`);
      return state;
    }

    case 'HIRE': {
      if (state.phase !== 'actions') return prev;
      if (state.cash < HIRE_COST) {
        pushLog(state, '招聘保证金不足。');
        return state;
      }
      if (!spendAp(state)) {
        pushLog(state, '行动点不足。');
        return state;
      }
      state.cash -= HIRE_COST;
      state.staff[action.role] += 1;
      state.maxAp = maxApFor(state.staff);
      pushLog(state, `新同事入职：${ROLE_LABEL[action.role]}。编制 ${totalStaff(state.staff)} 人。`);
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
      state.cash -= cost;
      state.materials[action.material] += action.qty;
      if (state.modifiers.nextBuyDiscount > 0) {
        pushLog(state, `集采折扣已使用（${Math.round(state.modifiers.nextBuyDiscount * 100)}% off）。`);
        state.modifiers.nextBuyDiscount = 0;
      }
      pushLog(state, `入库 ${action.qty} 件原料，花费 ${money(cost)}。`);
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
      state.cash += amount;
      state.debt += amount;
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
      state.cash -= amount;
      state.debt -= amount;
      pushLog(state, `还款 ${money(amount)}。剩余负债 ${money(state.debt)}。`);
      return state;
    }

    case 'DRAW_SHOP': {
      if (state.phase !== 'actions' || !state.cardsUnlocked || state.shopDrawn) return prev;
      state.shop = [rollCard(state), rollCard(state), rollCard(state)];
      state.shopDrawn = true;
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
      state.cash -= cost;
      state.hand.push(card);
      state.shop.splice(action.index, 1);
      pushLog(state, `购入「${cardById(card.defId).name}」。`);
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
      const text = playCardEffect(state, card!.defId);
      pushLog(state, text);
      return state;
    }

    case 'GO_PRODUCE':
      if (state.phase !== 'actions') return prev;
      state.phase = 'produce';
      if (!state.selectedProduct) {
        state.selectedProduct = state.unlockedProducts.find((id) => maxProduce(state, id) > 0) ?? state.unlockedProducts[0] ?? null;
      }
      return state;

    case 'SELECT_PRODUCT':
      if (state.phase !== 'produce') return prev;
      if (!state.unlockedProducts.includes(action.id)) return prev;
      state.selectedProduct = action.id;
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
      pushLog(state, `${state.month} 月行情已更新。`);
      return state;

    default:
      return prev;
  }
}

function settleMonth(state: GameState): GameState {
  const productId = state.selectedProduct!;
  const produced = maxProduce(state, productId);
  consumeBom(state, productId, produced);
  const stock = (state.finished[productId] ?? 0) + produced;
  const sold = Math.min(stock, demandOf(state, productId));
  const leftover = stock - sold;
  state.finished[productId] = leftover;
  const revenue = roundPrice(sold * sellPriceOf(state, productId));
  state.cash += revenue;

  const salaries = monthlySalary(state.staff);
  const upkeep = state.factories * FACTORY_UPKEEP;
  const interest = state.debt > 0 ? Math.max(1, Math.round(state.debt * INTEREST_RATE)) : 0;
  state.cash -= salaries + upkeep + interest;

  let penalty = 0;
  if (state.supermarketDeal) {
    if (productId === 'basic' && sold >= 16) {
      pushLog(state, '超市订单按量交付，渠道留下好印象。');
    } else {
      penalty = 50;
      state.cash -= penalty;
      pushLog(state, '超市订单未能交付，违约金已扣。');
    }
    state.supermarketDeal = false;
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
    upkeep,
    interest,
    netCash: revenue - salaries - upkeep - interest - penalty,
    cash: state.cash,
    debt: state.debt,
    netAssets: net,
    rdNote,
    lines: [
      { label: '销售收入', value: revenue, tone: 'good' },
      { label: '工资', value: -salaries, tone: 'bad' },
      { label: '厂区维护', value: -upkeep, tone: 'bad' },
      { label: '利息', value: -interest, tone: interest ? 'bad' : 'mute' },
      ...(penalty ? [{ label: '违约金', value: -penalty, tone: 'bad' as const }] : []),
    ],
  };

  state.lastReport = report;
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

