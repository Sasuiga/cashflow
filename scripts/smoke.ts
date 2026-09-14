import { createInitialState, maxProduce, reduce } from '../src/game/engine';
import type { GameState, ProductId } from '../src/game/types';

function bestProduct(state: GameState): ProductId {
  let best = state.unlockedProducts[0]!;
  let score = -Infinity;
  for (const id of state.unlockedProducts) {
    const produced = maxProduce(state, id);
    const value = produced * (state.productPrices[id] ?? 0);
    if (value > score) {
      score = value;
      best = id;
    }
  }
  return best;
}

function play(): GameState {
  let state = reduce(createInitialState(), { type: 'START_GAME' });
  for (let i = 0; i < 120; i += 1) {
    if (state.phase === 'ended') return state;
    if (state.phase === 'briefing') {
      state = reduce(state, { type: 'CONFIRM_BRIEFING' });
      continue;
    }
    if (state.phase === 'event') {
      state = reduce(state, { type: 'RESOLVE_EVENT', choice: i % 2 });
      continue;
    }
    if (state.phase === 'actions') {
      if (state.ap > 0 && state.cash > 80) {
        state = reduce(state, { type: 'BUY_MATERIAL', material: 'a', qty: 20 });
      }
      if (state.ap > 0 && state.cash > 80) {
        state = reduce(state, { type: 'BUY_MATERIAL', material: 'b', qty: 10 });
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
      state = reduce(state, { type: 'SELECT_PRODUCT', id: bestProduct(state) });
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
