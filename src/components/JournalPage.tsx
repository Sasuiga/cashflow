import { ACHIEVEMENTS } from '../game/achievements';
import type { GameState } from '../game/types';

export function JournalPage({ state }: { state: GameState }) {
  const unlocked = new Set(state.achievements);
  const done = ACHIEVEMENTS.filter((item) => unlocked.has(item.id)).length;

  return (
    <div className="page-grid journal">
      <section className="panel">
        <h3>经营日志</h3>
        <div className="log tall">
          {state.log.map((line, index) => (
            <p key={`${line}-${index}`}>{line}</p>
          ))}
        </div>
      </section>
      <section className="panel">
        <h3>
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
