import { h } from 'preact';
import { useId } from 'preact/hooks';
import Dialog from './Dialog';
import { t } from '../locales';

const styles = {
  neutral: 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700',
  primary: 'border-blue-600 bg-blue-600 text-white hover:bg-blue-500',
  danger: 'border-red-600 bg-red-600 text-white hover:bg-red-500',
};

function PromptSymbol({ variant }) {
  const alert = variant === 'error' || variant === 'warning';
  const danger = variant === 'error';
  return (
    <span aria-hidden="true"
      className={`mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full ${alert
        ? (danger ? 'bg-red-500/15 text-red-500' : 'bg-amber-500/15 text-amber-500')
        : 'bg-blue-500/15 text-blue-500'}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
        strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
        {variant === 'restart' ? (
          <path d="M20 7v5h-5M4 17v-5h5M5.5 9A7 7 0 0 1 18.7 7L20 12M4 12l1.3 5A7 7 0 0 0 18.5 15" />
        ) : alert ? (
          <><path d="M12 3 2.5 20h19L12 3Z" /><path d="M12 9v5M12 17h.01" /></>
        ) : variant === 'info' ? (
          <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>
        ) : (
          <><circle cx="12" cy="12" r="9" /><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4M12 17h.01" /></>
        )}
      </svg>
    </span>
  );
}

// Action shape and optional generic content remain compatible with existing
// Prompt users. No close icon/backdrop/Escape dismissal: choose an action.
export default function Prompt({ actions = [], title, text, children, variant = 'confirmation' }) {
  const titleId = useId();
  const descriptionId = useId();
  return (
    <Dialog labelledBy={titleId} describedBy={text ? descriptionId : undefined}>
      <div className="px-5 py-6 text-center sm:px-8 sm:py-8">
        <PromptSymbol variant={variant} />
        <h2 id={titleId} className="text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl">
          {title}
        </h2>
        {text && (
          <p id={descriptionId} className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-600 dark:text-slate-300 sm:text-base">
            {text}
          </p>
        )}
        {children}
        {actions.length > 0 && (
          <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row-reverse">
            {actions.map(({ color, text: actionText, onClick, className = '', ...props }, i) => (
              <button key={i} type="button"
                data-dialog-initial-focus={actions.length > 1 && i === actions.length - 1 ? 'true' : undefined}
                className={`flex min-h-11 w-full min-w-0 flex-1 items-center justify-center rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 disabled:cursor-not-allowed disabled:opacity-50 ${i === 0
                  ? (color === 'red' ? styles.danger : styles.primary)
                  : styles.neutral} ${className}`}
                onClick={onClick} {...props}>
                {actionText}
              </button>
            ))}
          </div>
        )}
        {actions.length === 0 && variant === 'info' && (
          <div role="status" aria-label={t('app.modal.please_wait')} className="mt-6 flex justify-center">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          </div>
        )}
      </div>
    </Dialog>
  );
}
