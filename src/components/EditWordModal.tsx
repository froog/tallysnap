import { useState } from 'react';
import type { GamePlugin } from '../types';
import { CardChip } from './CardChip';
import { ActionButton } from './ActionButton';
import styles from './EditWordModal.module.css';

interface EditWordModalProps {
  cards: string[];
  plugin: GamePlugin;
  onSave: (cards: string[]) => void;
  onCancel: () => void;
  onDelete: () => void;
}

export function EditWordModal({ cards: initialCards, plugin, onSave, onCancel, onDelete }: EditWordModalProps) {
  const [cards, setCards] = useState([...initialCards]);
  const [newCard, setNewCard] = useState("");

  const addCard = () => {
    const val = newCard.trim().toUpperCase();
    if (val && (plugin.cardTable[val] !== undefined)) {
      setCards([...cards, val]);
      setNewCard("");
    }
  };

  const removeCard = (idx: number) => setCards(cards.filter((_, i) => i !== idx));

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h3 className={styles.title}>Edit Word</h3>

        <div className={styles.cards}>
          {cards.map((c, i) => (
            <CardChip key={i} letter={c} points={plugin.cardPoints(c)} onRemove={() => removeCard(i)} />
          ))}
        </div>

        <div className={styles.inputRow}>
          <input
            value={newCard}
            onChange={(e) => setNewCard(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && addCard()}
            placeholder="Add card (e.g. T, TH)"
            className={styles.input}
          />
          <button onClick={addCard} className={styles.add}>
            +
          </button>
        </div>

        <div className={styles.actions}>
          <ActionButton variant="ghost" onClick={onDelete} className={styles.delete}>
            Delete Word
          </ActionButton>
          <ActionButton variant="secondary" onClick={onCancel}>Cancel</ActionButton>
          <ActionButton onClick={() => onSave(cards)} disabled={cards.length < 2}>Save</ActionButton>
        </div>
      </div>
    </div>
  );
}
