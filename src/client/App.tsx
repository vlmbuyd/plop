import { PlannerCalendar } from './features/calendar/PlannerCalendar';
import { useCalendarState } from './features/calendar/useCalendarState';
import { ChatDock } from './features/chat/ChatDock';
import { ImportDialog } from './features/import/ImportDialog';
import { InboxPanel } from './features/inbox/InboxPanel';
import { ProfileSheet } from './features/profile/ProfileSheet';
import { ShortcutsDialog } from './features/shortcuts/ShortcutsDialog';
import { useShortcuts } from './features/shortcuts/useShortcuts';
import { useMorningPlan } from './features/suggestions/useMorningPlan';
import { Toast } from './shared/ui/Toast';

export function App() {
  const calendar = useCalendarState();
  useShortcuts(calendar);
  useMorningPlan();

  return (
    <main className="flex h-dvh bg-surface text-ink">
      <div className="relative flex min-w-0 flex-1 flex-col">
        <PlannerCalendar {...calendar} />
        <ChatDock />
      </div>
      <InboxPanel />
      <ProfileSheet />
      <ImportDialog />
      <ShortcutsDialog />
      <Toast />
    </main>
  );
}
