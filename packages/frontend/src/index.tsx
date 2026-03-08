import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/global.css';
import App from './App';
import * as serviceWorker from './sw/serviceWorker';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Register service worker for PWA offline support — production only.
// In development the SW's cache-first strategy conflicts with webpack HMR
// and causes constant page flashing.
if (process.env.NODE_ENV === 'production') {
  serviceWorker.register({
    onSuccess: () => console.log('Service worker registered successfully.'),
    onUpdate: () => console.log('New content available; please refresh.'),
    onError: (err) => console.error('Service worker registration failed:', err),
  });
}
