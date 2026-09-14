import { useState } from 'react';
import { MATERIALS, PRODUCTS, eventById } from '../game/data';
import { NEWS_MITIGATE_COST } from '../game/data';
import { booksForView, netProfitOf } from '../game/engine';
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
  const ready = state.challengeDraft.length === 1;
  return (
    <div className="overlay">
      <div className="modal sheet-card">
        <p className="kicker gold">{QUARTER_LABEL[state.quarter]} · 董事会</p>
        <h2>{state.quarter === 1 ? '开局决议' : '新季度决议'}</h2>
        {state.boardMinutes && state.quarter > 1 && (
          <div className="event-impact">
            <b>上季纪要</b>
            <p>{state.boardMinutes}</p>
          </div>
        )}
        <p className="lead">{climate.headline}</p>
        <p className="sheet-caption">本季市场 · {climate.name}</p>
        <p className="lead" style={{ marginTop: 0 }}>
          {climate.briefing}
        </p>
        <div className="event-impact">
          <b>基本目标 · 未达成扣 5 分</b>
          <p>
            {basic.name}。{basic.desc}
          </p>
        </div>
        <p className="sheet-caption">挑战目标 · 四选一 · 兑现 5 分</p>
        {pool.map((goal) => {
          const on = picked.has(goal.id);
          return (
            <button key={goal.id} className={on ? 'choice on' : 'choice'} onClick={() => onToggle(goal.id)}>
              <span className="choice-top">
                <b>{goal.name}</b>
                <em>{on ? '已选' : '点选'}</em>
              </span>
              <span>{goal.desc}</span>
            </button>
          );
        })}
        <p className="lead event-hint">{ready ? '挑战目标已选定。' : '选定一条挑战目标。'}</p>
        <div className="footer-actions">
          <button className="btn" disabled={!ready} onClick={onConfirm}>
            确认本季目标
          </button>
        </div>
      </div>
    </div>
  );
}

export function NewsModal({
  state,
  onChoose,
}: {
  state: GameState;
  onChoose: (choice: 'face' | 'mitigate') => void;
}) {
  if (!state.eventId) return null;
  const event = eventById(state.eventId);
  const good = event.tone === 'good';
  const canMitigate = !good && state.cash >= NEWS_MITIGATE_COST;
  const visibleMaterials = MATERIALS.filter((item) => item.id !== 'd' || state.materialDUnlocked);
  const products = PRODUCTS.filter((item) => state.unlockedProducts.includes(item.id));
  return (
    <div className="overlay">
      <div className="modal sheet-card news-fall">
        <p className={`kicker tone-${event.tone}`}>
          {MONTH_NAMES[state.month - 1]} · {event.monthHint}
        </p>
        <h2>{event.title}</h2>
        <p className="lead briefing-digest">{marketDigest(state)}</p>
        <p className="lead">{event.body}</p>
        <div className={`event-impact tone-${event.tone}`}>
          <b>{good ? '利好' : '若硬扛'}</b>
          <p>{event.impact}</p>
        </div>
        <details className="quiet-details">
          <summary>本月行情</summary>
          <div className="mini-quotes">
            {visibleMaterials.map((item) => {
              const price = state.materialPrices[item.id];
              const delta = priceDelta(price, item.basePrice);
              return (
                <span key={item.id}>
                  {item.name} {money(price)} <em className={`delta-${delta.tone}`}>{delta.text}</em>
                </span>
              );
            })}
            {products.map((item) => {
              const price = state.productPrices[item.id] ?? item.basePrice;
              const delta = priceDelta(price, item.basePrice);
              return (
                <span key={item.id}>
                  {item.name} {money(price)} <em className={`delta-${delta.tone}`}>{delta.text}</em>
                </span>
              );
            })}
          </div>
        </details>
        <div className="footer-actions stacked">
          {good ? (
            <button className="btn" onClick={() => onChoose('face')}>
              收下
            </button>
          ) : (
            <>
              <button className="btn" onClick={() => onChoose('face')}>
                硬扛全额
              </button>
              <button className="btn ghost" disabled={!canMitigate} onClick={() => onChoose('mitigate')}>
                花 {money(NEWS_MITIGATE_COST)} 缓一档
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function ReportModal({
  state,
  onNext,
  onBooks,
  skipAnim,
}: {
  state: GameState;
  onNext: () => void;
  onBooks: () => void;
  skipAnim?: boolean;
}) {
  const report = state.lastReport;
  const [skip, setSkip] = useState(Boolean(skipAnim));
  if (!report) return null;
  const closing = Boolean(state.endKind);
  const { curr } = booksForView(state);
  const netProfit = netProfitOf(curr.ledger);
  const lines = report.story?.length
    ? report.story.filter((line, index, all) => all.indexOf(line) === index)
    : [report.sold > 0 ? `交付 ${report.productName}。` : '本月没有交成订单。', `现金现为 ${money(report.cash)}。`];
  return (
    <div className="overlay" onClick={() => setSkip(true)}>
      <div className="modal sheet-card" onClick={() => setSkip(true)}>
        <p className="kicker gold">{MONTH_NAMES[report.month - 1]} · 月报</p>
        <h2>{closing ? (state.endKind === 'bankrupt' ? '清算报告' : '年终决算') : '本月已结'}</h2>
        <div className={skip ? 'settle-story static' : 'settle-story typed'}>
          {lines
            .filter((line) => !line.startsWith('未交'))
            .map((line) => (
              <p key={line}>{line}</p>
            ))}
          {report.defaults?.map((item) => (
            <p key={`${item.productName}-${item.qty}`} className="stamp-line">
              未交 {item.productName} {item.qty} 件 · 罚 {money(item.penalty)}
            </p>
          ))}
        </div>
        <div className="settle-kpis">
          <div>
            <em>净利润</em>
            <b className={netProfit >= 0 ? 'good' : 'bad'}>{signedMoney(netProfit)}</b>
          </div>
          <div>
            <em>现金</em>
            <b>{money(report.cash)}</b>
          </div>
          <div>
            <em>净资产</em>
            <b className={report.netAssets < 0 ? 'bad' : ''}>{money(report.netAssets)}</b>
          </div>
        </div>
        <div className="footer-actions stacked" onClick={(event) => event.stopPropagation()}>
          <button className="btn ghost" onClick={onBooks}>
            翻开账本
          </button>
          <button className="btn" onClick={onNext}>
            {closing ? '查看结局' : '进入下月'}
          </button>
        </div>
      </div>
    </div>
  );
}
