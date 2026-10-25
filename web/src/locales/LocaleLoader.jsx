import { h, Fragment } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import axios from 'axios';
import { setLocaleMessages, t } from './index';

// Load once per full browser page load. Editing the host JSON requires only
// refreshing the browser (no Frigate or Docker restart).
export default function LocaleLoader({ children }) {
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState('');

  useEffect(() => {
    let mounted = true;
    axios.get('lang/de', {
      timeout: 5000,
      headers: { 'Cache-Control': 'no-cache' },
    }).then(({ data }) => {
      if (!mounted) return;
      if (!data?.messages || typeof data.messages !== 'object' || Array.isArray(data.messages)) {
        throw new Error('Invalid locale response');
      }
      setLocaleMessages(data.messages);
      setWarning(data.warning || '');
    }).catch(() => {
      if (!mounted) return;
      setLocaleMessages(null);
      setWarning(t('app.error.loading_translations'));
    }).finally(() => {
      if (mounted) setLoading(false);
    });

    return () => { mounted = false; };
  }, []);

  if (loading) {
    return (
      <div role="status" className="flex min-h-screen items-center justify-center bg-white text-slate-700 dark:bg-gray-900 dark:text-white">
        {t('app.status.loading_translations')}
      </div>
    );
  }

  return (
    <Fragment>
      {children}
      {warning && (
        <div role="alert" className="fixed bottom-4 right-4 z-50 flex max-w-md items-start gap-3 rounded-lg bg-slate-700 p-4 text-sm text-yellow-300 shadow-xl">
          <span>{warning}</span>
          <button type="button" aria-label={t('app.button.dismiss_warning')}
            className="shrink-0 rounded px-1 text-yellow-300 hover:bg-slate-600"
            onClick={() => setWarning('')}>×</button>
        </div>
      )}
    </Fragment>
  );
}
