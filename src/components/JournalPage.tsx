import { ACHIEVEMENTS } from '../game/achievements';
import { MILESTONES, scoreOf } from '../game/score';
import type { GameState } from '../game/types';

export function JournalPage({ state }: { state: GameState }) {
  const unlocked = new Set(state.achievements);
  const done = ACHIEVEMENTS.filter((item) => unlocked.has(item.id)).length;
  const miles = new Set(state.milestones);
  const score = scoreOf(state);

  return (
    <div className="page-grid journal">
      <section className="panel">
        <h3>本局得分 {score.total}</h3>
        <p className="hint">先保证当月净资产不为负。年末按生存、净资产、里程碑、奖项和成就计分。</p>
        <div className="score-lines compact">
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
        <p className="dept-kicker" style={{ marginTop: 18 }}>
          里程碑
        </p>
        <div className="achieve-grid">
          {MILESTONES.map((item) => {
            const on = miles.has(item.id);
            return (
              <article key={item.id} className={on ? 'achieve on' : 'achieve'}>
                <b>
                  {item.name} · {item.points} 分
                </b>
                <p>{item.desc}</p>
                <em>{on ? '已达成' : '未解锁'}</em>
              </article>
            );
          })}
        </div>
      </section>
      <section className="panel">
        <h3>经营日志</h3>
        <div className="log tall">
          {state.log.map((line, index) => (
            <p key={`${line}-${index}`}>{line}</p>
          ))}
        </div>
        <h3 style={{ marginTop: 20 }}>
          成就 {done}/{ACHIEVEMENTS.length}
        </h3>
        <div className="achieve-grid">
          {ACHIEVEMENTS.map((item) => {
            const on = unlocked.has(item.id);
            return (
              <article key={item.id} className={on ? 'achieve on' : 'achieve'}>
                <b>{item.name}</b>
                <p>{item.desc}</p>
                <em>{on ? '已达成' : '未解锁'}</em>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
