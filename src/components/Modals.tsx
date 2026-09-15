import { MATERIALS, catalogOf, eventById } from '../game/data';
import { booksForView, netProfitOf, operatingCashOf } from '../game/engine';
import { MONTH_NAMES, RD_TRACK_LABEL, money, pctLabel, priceDelta, signedMoney } from '../game/format';
import { QUARTER_LABEL, CHALLENGE_PICK, climateById, currentBasicGoal, currentChallengePool, quarterOutlook } from '../game/board';
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
  const basic = currentBasicGoal(state);
  const pool = currentChallengePool(state);
  const picked = new Set(state.challengeDraft);
  const ready = state.challengeDraft.length === CHALLENGE_PICK;
  const outlook = quarterOutlook(state);
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
        <p className="sheet-caption">本季定调 · {climate.name}</p>
        <p className="lead" style={{ marginTop: 0 }}>
          {climate.headline}
        </p>
        <div className="quarter-outlook">
          <p>原料价格：{outlook.materials}。</p>
          <p>成品价格：{outlook.products}。</p>
          <p>成品需求：{outlook.demand}。</p>
          <p>到货配额：{outlook.quota}。</p>
        </div>
        <div className="event-impact">
          <b>基本目标 · 未达成扣 5 分</b>
          <p>
            {basic.name}。{basic.desc}
          </p>
        </div>
        <p className="sheet-caption">挑战目标 · 本季四选一 · 兑现 5 分</p>
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
  const products = catalogOf(state).filter((item) => state.unlockedProducts.includes(item.id));
  return (
    <div className="overlay">
      <div className="modal briefing-modal">
        <h2>{MONTH_NAMES[state.month - 1]} · 行业月报</h2>
        <p className="sheet-caption">原料供应</p>
        <div className="sheet-wrap briefing-sheet">
        <table className="sheet compact">
          <thead>
            <tr>
              <th>品种</th>
              <th className="num">报价</th>
              <th className="num">较上月</th>
              <th className="num">本月现货</th>
            </tr>
          </thead>
          <tbody>
            {visibleMaterials.map((item) => {
              const price = state.materialPrices[item.id];
              const delta = priceDelta(price, state.prevMaterialPrices?.[item.id] ?? item.basePrice);
              const spot = Math.max(0, state.materialSpot?.[item.id] ?? 0);
              return (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td className="num">{money(price)}</td>
                  <td className={`num delta-${delta.tone}`}>{delta.text}</td>
                  <td className="num">{spot}</td>
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
              <th className="num">较上月</th>
            </tr>
          </thead>
          <tbody>
            {products.map((item) => {
              const price = state.productPrices[item.id] ?? item.basePrice;
              const delta = priceDelta(price, state.prevProductPrices?.[item.id] ?? item.basePrice);
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
  const { prev, curr } = booksForView(state);
  const netProfit = netProfitOf(curr.ledger);
  const opCash = operatingCashOf(curr.ledger);
  const prevInv = Math.max(0, (prev.inventory ?? 0) - (prev.inventoryProvision ?? 0));
  const currInv = Math.max(0, (curr.inventory ?? 0) - (curr.inventoryProvision ?? 0));
  const prevAr = prev.receivablesNet ?? Math.max(0, (prev.receivables ?? 0) - (prev.badDebtProvision ?? 0));
  const currAr = curr.receivablesNet ?? Math.max(0, (curr.receivables ?? 0) - (curr.badDebtProvision ?? 0));
  return (
    <div className="overlay">
      <div className="modal">
        <p className="kicker" style={{ color: '#8a7040' }}>
          {MONTH_NAMES[report.month - 1]} · 结算底稿
        </p>
        <h2>{closing ? (state.endKind === 'bankrupt' ? '清算报告' : '年终决算') : '本月已结'}</h2>
        <p className="lead">
          本月交付 {report.productName}：产出 {report.produced}，售出 {report.sold}
          {report.leftover ? `，库存 ${report.leftover}` : ''}。
        </p>
        <div className="settle-story">
          <div>
            <em>利润表</em>
            <b className={netProfit >= 0 ? 'good' : 'bad'}>净利润 {signedMoney(netProfit)}</b>
            <span>营业收入 {money(report.revenue)}</span>
          </div>
          <div>
            <em>现金流量表</em>
            <b className={opCash >= 0 ? 'good' : 'bad'}>经营现金流 {signedMoney(opCash)}</b>
            <span>期末现金 {money(report.cash)}</span>
          </div>
          <div>
            <em>资产负债表</em>
            <b className={report.netAssets >= 0 ? 'good' : 'bad'}>净资产 {money(report.netAssets)}</b>
            <span>
              存货 {money(prevInv)} → {money(currInv)} · 应收 {money(prevAr)} → {money(currAr)}
            </span>
          </div>
        </div>
        <div className="ledger">
          {report.lines.map((line) => (
            <div key={line.label}>
              <span>{line.label}</span>
              <span className={line.tone === 'good' ? 'good' : line.tone === 'bad' ? 'bad' : ''}>
                {signedMoney(line.value)}
              </span>
            </div>
          ))}
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

export function RdRevealModal({ state, onAck }: { state: GameState; onAck: () => void }) {
  const reveal = state.pendingRdReveals[0];
  if (!reveal) return null;
  const tone = reveal.success ? 'good' : 'bad';
  return (
    <div className="overlay rd-overlay">
      <div className="modal">
        <p className="kicker" style={{ color: reveal.success ? '#3d6b52' : '#8a3d2f' }}>
          研发成果 · {RD_TRACK_LABEL[reveal.track]}
        </p>
        <h2>{reveal.title}</h2>
        <p className="lead">{reveal.body}</p>
        <div className={`event-impact tone-${tone}`}>
          <b>{reveal.success ? '已入账' : '未过关'}</b>
          <p>
            {reveal.staff} 人在岗，成功率 {pctLabel(reveal.chance)}。
            {reveal.success
              ? reveal.track === 'product'
                ? '新产品已开线，销售部会接到对应订单。'
                : '知识产权已装备到产线，持续生效，不资本化。'
              : '进度清零，班底保留，下次成功率 +10%。'}
          </p>
        </div>
        <div className="footer-actions">
          <button className="btn" onClick={onAck}>
            {reveal.success ? '收入囊中' : '继续课题'}
          </button>
        </div>
      </div>
    </div>
  );
}
