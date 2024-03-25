import React from 'react';
import ReactDOM from 'react-dom/client';
import { MainV } from './MainV.js';


// keep this entry point minimal since it's not hot-reloaded

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <MainV/>
  </React.StrictMode>
);
