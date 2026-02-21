import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import Layout from './components/Layout';
import Landing from './pages/Landing/Landing';
import Wiki from './pages/Wiki/Wiki';
import Visualizations from './pages/Visualizations/Visualizations';
import Simulation from './pages/Simulation/Simulation';

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Landing />} />
            <Route path="/wiki" element={<Wiki />} />
            <Route path="/visualizations" element={<Visualizations />} />
            <Route path="/simulation" element={<Simulation />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
