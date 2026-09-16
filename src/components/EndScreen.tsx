import { scoreOf } from '../game/score';
import type { GameState } from '../game/types';

function bankruptCause(state: GameState): string {
  const cash = state.lastReport?.cash ?? state.cash;
  const net = state.lastReport?.netAssets ?? 0;
  if (cash < 0 && net < 0) return '现金跌破零（净资产亦已为负）';
  return '现金跌破零';
}

export function EndScreen({ state, onRestart }: { state: GameState; onRestart: () => void }) {
  const score = scoreOf(state);
  return (
    <section className="end-screen">
      <div className="end-card">
        <p className="kicker">{state.endKind === 'bankrupt' ? 'Game Over' : 'Year Closed'}</p>
        <h1 className="display" style={{ fontSize: 'clamp(40px, 6vw, 68px)' }}>
          {score.title}
        </h1>
        <p className="sub">
          {state.endKind === 'bankrupt'
            ? `第 ${state.month} 月结算后，${bankruptCause(state)}。北港制造被清算。`
            : '十二本月报合上。活下来只是门槛，分数来自生存、董事会考核和净资产。'}
        </p>
        <p className="score-total">
          总分 <b>{score.total}</b>
        </p>
        <div className="score-lines">
          {score.lines.map((line) => (
            <div key={line.label}>
              <span>
                {line.label}
                <small>{line.detail}</small>
              </span>
              <strong>{line.points}</strong>
            </div>
          ))}
        </div>
        <button className="btn" onClick={onRestart}>
          再开一局
        </button>
      </div>
    </section>
  );
}
