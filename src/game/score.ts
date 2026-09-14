import { BASIC_PENALTY, CHALLENGE_POINTS, QUARTER_LABEL, goalById } from './board';
import { scoreNetAssets } from './engine';
import type { GameState } from './types';

export interface ScoreLine {
  label: string;
  detail: string;
  points: number;
}

export function monthsSurvived(state: GameState): number {
  if (state.endKind === 'finished') return 12;
  if (state.endKind === 'bankrupt') return Math.max(0, state.month - 1);
  return state.month;
}

export function scoreTitleOf(total: number, kind: 'bankrupt' | 'finished' | null): string {
  if (kind === 'bankrupt') return '破产清算';
  if (total >= 42) return '商业帝国';
  if (total >= 28) return '行业新星';
  if (total >= 16) return '稳健经营';
  return '艰难度日';
}

export function scoreOf(state: GameState): { total: number; title: string; lines: ScoreLine[] } {
  const survive = monthsSurvived(state);
  const net = Math.max(0, scoreNetAssets(state));
  const netPoints = state.endKind === 'bankrupt' ? 0 : Math.floor(net / 40);
  const boardLines = (state.boardHistory ?? []).map((item) => {
    const basic = goalById(item.basicId);
    const hits = item.challengeHits.map((id) => goalById(id).name).join('、') || '无';
    const detail = item.basicOk
      ? `基本目标达成；兑现 ${hits}`
      : `基本目标「${basic.name}」未达成，扣 ${BASIC_PENALTY} 分；兑现 ${hits}`;
    return {
      label: `董事会 · ${QUARTER_LABEL[item.quarter]}`,
      detail,
      points: item.points,
    };
  });

  const lines: ScoreLine[] = [
    { label: '生存', detail: `活过 ${survive} 个月，每月 1 分`, points: survive },
    {
      label: '净资产',
      detail:
        state.endKind === 'bankrupt'
          ? '破产不计'
          : `原材料按账面净值一半计入，每 40 万 1 分，现 ${net}万`,
      points: netPoints,
    },
    ...boardLines,
  ];

  if (!boardLines.length && state.basicGoalId) {
    lines.push({
      label: '董事会',
      detail: '本季目标尚未到考核时点',
      points: 0,
    });
  }

  const total = lines.reduce((sum, line) => sum + line.points, 0);
  return { total, title: scoreTitleOf(total, state.endKind), lines };
}

export { CHALLENGE_POINTS };
