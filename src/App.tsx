import { Routes, Route, Navigate } from 'react-router';
import Layout from '@/components/Layout';
import Home from '@/pages/Home';
import Onboarding from '@/pages/Onboarding';
import TrainSetup from '@/pages/TrainSetup';
import TrainSession from '@/pages/TrainSession';
import TrainResults from '@/pages/TrainResults';
import Library from '@/pages/Library';
import TermPage from '@/pages/TermPage';
import GraphPage from '@/pages/GraphPage';
import Stats from '@/pages/Stats';
import PageStub from '@/pages/PageStub';

function HomeGate() {
  if (localStorage.getItem('lingo-cards-onboarded') !== '1') {
    return <Navigate to="/welcome" replace />;
  }
  return <Home />;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomeGate />} />
        <Route path="welcome" element={<Onboarding />} />
        <Route path="train/setup" element={<TrainSetup />} />
        <Route path="train/session" element={<TrainSession />} />
        <Route path="train/results" element={<TrainResults />} />
        <Route path="library" element={<Library />} />
        <Route path="library/:termId" element={<TermPage />} />
        <Route path="graph" element={<GraphPage />} />
        <Route path="stats" element={<Stats />} />
        <Route path="*" element={<PageStub title="Страница не найдена" note="Проверьте адрес" />} />
      </Route>
    </Routes>
  );
}
