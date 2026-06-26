import { RunnerProvider, useRunner } from '@/runner/runnerContext';
import LoginView from '@/runner/LoginView';
import HostDashboard from '@/runner/HostDashboard';

function RunnerInner() {
  const { session } = useRunner();
  return session.isLoggedIn ? <HostDashboard /> : <LoginView />;
}

export default function RunnerPage() {
  return (
    <RunnerProvider>
      <RunnerInner />
    </RunnerProvider>
  );
}
