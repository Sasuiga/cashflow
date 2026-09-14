import { ACHIEVEMENTS } from '../game/achievements';
import { QUARTER_LABEL, climateById, goalById } from '../game/board';
import { scoreOf } from '../game/score';
import type { GameState } from '../game/types';

export function JournalPage({ state }: { state: GameState }) {
  const unlocked = new Set(state.achievements);
  const done = ACHIEVEMENTS.filter((item) => unlocked.has(item.id)).length;
  const score = scoreOf(state);
  const climate = climateById(state.climateId);

  return (
    <div className="page-grid journal">
      <section className="panel">
        <h3>本局得分 {score.total}</h3>
        <p className="hint">先保证当月净资产不为负。分数来自生存、董事会考核和瘦身净资产。成就只作记录，不计分。</p>
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
          {QUARTER_LABEL[state.quarter]} · {climate.name}
        </p>
        <p className="hint">{climate.headline}</p>
        {(state.boardHistory ?? []).map((item) => (
          <article key={item.quarter} className="achieve on" style={{ marginTop: 10 }}>
            <b>
              {QUARTER_LABEL[item.quarter]} · {item.points} 分
            </b>
            <p>{item.minutes}</p>
            <em>{item.basicOk ? '基本目标达成' : '基本目标未达成'}</em>
          </article>
        ))}
        {state.basicGoalId && (
          <article className="achieve" style={{ marginTop: 10 }}>
            <b>本季基本目标 · {goalById(state.basicGoalId).name}</b>
            <p>{goalById(state.basicGoalId).desc}</p>
            <em>考核在季末董事会</em>
          </article>
        )}
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
        <p className="hint">成就用于回顾经营足迹，不计入总分。</p>
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
