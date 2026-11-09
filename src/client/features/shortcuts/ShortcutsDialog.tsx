import { Dialog } from '../../shared/ui/Dialog';
import { useUiStore } from '../../shared/uiStore';
import { SHORTCUTS } from './shortcuts';

export function ShortcutsDialog() {
  const { shortcutsOpen, setShortcutsOpen } = useUiStore();
  return (
    <Dialog open={shortcutsOpen} title="단축키" onClose={() => setShortcutsOpen(false)}>
      <ul className="flex flex-col">
        {SHORTCUTS.map((s) => (
          <li key={s.label + s.keys.join()} className="flex items-center justify-between border-b border-line py-2 text-sm last:border-0">
            <span>{s.label}</span>
            <span className="flex gap-1">
              {s.keys.map((k) => (
                <kbd key={k} className="min-w-6 rounded border border-line bg-surface-muted px-1.5 py-0.5 text-center font-sans text-xs">
                  {k}
                </kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
