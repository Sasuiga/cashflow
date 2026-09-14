import { money, scoreTitle } from '../game/format';
import { netAssetsOf } from '../game/engine';
import type { GameState } from '../game/types';

export function EndScreen({ state, onRestart }: { state: GameState; onRestart: () => void }) {
  const net = netAssetsOf(state);
  const title = scoreTitle(net, state.endKind ?? 'finished');
  return (
    <section className="end-screen">
      <div className="end-card">
        <p className="kicker">{state.endKind === 'bankrupt' ? 'Game Over' : 'Year Closed'}</p>
        <h1 className="display" style={{ fontSize: 'clamp(40px, 6vw, 68px)' }}>
          {title}
        </h1>
        <p className="sub">
          {state.endKind === 'bankrupt'
            ? `第 ${state.month} 月结算后，净资产跌破零。北港制造被清算。`
            : '十二本月报合上。工厂还在，账本给出最终判断。'}
        </p>
        <div className="rule-grid" style={{ marginTop: 28 }}>
          <article className="rule">
            <b>净资产</b>
            <p>{money(net)}</p>
          </article>
          <article className="rule">
            <b>现金 / 负债</b>
            <p>
              {money(state.cash)} / {money(state.debt)}
            </p>
          </article>
          <article className="rule">
            <b>编制 / 设备</b>
            <p>
              {state.staff.production + state.staff.management + state.staff.sales + state.staff.rd} 人 · {state.machines} 台设备
            </p>
          </article>
        </div>
        <button className="btn" onClick={onRestart}>
          再开一局
        </button>
      </div>
    </section>
  );
}
