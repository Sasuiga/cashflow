import { createInitialState, netAssetsOf, reduce } from '../src/game/engine';
import type { GameState } from '../src/game/types';

function play(style: 'idle' | 'expand' | 'lean', seed: number): GameState {
  let state = reduce(createInitialState(), { type: 'START_GAME' });
  for (let i = 0; i < 160; i += 1) {
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
      const canBuy = state.ap > 0 || state.month >= 7;
      if (style === 'expand' && state.ap > 0 && state.cash >= 12 && state.machines < state.slots) {
        state = reduce(state, { type: 'BUY_MACHINE' });
      }
      if (style === 'expand' && state.ap > 0 && state.cash >= 4) {
        state = reduce(state, { type: 'HIRE', role: (['production', 'sales', 'rd', 'management'] as const)[seed % 4] });
      }
      if (style !== 'lean') {
        if (canBuy && state.cash >= 8) {
          const qty = Math.min(20, state.materialSpot?.a ?? 0);
          if (qty > 0) state = reduce(state, { type: 'BUY_MATERIAL', material: 'a', qty });
        }
        if (canBuy && state.cash >= 8) {
          const qty = Math.min(10, state.materialSpot?.b ?? 0);
          if (qty > 0) state = reduce(state, { type: 'BUY_MATERIAL', material: 'b', qty });
        }
        if (canBuy && state.cash >= 4) {
          const qty = Math.min(4, state.materialSpot?.c ?? 0);
          if (qty > 0) state = reduce(state, { type: 'BUY_MATERIAL', material: 'c', qty });
        }
      } else if (canBuy && state.cash >= 6) {
        if ((state.materials.a ?? 0) < 16) {
          const qty = Math.min(10, state.materialSpot?.a ?? 0);
          if (qty > 0) state = reduce(state, { type: 'BUY_MATERIAL', material: 'a', qty });
        }
        if (canBuy && (state.materials.b ?? 0) < 8) {
          const qty = Math.min(10, state.materialSpot?.b ?? 0);
          if (qty > 0) state = reduce(state, { type: 'BUY_MATERIAL', material: 'b', qty });
        }
      }
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
