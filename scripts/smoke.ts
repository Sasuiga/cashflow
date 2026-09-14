import {
  createInitialState,
  equityAccounts,
  monthGap,
  netAssetsOf,
  netProfitOf,
  reduce,
} from '../src/game/engine';
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

function pickChallenge(state: GameState): GameState {
  const fallback: Record<1 | 2 | 3 | 4, string> = {
    1: 'q1-sold30',
    2: 'q2-machine',
    3: 'q3-rd',
    4: 'q4-flagship',
  };
  const id = fallback[state.quarter];
  if (!state.challengeDraft.includes(id)) state = reduce(state, { type: 'TOGGLE_BOARD_GOAL', id });
  return reduce(state, { type: 'CONFIRM_BOARD' });
}

function advanceToOperate(state: GameState, acceptAll: boolean): GameState {
  if (state.phase === 'board') state = pickChallenge(state);
  if (state.phase === 'news') state = reduce(state, { type: 'ACK_NEWS', choice: 'face' });
  if (state.phase === 'market') {
    if (acceptAll) {
      for (const order of state.monthOrders ?? []) {
        if (!(state.acceptedOrderIds ?? []).includes(order.id)) {
          state = reduce(state, { type: 'TOGGLE_ORDER', id: order.id });
        }
      }
    }
    state = reduce(state, { type: 'LOCK_MARKET' });
  }
  return state;
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
    if (state.phase === 'board' || state.phase === 'news' || state.phase === 'market') {
      state = advanceToOperate(state, true);
      continue;
    }
    if (state.phase === 'operate') {
      state = reduce(state, { type: 'SETTLE' });
      continue;
    }
    throw new Error(`Unexpected phase ${state.phase}`);
  }
  throw new Error('Did not reach first settlement');
}

function overcommitDefaults(): void {
  let state = reduce(createInitialState(), { type: 'START_GAME' });
  state = advanceToOperate(state, true);
  const accepted = [...(state.acceptedOrderIds ?? [])];
  assert(accepted.length > 0, '超接测试需要至少一张已接单');
  const gap = monthGap(state);
  const short = gap.missing.length > 0 || gap.capUsed > gap.capTotal + 1e-9;
  state = reduce(state, { type: 'SETTLE' });
  assert(state.phase === 'report', `超接后应进入结算，实际 ${state.phase}`);
  const report = state.lastReport;
  assert(report, '结算应写出月报');
  const defaultPenalty = (report.defaults ?? []).reduce((sum, item) => sum + item.penalty, 0);
  assert(Math.abs(report.penalty - defaultPenalty) < 1e-6, '月报违约金应等于各单罚金之和');
  if (short) {
    assert((report.defaults?.length ?? 0) > 0, '缺口仍在时过月应产生整张违约');
    assert(report.penalty > 0, '未交订单应按件扣违约金');
    assert(
      report.story.some((line) => line.includes('未交')) || (report.defaults?.length ?? 0) > 0,
      '结算应点名哪张单未交',
    );
  }
  checkBalance(state, '超接违约');
}

function play(): GameState {
  let state = reduce(createInitialState(), { type: 'START_GAME' });
  for (let i = 0; i < 160; i += 1) {
    if (state.phase === 'ended') return state;
    if (state.phase === 'board' || state.phase === 'news' || state.phase === 'market') {
      state = advanceToOperate(state, true);
      continue;
    }
    if (state.phase === 'operate') {
      if (state.ap > 0 && state.cash > 80) {
        state = reduce(state, { type: 'BUY_MATERIAL', material: 'a', qty: 20 });
      }
      if (state.ap > 0 && state.cash > 80) {
        state = reduce(state, { type: 'BUY_MATERIAL', material: 'b', qty: 10 });
      }
      if (!state.shopDrawn) {
        state = reduce(state, { type: 'DRAW_SHOP' });
        if (state.shop[0] && state.cash > 40) {
          state = reduce(state, { type: 'BUY_CARD', index: 0 });
        }
        if (state.hand[0] && state.ap > 0) {
          state = reduce(state, { type: 'PLAY_CARD', uid: state.hand[0].uid });
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
settleFirstMonth();
overcommitDefaults();

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
