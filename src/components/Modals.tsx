import { MATERIALS, PRODUCTS, eventById } from '../game/data';
import { MONTH_NAMES, money, priceDelta, signedMoney } from '../game/format';
import type { GameState } from '../game/types';

export function BriefingModal({ state, onConfirm }: { state: GameState; onConfirm: () => void }) {
  const visibleMaterials = MATERIALS.filter((item) => item.id !== 'd' || state.materialDUnlocked);
  const products = PRODUCTS.filter((item) => state.unlockedProducts.includes(item.id));
  return (
    <div className="overlay">
      <div className="modal">
        <h2>{MONTH_NAMES[state.month - 1]} · 行业月报</h2>
        <p className="sheet-caption">原料报价</p>
        <div className="sheet-wrap">
        <table className="sheet">
          <thead>
            <tr>
              <th>品种</th>
              <th>代码</th>
              <th className="num">报价</th>
              <th className="num">较基准</th>
            </tr>
          </thead>
          <tbody>
            {visibleMaterials.map((item) => {
              const price = state.materialPrices[item.id];
              const delta = priceDelta(price, item.basePrice);
              return (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{item.short}</td>
                  <td className="num">{money(price)} / 件</td>
                  <td className={`num delta-${delta.tone}`}>{delta.text}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
        <p className="sheet-caption">成品市价</p>
        <div className="sheet-wrap">
        <table className="sheet">
          <thead>
            <tr>
              <th>档位</th>
              <th>产品</th>
              <th className="num">市价</th>
              <th className="num">需求</th>
              <th className="num">较基准</th>
            </tr>
          </thead>
          <tbody>
            {products.map((item) => {
              const price = state.productPrices[item.id] ?? item.basePrice;
              const delta = priceDelta(price, item.basePrice);
              return (
                <tr key={item.id}>
                  <td>{item.tier}</td>
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
            <span className="choice-top">
              <b>{choice.label}</b>
              <em>{choice.cost}</em>
            </span>
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
