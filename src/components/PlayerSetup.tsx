import { useState } from 'react';
import type { Player } from '../types';
import { ActionButton } from './ActionButton';
import styles from './PlayerSetup.module.css';

interface PlayerSetupProps {
  onStart: (players: Player[]) => void;
  onBack: () => void;
}

const MAX_PLAYERS = 8;

export function PlayerSetup({ onStart, onBack }: PlayerSetupProps) {
  const [names, setNames] = useState<string[]>(Array(MAX_PLAYERS).fill(''));

  const updateName = (index: number, value: string) => {
    const updated = [...names];
    updated[index] = value;
    setNames(updated);
  };

  const players = names
    .map((n) => n.trim())
    .filter((n) => n.length > 0)
    .map((name) => ({ name }));

  const canStart = players.length >= 2;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button onClick={onBack} className={styles.back}>‹</button>
        <div>
          <h1 className={styles.title}>New Game</h1>
          <p className={styles.subtitle}>Enter player names in play order</p>
        </div>
      </div>

      <div className={styles.inputs}>
        {names.map((name, i) => (
          <input
            key={i}
            type="text"
            value={name}
            onChange={(e) => updateName(i, e.target.value)}
            placeholder={`Player ${i + 1}`}
            className={`${styles.input} ${name.trim() ? styles.inputFilled : ''}`}
            autoFocus={i === 0}
          />
        ))}
      </div>

      <div className={styles.footer}>
        <div className={styles.count}>
          {players.length} player{players.length !== 1 ? 's' : ''}
          {!canStart && <span className={styles.hint}> (need at least 2)</span>}
        </div>
        <ActionButton onClick={() => onStart(players)} disabled={!canStart}>
          Start Game
        </ActionButton>
      </div>
    </div>
  );
}
