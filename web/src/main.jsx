import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import Falla from './components/Falla.jsx';
import { SesionProvider } from './sesion.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <SesionProvider>
        <Falla>
          <App />
        </Falla>
      </SesionProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
