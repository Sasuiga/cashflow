import { MATERIALS, PRODUCTS, eventById } from '../game/data';
import { MONTH_NAMES, money, priceDelta, signedMoney } from '../game/format';
import { QUARTER_LABEL, basicGoalOf, challengePoolOf, climateById, marketDigest } from '../game/board';
import type { GameState } from '../game/types';

export function BoardModal({
  state,
  onToggle,
  onConfirm,
}: {
  state: GameState;
  onToggle: (id: string) => void;
  onConfirm: () => void;
}) {
  const climate = climateById(state.climateId);
  const basic = basicGoalOf(state.quarter);
  const pool = challengePoolOf(state.quarter);
  const picked = new Set(state.challengeDraft);
  const ready = state.challengeDraft.length === 2;
  return (
    <div className="overlay">
      <div className="modal">
        <p className="kicker" style={{ color: '#8a7040' }}>
          {QUARTER_LABEL[state.quarter]} · 董事会
        </p>
        <h2>{state.quarter === 1 ? '开局决议' : '季度考核与新决议'}</h2>
        {state.boardMinutes && state.quarter > 1 && (
          <div className="event-impact">
            <b>上季纪要</b>
            <p>{state.boardMinutes}</p>
          </div>
        )}
        <p className="lead">{climate.headline}</p>
        <p className="sheet-caption">本季市场基调 · {climate.name}</p>
        <p className="lead" style={{ marginTop: 0 }}>
          {climate.briefing}
        </p>
        <div className="event-impact">
          <b>基本目标 · 未达成扣 5 分</b>
          <p>
            {basic.name}。{basic.desc}
          </p>
        </div>
        <p className="sheet-caption">挑战目标 · 四选二 · 兑现各 5 分</p>
        {pool.map((goal) => {
          const on = picked.has(goal.id);
          return (
            <button
              key={goal.id}
              className={on ? 'choice on' : 'choice'}
              onClick={() => onToggle(goal.id)}
            >
              <span className="choice-top">
                <b>{goal.name}</b>
                <em>{on ? '已选' : '点选'}</em>
              </span>
              <span>{goal.desc}</span>
            </button>
          );
        })}
        <p className="lead event-hint">{ready ? '两条挑战目标已选定。' : '选定两条挑战目标。'}</p>
        <div className="footer-actions">
          <button className="btn" disabled={!ready} onClick={onConfirm}>
            确认本季目标
          </button>
        </div>
      </div>
    </div>
  );
}

export function BriefingModal({ state, onConfirm }: { state: GameState; onConfirm: () => void }) {
  const visibleMaterials = MATERIALS.filter((item) => item.id !== 'd' || state.materialDUnlocked);
  const products = PRODUCTS.filter((item) => state.unlockedProducts.includes(item.id));
  return (
    <div className="overlay">
      <div className="modal briefing-modal">
        <h2>{MONTH_NAMES[state.month - 1]} · 行业月报</h2>
        <p className="lead briefing-digest">{marketDigest(state)}</p>
        <p className="sheet-caption">原料报价 · 万元/件</p>
        <div className="sheet-wrap briefing-sheet">
        <table className="sheet compact">
          <thead>
            <tr>
              <th>品种</th>
              <th className="num">报价</th>
              <th className="num">变动</th>
            </tr>
          </thead>
          <tbody>
            {visibleMaterials.map((item) => {
              const price = state.materialPrices[item.id];
              const delta = priceDelta(price, item.basePrice);
              return (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td className="num">{money(price)}</td>
                  <td className={`num delta-${delta.tone}`}>{delta.text}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
        <p className="sheet-caption">成品行情</p>
        <div className="sheet-wrap briefing-sheet">
        <table className="sheet compact">
          <thead>
            <tr>
              <th>产品</th>
              <th className="num">市价</th>
              <th className="num">需求</th>
              <th className="num">变动</th>
            </tr>
          </thead>
          <tbody>
            {products.map((item) => {
              const price = state.productPrices[item.id] ?? item.basePrice;
              const delta = priceDelta(price, item.basePrice);
              return (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td className="num">{money(price)}</td>
                  <td className="num">{state.demand[item.id] ?? 0}</td>
                  <td className={`num delta-${delta.tone}`}>{delta.text}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
        <div className="footer-actions">
          <button className="btn" onClick={onConfirm}>
            收下月报
          </button>
        </div>
      </div>
    </div>
  );
}

export function EventModal({
  state,
  onAck,
}: {
  state: GameState;
  onAck: () => void;
}) {
  if (!state.eventId) return null;
  const event = eventById(state.eventId);
  return (
    <div className="overlay">
      <div className="modal">
        <p className="kicker" style={{ color: event.tone === 'good' ? '#3d6b52' : event.tone === 'mixed' ? '#8a7040' : '#8a3d2f' }}>
          本月事件 · {event.monthHint} · 已落地
        </p>
        <h2>{event.title}</h2>
        <p className="lead">{event.body}</p>
        <div className={`event-impact tone-${event.tone}`}>
          <b>入账影响</b>
          <p>{state.eventNote ?? event.impact}</p>
        </div>
        <div className="footer-actions">
          <button className="btn" onClick={onAck}>
            已知悉，开始经营
          </button>
        </div>
      </div>
    </div>
  );
}

export function ReportModal({ state, onNext }: { state: GameState; onNext: () => void }) {
  const report = state.lastReport;
  if (!report) return null;
  const closing = Boolean(state.endKind);
  return (
    <div className="overlay">
      <div className="modal">
        <p className="kicker" style={{ color: '#8a7040' }}>
          {MONTH_NAMES[report.month - 1]} · 结算底稿
        </p>
        <h2>{closing ? (state.endKind === 'bankrupt' ? '清算报告' : '年终决算') : '本月已结'}</h2>
        <p className="lead">
          本月只做 {report.productName}：产出 {report.produced}，售出 {report.sold}
          {report.leftover ? `，库存 ${report.leftover}` : ''}。
        </p>
        <div className="ledger">
          {report.lines.map((line) => (
            <div key={line.label}>
              <span>{line.label}</span>
              <span className={line.tone === 'good' ? 'good' : line.tone === 'bad' ? 'bad' : ''}>
                {signedMoney(line.value)}
              </span>
            </div>
          ))}
          <div>
            <b>净现金流</b>
            <b className={report.netCash >= 0 ? 'good' : 'bad'}>{signedMoney(report.netCash)}</b>
          </div>
          <div>
            <span>现金 / 短期借款</span>
            <span>
              {money(report.cash)} / {money(report.debt)}
            </span>
          </div>
          <div>
            <span>应付职工薪酬</span>
            <span>{money(state.wagesPayable)}</span>
          </div>
          <div>
            <span>净资产</span>
            <span className={report.netAssets >= 0 ? 'good' : 'bad'}>{money(report.netAssets)}</span>
          </div>
        </div>
        {report.rdNote && <p className="lead">{report.rdNote}</p>}
        <div className="footer-actions">
          <button className="btn" onClick={onNext}>
            {state.endKind ? '查看结局' : '进入下月'}
          </button>
        </div>
      </div>
    </div>
  );
}
