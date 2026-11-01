import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthPage } from './pages/Auth';
import { ClientPage } from './pages/Client';
import { JobPage } from './pages/Job';
import { JobsPage } from './pages/Jobs';
import { NewJobPage } from './pages/NewJob';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<AuthPage />} />
      <Route path="/jobs" element={<JobsPage />} />
      <Route path="/jobs/new" element={<NewJobPage />} />
      <Route path="/jobs/:id" element={<JobPage />} />
      <Route path="/c/:token" element={<ClientPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
