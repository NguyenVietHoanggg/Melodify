/**
 * Form controls in Spotify's style (accounts pages, settings, upload studio, checkout).
 * They are thin wrappers around native inputs, so keyboard, autofill and screen readers just work.
 */
import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { Icon } from '../icons/Icon';
import styles from './form.module.css';

export function FieldError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p className={styles.error} role="alert">
      <Icon name="warning" size={16} />
      <span>{children}</span>
    </p>
  );
}

interface FieldProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Appears to the right of the label (e.g. "Forgot your password?"). */
  aside?: ReactNode;
}

export const TextField = forwardRef<HTMLInputElement, FieldProps & InputHTMLAttributes<HTMLInputElement>>(function TextField(
  { label, hint, error, aside, className, type = 'text', id, ...rest },
  ref,
) {
  const { t } = useTranslation();
  const auto = useId();
  const inputId = id ?? auto;
  const [reveal, setReveal] = useState(false);
  const isPassword = type === 'password';
  return (
    <div className={clsx(styles.field, className)}>
      {(label || aside) && (
        <div className={styles.labelRow}>
          {label && <label htmlFor={inputId} className={styles.label}>{label}</label>}
          {aside}
        </div>
      )}
      <div className={styles.inputWrap}>
        <input
          ref={ref}
          id={inputId}
          type={isPassword && reveal ? 'text' : type}
          className={clsx(styles.input, error && styles.invalid, isPassword && styles.withButton)}
          aria-invalid={Boolean(error)}
          {...rest}
        />
        {isPassword && (
          <button type="button" className={styles.reveal} onClick={() => setReveal((v) => !v)} aria-label={reveal ? t('auth.hidePassword') : t('auth.showPassword')}>
            <Icon name={reveal ? 'eyeOff' : 'eye'} size={20} />
          </button>
        )}
      </div>
      {hint && !error && <p className={styles.hint}>{hint}</p>}
      <FieldError>{error}</FieldError>
    </div>
  );
});

export const TextArea = forwardRef<HTMLTextAreaElement, FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea(
  { label, hint, error, className, id, ...rest },
  ref,
) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <div className={clsx(styles.field, className)}>
      {label && <label htmlFor={inputId} className={styles.label}>{label}</label>}
      <textarea ref={ref} id={inputId} className={clsx(styles.input, styles.textarea, error && styles.invalid)} aria-invalid={Boolean(error)} {...rest} />
      {hint && !error && <p className={styles.hint}>{hint}</p>}
      <FieldError>{error}</FieldError>
    </div>
  );
});

export const SelectField = forwardRef<HTMLSelectElement, FieldProps & SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[] }>(
  function SelectField({ label, hint, error, className, id, options, ...rest }, ref) {
    const auto = useId();
    const inputId = id ?? auto;
    return (
      <div className={clsx(styles.field, className)}>
        {label && <label htmlFor={inputId} className={styles.label}>{label}</label>}
        <div className={styles.selectWrap}>
          <select ref={ref} id={inputId} className={clsx(styles.input, styles.select, error && styles.invalid)} aria-invalid={Boolean(error)} {...rest}>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <Icon name="chevronDown" size={16} className={styles.selectIcon} />
        </div>
        {hint && !error && <p className={styles.hint}>{hint}</p>}
        <FieldError>{error}</FieldError>
      </div>
    );
  },
);

/** Spotify's Encore toggle: 28×16 track, 12px knob, green when on. */
export function Toggle({ checked, onChange, label, disabled, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; id?: string }) {
  return (
    <label className={clsx(styles.toggle, disabled && styles.disabled)}>
      <input
        id={id}
        type="checkbox"
        role="switch"
        className={styles.toggleInput}
        checked={checked}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className={styles.toggleTrack}>
        <span className={styles.toggleKnob} />
      </span>
    </label>
  );
}

export function Checkbox({ checked, onChange, children, error }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; error?: boolean }) {
  return (
    <label className={clsx(styles.checkbox, error && styles.checkboxError)}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className={styles.box} aria-hidden>
        {checked && <Icon name="check" size={12} />}
      </span>
      <span>{children}</span>
    </label>
  );
}

/** Pill-shaped radio buttons (gender in sign-up, visibility in the upload studio). */
export function RadioGroup<T extends string>({
  name, value, onChange, options, className,
}: {
  name: string;
  value: T | null;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; hint?: ReactNode }[];
  className?: string;
}) {
  return (
    <div className={clsx(styles.radios, className)} role="radiogroup">
      {options.map((o) => (
        <label key={o.value} className={clsx(styles.radio, value === o.value && styles.radioOn)}>
          <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
          <span className={styles.dotOuter} aria-hidden>
            <span className={styles.dotInner} />
          </span>
          <span className={styles.radioText}>
            <span>{o.label}</span>
            {o.hint && <span className={styles.radioHint}>{o.hint}</span>}
          </span>
        </label>
      ))}
    </div>
  );
}
