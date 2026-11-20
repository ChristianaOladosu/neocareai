import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@fontsource/fraunces/400.css'; import '@fontsource/fraunces/500.css'; import '@fontsource/fraunces/600.css';
import '@fontsource/inter/400.css'; import '@fontsource/inter/500.css'; import '@fontsource/inter/600.css';
import '@fontsource/ibm-plex-mono/400.css'; import '@fontsource/ibm-plex-mono/600.css';
import './styles/tokens.css';
import './styles/motion.css';
import './styles/global.css';
import './styles/shell.css';
import './styles/landing.css';
import './styles/auth.css';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import App from './App';

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true, staleTime: 5000 } } });
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><QueryClientProvider client={qc}><BrowserRouter><ThemeProvider><AuthProvider><App /></AuthProvider></ThemeProvider></BrowserRouter></QueryClientProvider></React.StrictMode>,
);
