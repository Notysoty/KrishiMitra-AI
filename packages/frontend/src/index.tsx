import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import * as serviceWorker from './sw/serviceWorker';
import { startBackgroundSync } from './services/backgroundSync';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Register service worker for PWA offline support
serviceWorker.register({
  onSuccess: () => console.log('Service worker registered successfully.'),
  onUpdate: () => console.log('New content available; please refresh.'),
  onError: (err) => console.error('Service worker registration failed:', err),
});

// Start background sync to replay queued requests when connectivity returns
startBackgroundSync();
