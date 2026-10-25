import { render } from 'preact'
import App from './app'
import { ApiProvider } from './api';
import LocaleLoader from './locales/LocaleLoader';
import './index.css'

render(<ApiProvider>
    <LocaleLoader>
      <App />
    </LocaleLoader>
  </ApiProvider>, document.getElementById('app') as HTMLElement)
