import type { GameState, PlayerRoundScore, RoundBonuses } from '../types';
import { CARDS_PER_ROUND, TOTAL_ROUNDS, BONUS_POINTS } from '../types';
import styles from './Scoreboard.module.css';

interface ScoreboardProps {
  gameState: GameState;
}

function getStartPlayerIdx(round: number, playerCount: number): number {
  return round % playerCount;
}

function getRoundTotal(
  scores: (PlayerRoundScore | null)[][],
  bonuses: (RoundBonuses | null)[],
  playerIdx: number,
  upToRound: number
): number {
  let total = 0;
  for (let r = 0; r <= upToRound && r < scores.length; r++) {
    const score = scores[r]?.[playerIdx];
    if (score) {
      total += score.result.total;
    }
    const bonus = bonuses[r];
    if (bonus) {
      if (bonus.longestWordPlayerIdxs.includes(playerIdx)) total += BONUS_POINTS;
      if (bonus.mostWordsPlayerIdxs.includes(playerIdx)) total += BONUS_POINTS;
    }
  }
  return total;
}

function getCumulativeBonus(
  bonuses: (RoundBonuses | null)[],
  playerIdx: number,
  type: 'longest' | 'most'
): number {
  let total = 0;
  for (const bonus of bonuses) {
    if (!bonus) continue;
    const idxs = type === 'longest' ? bonus.longestWordPlayerIdxs : bonus.mostWordsPlayerIdxs;
    if (idxs.includes(playerIdx)) total += BONUS_POINTS;
  }
  return total;
}

export function Scoreboard({ gameState }: ScoreboardProps) {
  const { players, currentRound, scores, bonuses, complete } = gameState;
  const playerCount = players.length;

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.roundHeader}>Round</th>
            {players.map((p, i) => (
              <th key={i} className={styles.playerHeader}>{p.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: TOTAL_ROUNDS }, (_, roundIdx) => {
            const cardCount = CARDS_PER_ROUND[roundIdx];
            const startIdx = getStartPlayerIdx(roundIdx, playerCount);
            const startName = players[startIdx].name;
            const isCurrent = roundIdx === currentRound && !complete;
            const isPast = roundIdx < currentRound || complete;

            return (
              <tr key={roundIdx} className={isCurrent ? styles.currentRow : isPast ? styles.pastRow : styles.futureRow}>
                <td className={styles.roundCell}>
                  {isCurrent && <span className={styles.indicator}>&gt; </span>}
                  {cardCount} ({startName})
                </td>
                {players.map((_, playerIdx) => {
                  const score = scores[roundIdx]?.[playerIdx];
                  const isCurrentPlayer = isCurrent && !complete && playerIdx === gameState.currentPlayerIdx;

                  let cellContent: string;
                  if (score) {
                    cellContent = String(score.result.total);
                  } else if (isCurrent) {
                    cellContent = '--';
                  } else {
                    cellContent = '';
                  }

                  return (
                    <td
                      key={playerIdx}
                      className={`${styles.scoreCell} ${isCurrentPlayer ? styles.currentCell : ''}`}
                    >
                      {cellContent}
                    </td>
                  );
                })}
              </tr>
            );
          })}

          {/* Bonus rows */}
          <tr className={styles.bonusRow}>
            <td className={styles.bonusLabel}>+10 longest</td>
            {players.map((_, playerIdx) => {
              const total = getCumulativeBonus(bonuses, playerIdx, 'longest');
              return (
                <td key={playerIdx} className={styles.bonusCell}>
                  {total > 0 ? `+${total}` : ''}
                </td>
              );
            })}
          </tr>
          <tr className={styles.bonusRow}>
            <td className={styles.bonusLabel}>+10 most</td>
            {players.map((_, playerIdx) => {
              const total = getCumulativeBonus(bonuses, playerIdx, 'most');
              return (
                <td key={playerIdx} className={styles.bonusCell}>
                  {total > 0 ? `+${total}` : ''}
                </td>
              );
            })}
          </tr>

          {/* Total row */}
          <tr className={styles.totalRow}>
            <td className={styles.totalLabel}>Total</td>
            {players.map((_, playerIdx) => {
              const lastCompletedRound = complete ? TOTAL_ROUNDS - 1 : currentRound - 1;
              const total = lastCompletedRound >= 0
                ? getRoundTotal(scores, bonuses, playerIdx, complete ? TOTAL_ROUNDS - 1 : currentRound)
                : 0;
              return (
                <td key={playerIdx} className={styles.totalCell}>{total}</td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
