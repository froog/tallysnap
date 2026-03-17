import { useEffect, useState } from 'react';
import type { GamePlugin, Definition } from '../types';
import { lookupWord } from '../services/dictionaryApi';
import { CardChip } from './CardChip';
import styles from './WordRow.module.css';

interface WordRowProps {
  cards: string[];
  plugin: GamePlugin;
  isValid?: boolean | null;
  onRemoveCard?: (index: number) => void;
  onEditWord?: () => void;
}

export function WordRow({ cards, plugin, isValid, onRemoveCard, onEditWord }: WordRowProps) {
  const points = plugin.wordPoints(cards);
  const word = cards.map((c) => c.toUpperCase()).join("");
  const letterCount = plugin.wordLetterCount(cards);
  const [definition, setDefinition] = useState<Definition | null>(null);

  useEffect(() => {
    if (isValid === true) {
      lookupWord(word).then(setDefinition);
    }
  }, [word, isValid]);

  const rowClass = isValid === false 
    ? styles.invalid 
    : isValid === true 
    ? styles.valid 
    : styles.neutral;

  return (
    <div className={`${styles.row} ${rowClass}`}>
      <div className={styles.top}>
        <div className={styles.cards}>
          {cards.map((c, i) => (
            <CardChip
              key={i}
              letter={c.toUpperCase()}
              points={plugin.cardPoints(c)}
              onRemove={onRemoveCard ? () => onRemoveCard(i) : undefined}
            />
          ))}
        </div>
        <div className={styles.score}>
          <div className={styles.points}>{points}</div>
          <div className={styles.letters}>{letterCount} letters</div>
        </div>
      </div>
      <div className={styles.bottom}>
        <span className={`${styles.word} ${isValid === false ? styles.invalidText : isValid === true ? styles.validText : ''}`}>
          {word} {isValid === true ? "✓" : isValid === false ? "✗ not in dictionary" : "…"}
        </span>
        {onEditWord && (
          <button onClick={onEditWord} className={styles.edit}>
            Edit
          </button>
        )}
      </div>
      {definition && (
        <div className={styles.definition}>
          {definition.word} ({definition.partOfSpeech}) {definition.definition}
        </div>
      )}
    </div>
  );
}
