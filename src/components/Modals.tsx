import { MATERIALS, PRODUCTS, eventById } from '../game/data';
import { MONTH_NAMES, money, signedMoney } from '../game/format';
import type { GameState } from '../game/types';

export function BriefingModal({ state, onConfirm }: { state: GameState; onConfirm: () => void }) {
  const visibleMaterials = MATERIALS.filter((item) => item.id !== 'd' || state.materialDUnlocked);
  const products = PRODUCTS.filter((item) => state.unlockedProducts.includes(item.id));
  return (
    <div className="overlay">
      <div className="modal">
        <p className="kicker" style={{ color: '#8a7040' }}>
          {MONTH_NAMES[state.month - 1]} · 行业月报
        </p>
        <h2>开市之前</h2>
        <p className="lead">原料报价先落地，成品需求随后公布。看完这张纸，才进入本月事件。</p>
        <p className="kicker" style={{ color: '#8a7040', marginTop: 8 }}>
          原料报价
        </p>
        <div className="market-table">
          {visibleMaterials.map((item) => (
            <div className="quote" key={item.id}>
              <em>{item.name}</em>
              <strong>{money(state.materialPrices[item.id])} / 件</strong>
            </div>
          ))}
        </div>
        <p className="kicker" style={{ color: '#8a7040' }}>
          成品市价
        </p>
        <div className="market-table">
          {products.map((item) => (
            <div className="quote" key={item.id}>
              <em>
                {item.tier} · {item.name}
              </em>
              <strong>
                {money(state.productPrices[item.id] ?? item.basePrice)} · 需求 {state.demand[item.id] ?? 0}
              </strong>
            </div>
          ))}
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
  onChoose,
}: {
  state: GameState;
  onChoose: (choice: number) => void;
}) {
  if (!state.eventId) return null;
  const event = eventById(state.eventId);
  return (
    <div className="overlay">
      <div className="modal">
        <p className="kicker" style={{ color: '#8a7040' }}>
          随机事件 · {event.monthHint}
        </p>
        <h2>{event.title}</h2>
        <p className="lead">{event.body}</p>
        {event.choices.map((choice, index) => (
          <button className="choice" key={choice.label} onClick={() => onChoose(index)}>
            <b>{choice.label}</b>
            <span>{choice.hint}</span>
          </button>
        ))}
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
            <span>现金 / 负债</span>
            <span>
              {money(report.cash)} / {money(report.debt)}
            </span>
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
