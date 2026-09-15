import { createInitialState, equityAccounts, netAssetsOf, netProfitOf, reduce } from '../src/game/engine';
import { goalById } from '../src/game/board';
import { roundMoney } from '../src/game/format';
import type { GameState } from '../src/game/types';

function assert(cond: boolean, message: string): void {
  if (!cond) throw new Error(message);
}

function checkBalance(state: GameState, label: string): void {
  const inventory =
    (state.materialCost?.a ?? 0) +
    (state.materialCost?.b ?? 0) +
    (state.materialCost?.c ?? 0) +
    (state.materialCost?.d ?? 0) +
    (state.wip ?? 0) +
    Object.values(state.finishedCost ?? {}).reduce((sum, n) => sum + (n ?? 0), 0);
  const ar = (state.receivables ?? []).reduce((sum, lot) => sum + lot.amount, 0);
  const assets = roundMoney(
    state.cash +
      ar -
      (state.badDebtProvision ?? 0) +
      inventory -
      (state.inventoryProvision ?? 0) +
      (state.machineGross ?? 0) +
      (state.factoryGross ?? 0) -
      (state.accumDepMachines ?? 0) -
      (state.accumDepFactories ?? 0),
  );
  const equity = netAssetsOf(state);
  const liab = roundMoney(state.debt + state.wagesPayable + (state.taxPayable ?? 0));
  assert(Math.abs(assets - roundMoney(liab + equity)) < 1e-6, `${label} 资产负债不平：资产 ${assets}，负债 ${liab}，权益 ${equity}`);
  const accounts = equityAccounts(state);
  assert(Math.abs(roundMoney(accounts.paidIn + accounts.surplus + accounts.retained) - accounts.total) < 1e-6, `${label} 权益分项不平`);
}

function checkBoardVariety(): void {
  const deals = Array.from({ length: 12 }, () => reduce(createInitialState(), { type: 'START_GAME' }));
  const basics = new Set(deals.map((state) => state.basicGoalId));
  const pools = deals.map((state) => state.challengePoolIds.join('|'));
  assert(deals.every((state) => state.challengePoolIds.length === 4), '每季挑战议题应为 4 条');
  assert(
    deals.every((state) => new Set(state.challengePoolIds.map((id) => goalById(id).axis)).size === 4),
    '四条挑战议题应分属不同经营轴',
  );
  assert(basics.size >= 2 || new Set(pools).size >= 2, '开局目标组合应出现差异');
}

function checkMarketQuotes(): void {
  let state = reduce(createInitialState(), { type: 'START_GAME' });
  assert(typeof state.marketTrend?.materials.a === 'number', '开季应写下行情定调');
  const ids = (state.challengePoolIds ?? []).slice(0, 2);
  assert(ids.length === 2, '开局应发出四选二议题');
  for (const id of ids) state = reduce(state, { type: 'TOGGLE_BOARD_GOAL', id });
  state = reduce(state, { type: 'CONFIRM_BOARD' });
  assert(state.phase === 'briefing', '确认目标后应进入月报');
  const diffA = Math.abs(state.materialPrices.a - state.prevMaterialPrices.a);
  assert(diffA < 0.05 || Math.abs(diffA - 0.1) < 1e-6, `钢材月度台阶应为 0 或 0.1，实际 ${diffA}`);
  const basic = state.productPrices.basic ?? 1.5;
  const prevBasic = state.prevProductPrices.basic ?? 1.5;
  const diffP = Math.abs(basic - prevBasic);
  assert(diffP < 0.05 || Math.abs(diffP - 0.2) < 1e-6, `基础款月度台阶应为 0 或 0.2，实际 ${diffP}`);
  assert((state.materialSpot?.a ?? 0) >= 4 && (state.materialSpot?.a ?? 0) <= 24, `钢材现货应在 4–24，实际 ${state.materialSpot?.a}`);
  assert((state.materialSpot?.c ?? 0) <= 6, `芯片现货应不超过 6，实际 ${state.materialSpot?.c}`);
}

function checkSpotPurchase(): void {
  let state = reduce(createInitialState(), { type: 'START_GAME' });
  const ids = (state.challengePoolIds ?? []).slice(0, 2);
  for (const id of ids) state = reduce(state, { type: 'TOGGLE_BOARD_GOAL', id });
  state = reduce(state, { type: 'CONFIRM_BOARD' });
  state = reduce(state, { type: 'CONFIRM_BRIEFING' });
  state = reduce(state, { type: 'ACK_EVENT' });
  const volumes = (state.monthOrders ?? []).filter((order) => order.productId === 'basic' || order.productId === 'economy');
  const premiums = (state.monthOrders ?? []).filter((order) => order.productId === 'premium' || order.productId === 'special');
  assert(volumes.length >= 1, '每月应保底一张走量单');
  assert(
    volumes.every((order) => order.qty >= 6),
    `走量单件数应明显大于高端，实际 ${volumes.map((order) => order.qty).join(',')}`,
  );
  if (premiums.length > 0) {
    assert(
      premiums.every((order) => order.qty <= 3),
      `旗舰单不应走量，实际 ${premiums.map((order) => order.qty).join(',')}`,
    );
  }
  const beforeA = state.materials.a;
  const spotA = state.materialSpot?.a ?? 0;
  state = reduce(state, { type: 'BUY_MATERIAL', material: 'a', qty: spotA + 20 });
  assert(state.materials.a === beforeA + spotA, `采购不得超过本月现货，库存 ${state.materials.a} 期望 ${beforeA + spotA}`);
  assert((state.materialSpot?.a ?? 0) === 0, '买完后钢材现货应扣尽');
}

function checkOpeningAccounts(): void {
  const opened = reduce(createInitialState(), { type: 'START_GAME' });
  const net = netAssetsOf(opened);
  const accounts = equityAccounts(opened);
  assert(accounts.paidIn === net, `开业实收资本 ${accounts.paidIn} 应等于净资产 ${net}`);
  assert(accounts.surplus === 0, '开业盈余公积应为 0');
  assert(accounts.retained === 0, `开业未分配利润应为 0，实际 ${accounts.retained}`);
  assert(opened.materialCost.a === 6.4 && opened.materialCost.b === 3.2 && opened.materialCost.c === 2, '开业原材料未按历史成本入账');
  assert(opened.machineGross === 10 && opened.factoryGross === 20, '开业固定资产未按原价入账');
  checkBalance(opened, '开业');
}

function settleFirstMonth(): GameState {
  let state = reduce(createInitialState(), { type: 'START_GAME' });
  const paidIn = state.paidInCapital;
  for (let i = 0; i < 40; i += 1) {
    if (state.phase === 'report') {
      checkBalance(state, '一月结算');
      assert(state.paidInCapital === paidIn, '实收资本在月结后不应变动');
      const np = netProfitOf(state.ledger);
      const reserve = state.surplusReserve ?? 0;
      if (np > 0) {
        assert(reserve === roundMoney(np * 0.1), `盈利月法定盈余公积应为净利润 10%，净利润 ${np} 公积 ${reserve}`);
      } else {
        assert(reserve === 0, `亏损月不应提取盈余公积，实际 ${reserve}`);
      }
      assert((state.accumDepMachines ?? 0) + (state.accumDepFactories ?? 0) > 0, '开业固定资产应从一月计提折旧');
      return state;
    }
    if (state.phase === 'board') {
      const pool = (state.challengePoolIds ?? []).filter((id) => id.startsWith(`q${state.quarter}-`));
      const ids = pool.slice(0, 2);
      if (ids.length < 2) throw new Error(`Board pool too small: ${pool.join(',')}`);
      for (const id of ids) {
        if (!state.challengeDraft.includes(id)) state = reduce(state, { type: 'TOGGLE_BOARD_GOAL', id });
      }
      state = reduce(state, { type: 'CONFIRM_BOARD' });
      continue;
    }
    if (state.phase === 'briefing') {
      state = reduce(state, { type: 'CONFIRM_BRIEFING' });
      continue;
    }
    if (state.phase === 'event') {
      state = reduce(state, { type: 'ACK_EVENT' });
      continue;
    }
    if (state.phase === 'actions') {
      state = reduce(state, { type: 'GO_PRODUCE' });
      continue;
    }
    if (state.phase === 'produce') {
      for (const order of state.monthOrders ?? []) {
        if (!(state.acceptedOrderIds ?? []).includes(order.id)) {
          state = reduce(state, { type: 'TOGGLE_ORDER', id: order.id });
        }
      }
      state = reduce(state, { type: 'SETTLE' });
      continue;
    }
    throw new Error(`Unexpected phase ${state.phase}`);
  }
  throw new Error('Did not reach first settlement');
}

function play(): GameState {
  let state = reduce(createInitialState(), { type: 'START_GAME' });
  let bounced = false;
  for (let i = 0; i < 120; i += 1) {
    if (state.phase === 'ended') return state;
    if (state.phase === 'board') {
      const fallback = {
        1: ['q1-sold30', 'q1-stock'],
        2: ['q2-machine', 'q2-staff6'],
        3: ['q3-rd', 'q3-sales'],
        4: ['q4-flagship', 'q4-nodebt'],
      }[state.quarter]!;
      const pool = (state.challengePoolIds ?? []).filter((id) => id.startsWith(`q${state.quarter}-`));
      const ids = (pool.length >= 2 ? pool : fallback).slice(0, 2);
      for (const id of ids) {
        if (!state.challengeDraft.includes(id)) state = reduce(state, { type: 'TOGGLE_BOARD_GOAL', id });
      }
      state = reduce(state, { type: 'CONFIRM_BOARD' });
      continue;
    }
    if (state.phase === 'briefing') {
      state = reduce(state, { type: 'CONFIRM_BRIEFING' });
      continue;
    }
    if (state.phase === 'event') {
      state = reduce(state, { type: 'ACK_EVENT' });
      continue;
    }
    if (state.phase === 'actions') {
      if (state.ap > 0 && state.cash > 80) {
        const qty = Math.min(20, state.materialSpot?.a ?? 0);
        if (qty > 0) state = reduce(state, { type: 'BUY_MATERIAL', material: 'a', qty });
      }
      if (state.ap > 0 && state.cash > 80) {
        const qty = Math.min(10, state.materialSpot?.b ?? 0);
        if (qty > 0) state = reduce(state, { type: 'BUY_MATERIAL', material: 'b', qty });
      }
      if (state.cardsUnlocked && !state.shopDrawn) {
        state = reduce(state, { type: 'DRAW_SHOP' });
        if (state.shop[0] && state.cash > 40) {
          state = reduce(state, { type: 'BUY_CARD', index: 0 });
        }
        if (state.hand[0] && state.ap > 0) {
          state = reduce(state, { type: 'PLAY_CARD', uid: state.hand[0].uid });
        }
      }
      state = reduce(state, { type: 'GO_PRODUCE' });
      continue;
    }
    if (state.phase === 'produce') {
      if (!bounced) {
        // 验证新增的取消排产路径：排产 → 返回经营 → 再进入排产
        state = reduce(state, { type: 'BACK_TO_ACTIONS' });
        if (state.phase !== 'actions') throw new Error('BACK_TO_ACTIONS did not return to actions');
        state = reduce(state, { type: 'GO_PRODUCE' });
        if (state.phase !== 'produce') throw new Error('GO_PRODUCE did not re-enter produce');
        bounced = true;
      }
      for (const order of state.monthOrders ?? []) {
        if (!(state.acceptedOrderIds ?? []).includes(order.id)) {
          state = reduce(state, { type: 'TOGGLE_ORDER', id: order.id });
        }
      }
      state = reduce(state, { type: 'SETTLE' });
      continue;
    }
    if (state.phase === 'report') {
      state = reduce(state, { type: 'NEXT_MONTH' });
      continue;
    }
    throw new Error(`Stuck in phase ${state.phase}`);
  }
  throw new Error('Loop exceeded');
}

checkOpeningAccounts();
checkBoardVariety();
checkMarketQuotes();
checkSpotPurchase();
settleFirstMonth();

const result = play();
if (result.phase !== 'ended' || !result.endKind) {
  throw new Error(`Unexpected end state: ${result.phase} ${result.endKind}`);
}
console.log(
  JSON.stringify(
    {
      endKind: result.endKind,
      month: result.month,
      cash: result.cash,
      debt: result.debt,
      machines: result.machines,
      staff: result.staff,
      products: result.unlockedProducts,
    },
    null,
    2,
  ),
);
