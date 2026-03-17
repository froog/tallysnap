import styles from './Header.module.css';

interface HeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
}

export function Header({ title, subtitle, onBack }: HeaderProps) {
  return (
    <div className={styles.container}>
      <div className={styles.content}>
        {onBack && (
          <button onClick={onBack} className={styles.back}>
            ‹
          </button>
        )}
        <div>
          <h1 className={styles.title}>{title}</h1>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}
