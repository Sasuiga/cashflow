import { createInitialState, netAssetsOf, reduce } from '../src/game/engine';
import type { GameState } from '../src/game/types';

function play(style: 'idle' | 'expand' | 'lean', seed: number): GameState {
  let state = reduce(createInitialState(), { type: 'START_GAME' });
  for (let i = 0; i < 200; i += 1) {
    if (state.phase === 'ended') return state;
    if (state.phase === 'board') {
      const fallback = {
        1: 'q1-sold30',
        2: 'q2-machine',
        3: 'q3-rd',
        4: 'q4-flagship',
      }[state.quarter]!;
      if (!state.challengeDraft.includes(fallback)) state = reduce(state, { type: 'TOGGLE_BOARD_GOAL', id: fallback });
      state = reduce(state, { type: 'CONFIRM_BOARD' });
      continue;
    }
    if (state.phase === 'news') {
      state = reduce(state, { type: 'ACK_NEWS', choice: 'face' });
      continue;
    }
    if (state.phase === 'market') {
      for (const order of state.monthOrders ?? []) {
        if (!(state.acceptedOrderIds ?? []).includes(order.id)) {
          state = reduce(state, { type: 'TOGGLE_ORDER', id: order.id });
        }
      }
      state = reduce(state, { type: 'LOCK_MARKET' });
      continue;
    }
    if (state.phase === 'operate') {
      const canBuy = state.ap > 0 || state.month >= 7;
      if (style === 'expand' && state.ap > 0 && state.cash >= 12 && state.machines < state.slots) {
        state = reduce(state, { type: 'BUY_MACHINE' });
      }
      if (style === 'expand' && state.ap > 0 && state.cash >= 4) {
        state = reduce(state, { type: 'HIRE', role: (['production', 'sales', 'rd', 'management'] as const)[seed % 4] });
      }
      if (style !== 'lean') {
        if (canBuy && state.cash >= 8) {
          state = reduce(state, { type: 'BUY_MATERIAL', material: 'a', qty: 20 });
        }
        if (canBuy && state.cash >= 8) {
          state = reduce(state, { type: 'BUY_MATERIAL', material: 'b', qty: 10 });
        }
        if (canBuy && state.cash >= 12) {
          state = reduce(state, { type: 'BUY_MATERIAL', material: 'c', qty: 10 });
        }
      } else if (canBuy && state.cash >= 6) {
        if ((state.materials.a ?? 0) < 16) state = reduce(state, { type: 'BUY_MATERIAL', material: 'a', qty: 10 });
        if (canBuy && (state.materials.b ?? 0) < 8) state = reduce(state, { type: 'BUY_MATERIAL', material: 'b', qty: 10 });
      }
      state = reduce(state, { type: 'SETTLE' });
      continue;
    }
    if (state.phase === 'report') {
      state = reduce(state, { type: 'NEXT_MONTH' });
      continue;
    }
    throw new Error(`Stuck in ${state.phase}`);
  }
  return state;
}

function summarize(label: string, style: 'idle' | 'expand' | 'lean') {
  const rows = Array.from({ length: 24 }, (_, i) => play(style, i));
  const finished = rows.filter((s) => s.endKind === 'finished');
  const broke = rows.filter((s) => s.endKind === 'bankrupt');
  const nets = finished.map((s) => netAssetsOf(s));
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  console.log(
    JSON.stringify(
      {
        label,
        finished: finished.length,
        bankrupt: broke.length,
        avgMonthIfBroke: avg(broke.map((s) => s.month)),
        avgNetIfFinished: Math.round(avg(nets) * 10) / 10,
        minNet: nets.length ? Math.min(...nets) : null,
        maxNet: nets.length ? Math.max(...nets) : null,
        avgCash: Math.round(avg(finished.map((s) => s.cash)) * 10) / 10,
      },
      null,
      2,
    ),
  );
}

summarize('idle-restock-all', 'idle');
summarize('lean-basic-only', 'lean');
summarize('expand-when-rich', 'expand');
