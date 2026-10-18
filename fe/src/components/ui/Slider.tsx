/**
 * Spotify-style slider (progress bar & volume): a thin bar that turns green and grows a knob on hover,
 * draggable with the mouse, adjustable with arrow keys. While dragging we only preview; the value is
 * committed on release (so seeking doesn't spam the backend).
 */
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import clsx from 'clsx';
import styles from './ui.module.css';

interface SliderProps {
  value: number;
  max: number;
  onChange?: (v: number) => void;
  onCommit: (v: number) => void;
  label: string;
  step?: number;
  disabled?: boolean;
  className?: string;
  /** Text for screen readers, e.g. "1:23". */
  valueText?: string;
}

export function Slider({ value, max, onChange, onCommit, label, step, disabled, className, valueText }: SliderProps) {
  const track = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const shown = drag ?? value;
  const pct = max > 0 ? Math.min(100, Math.max(0, (shown / max) * 100)) : 0;

  const valueAt = (clientX: number) => {
    const rect = track.current!.getBoundingClientRect();
    return Math.min(max, Math.max(0, ((clientX - rect.left) / rect.width) * max));
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const v = valueAt(e.clientX);
    setDrag(v);
    onChange?.(v);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (drag === null) return;
    const v = valueAt(e.clientX);
    setDrag(v);
    onChange?.(v);
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (drag === null) return;
    const v = valueAt(e.clientX);
    setDrag(null);
    onCommit(v);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const s = step ?? max / 20;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onCommit(Math.min(max, value + s));
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onCommit(Math.max(0, value - s));
    else return;
    e.preventDefault();
  };

  return (
    <div
      className={clsx(styles.slider, drag !== null && styles.dragging, disabled && styles.sliderDisabled, className)}
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      aria-valuetext={valueText}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onKeyDown={onKeyDown}
    >
      <div ref={track} className={styles.sliderTrack}>
        <div className={styles.sliderFill} style={{ width: `${pct}%` }} />
        <div className={styles.sliderKnob} style={{ left: `${pct}%` }} />
      </div>
    </div>
  );
}
