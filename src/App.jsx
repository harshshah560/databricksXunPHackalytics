import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import { ThemeProvider } from './context/ThemeContext';
import Layout from './components/Layout';
import Landing from './pages/Landing/Landing';
import Wiki from './pages/Wiki/Wiki';
import Simulation from './pages/Simulation/Simulation';

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Landing />} />
            <Route path="/wiki" element={<Wiki />} />
            <Route path="/forecast" element={<Simulation />} />
          </Route>
        </Routes>
        <Analytics />
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
