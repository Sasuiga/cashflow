import { useState } from 'react';
import { netAssetsOf } from '../game/engine';
import { MONTH_NAMES, money } from '../game/format';
import type { GameAction, GameState } from '../game/types';
import { FinancePage } from './FinancePage';
import { JournalPage } from './JournalPage';
import { OperationsPage } from './OperationsPage';

type MainPage = 'ops' | 'books' | 'journal';

export function Board({
  state,
  dispatch,
}: {
  state: GameState;
  dispatch: (action: GameAction) => void;
}) {
  const [page, setPage] = useState<MainPage>('ops');

  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <div className="brand">
            CASHFLOW
            <span>
              {MONTH_NAMES[state.month - 1]} · 第 {state.month}/12 月 · 北港制造
            </span>
          </div>
          <div className="month-track" style={{ margin: '14px 0 0', width: 280 }}>
            {Array.from({ length: 12 }, (_, i) => (
              <div key={i} className={i < state.month ? 'month-pip on' : 'month-pip'} />
            ))}
          </div>
        </div>
        <div className="stats">
          <div className={`stat ${state.cash < 8 ? 'bad' : 'good'}`}>
            <em>现金</em>
            <strong>{money(state.cash)}</strong>
          </div>
          <div className="stat">
            <em>负债</em>
            <strong>{money(state.debt)}</strong>
          </div>
          <div className={`stat ${netAssetsOf(state) < 20 ? 'bad' : 'good'}`}>
            <em>净资产</em>
            <strong>{money(netAssetsOf(state))}</strong>
          </div>
          <div className="stat">
            <em>
              行动点 {state.ap}/{state.maxAp}
            </em>
            <div className="ap-row">
              {Array.from({ length: state.maxAp }, (_, i) => (
                <i key={i} className={i < state.ap ? 'ap fill' : 'ap'} />
              ))}
            </div>
          </div>
        </div>
      </header>

      <nav className="tabs" aria-label="主页面">
        <button className={page === 'ops' ? 'tab on' : 'tab'} onClick={() => setPage('ops')}>
          经营
        </button>
        <button className={page === 'books' ? 'tab on' : 'tab'} onClick={() => setPage('books')}>
          财务报表
        </button>
        <button className={page === 'journal' ? 'tab on' : 'tab'} onClick={() => setPage('journal')}>
          日志与成就
        </button>
      </nav>

      {page === 'books' && <FinancePage state={state} />}
      {page === 'journal' && <JournalPage state={state} />}
      {page === 'ops' && <OperationsPage state={state} dispatch={dispatch} />}
    </div>
  );
}
