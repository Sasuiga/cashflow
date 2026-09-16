import { useEffect, useRef, useState } from 'react';
import type { GameAction } from '../game/types';

/**
 * 悬浮菜单：右下角一枚圆形按钮，展开后在桌面端居中、在手机端自底部滑出，
 * 提供「重开一局」与「回到标题」。重开为破坏性操作，面板内二次确认。
 */
export function GameMenu({ dispatch }: { dispatch: (action: GameAction) => void }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const close = () => {
    setOpen(false);
    setConfirming(false);
  };

  useEffect(() => {
    if (!open) return;
    cardRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="menu-fab"
        aria-label="菜单"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <span className="menu-fab-bars" aria-hidden>
          <i />
          <i />
          <i />
        </span>
      </button>

      {open && (
        <div
          className="menu-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div className="menu-card" role="dialog" aria-label="菜单" ref={cardRef} tabIndex={-1}>
            <p className="kicker">菜单</p>
            {confirming ? (
              <div className="menu-confirm">
                <b>重开一局？</b>
                <p>回到第 1 月董事会。现金、目标、人事与研发进度全部重置。</p>
                <div className="menu-confirm-actions">
                  <button
                    className="btn"
                    onClick={() => {
                      dispatch({ type: 'RESTART' });
                      close();
                    }}
                  >
                    确认重开
                  </button>
                  <button className="btn ghost" onClick={() => setConfirming(false)}>
                    再想想
                  </button>
                </div>
              </div>
            ) : (
              <div className="menu-list">
                <button type="button" className="menu-item" onClick={() => setConfirming(true)}>
                  <span className="menu-item-text">
                    <b>重开一局</b>
                    <small>回到第 1 月，全部重置</small>
                  </span>
                </button>
                <button
                  type="button"
                  className="menu-item"
                  onClick={() => {
                    dispatch({ type: 'TO_TITLE' });
                    close();
                  }}
                >
                  <span className="menu-item-text">
                    <b>回到标题</b>
                    <small>查看规则说明</small>
                  </span>
                </button>
                <div className="footer-actions">
                  <button className="btn ghost" onClick={close}>
                    继续经营
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
