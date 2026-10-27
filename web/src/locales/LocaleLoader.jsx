import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import axios from 'axios';
import { setLocaleMessages, t } from './index';

// Load once per full browser page load. Editing the host JSON requires only
// refreshing the browser (no Frigate or Docker restart).
export default function LocaleLoader({ children }) {
  const [loading, setLoading] = useState(true);

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
      // Server-side file errors are already recorded by the Frigate logger.
      // Do not render an additional warning in the camera UI.
    }).catch((error) => {
      if (!mounted) return;
      setLocaleMessages(null);
      // If the API is unreachable, logging back to Frigate may also fail.
      // Keep diagnostic details in the browser console in that case.
      // eslint-disable-next-line no-console
      console.warn(t('app.error.loading_translations'), error);
      const reason = error?.message === 'Invalid locale response' ? 'invalid_response' : 'request_failed';
      const status = Number.isInteger(error?.response?.status) ? error.response.status : null;
      axios.post('lang/de/client-warning', { reason, status }).catch(() => {
        // The console warning above remains available if the server is offline.
      });
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

  return children;
}
