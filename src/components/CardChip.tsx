import styles from './CardChip.module.css';

interface CardChipProps {
  letter: string;
  points: number;
  onRemove?: () => void;
}

export function CardChip({ letter, points, onRemove }: CardChipProps) {
  return (
    <span className={styles.chip}>
      {letter}
      <span className={styles.points}>{points}</span>
      {onRemove && (
        <button className={styles.remove} onClick={onRemove}>
          ×
        </button>
      )}
    </span>
  );
}
