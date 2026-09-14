export function TitleScreen({ onStart }: { onStart: () => void }) {
  return (
    <section className="title-screen">
      <div className="title-card">
        <p className="kicker">Solo Board Game</p>
        <h1>CASHFLOW</h1>
        <p className="sub">十二个月 · 北港制造。接单是承诺，交不出要罚。</p>
        <div className="month-track" aria-hidden>
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="month-pip on" />
          ))}
        </div>
        <div className="rule-grid">
          <article className="rule">
            <b>花钱看牌</b>
            <p>开局就能刷新决策卡。买入只花现金；打出才耗行动点。</p>
          </article>
          <article className="rule">
            <b>接单再补</b>
            <p>可以超出现有产能去接。看毛利、看缺口，锁定后交不出按件罚 0.5 万。</p>
          </article>
          <article className="rule">
            <b>活过一年</b>
            <p>净资产为负即破产。撑过十二月，按生存、董事会和净资产计分。</p>
          </article>
        </div>
        <button className="btn" onClick={onStart}>
          开始经营
        </button>
      </div>
    </section>
  );
}
