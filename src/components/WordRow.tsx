import { useEffect, useState } from 'react';
import type { GamePlugin, Definition } from '../types';
import { lookupWord } from '../services/dictionaryApi';
import { CardChip } from './CardChip';
import styles from './WordRow.module.css';

interface WordRowProps {
  cards: string[];
  plugin: GamePlugin;
  isValid?: boolean;
  unused?: boolean;
  onRemoveCard?: (index: number) => void;
  onEditWord?: () => void;
}

export function WordRow({ cards, plugin, isValid, unused, onRemoveCard, onEditWord }: WordRowProps) {
  const points = plugin.wordPoints(cards);
  const word = cards.map((c) => c.toUpperCase()).join("");
  const letterCount = plugin.wordLetterCount(cards);
  const [definition, setDefinition] = useState<Definition | null>(null);

  useEffect(() => {
    if (isValid === true && !unused) {
      lookupWord(word).then(setDefinition);
    }
  }, [word, isValid, unused]);

  const rowClass = unused
    ? styles.unused
    : isValid === false 
    ? styles.invalid 
    : isValid === true 
    ? styles.valid 
    : styles.neutral;

  const statusText = unused
    ? cards.length < 2
      ? `${word} unused`
      : `${word} unused — not in dictionary`
    : isValid === true
    ? `${word} ✓`
    : isValid === false
    ? `${word} ✗ not in dictionary`
    : `${word} …`;

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
          <div className={unused ? styles.pointsUnused : styles.points}>
            {unused ? `-${points}` : points}
          </div>
          <div className={styles.letters}>{letterCount} {letterCount === 1 ? 'letter' : 'letters'}</div>
        </div>
      </div>
      <div className={styles.bottom}>
        <span className={`${styles.word} ${unused ? styles.unusedText : isValid === false ? styles.invalidText : isValid === true ? styles.validText : ''}`}>
          {statusText}
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
