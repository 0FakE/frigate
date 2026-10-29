import axios from 'axios';
import { requestFrigateRestart } from './restartMonitor';

// Validate/save exactly once; the backend restart option is deliberately not
// used because the shared AppBar monitor needs to capture the old process.
export async function saveConfigAndMaybeRestart(contents, option, onSaved) {
  const response = await axios.post('config/save?save_option=saveonly', contents, {
    headers: { 'Content-Type': 'text/plain' },
  });
  if (response.status !== 200 || response.data?.success === false) {
    throw new Error(response.data?.message || 'Config could not be saved.');
  }

  onSaved?.();

  if (option === 'restart') {
    requestFrigateRestart();
    return '';
  }
  return response.data?.message || '';
}
