import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Dialog } from '../../shared/ui/Dialog';
import { useUiStore } from '../../shared/uiStore';

interface ImportSummary {
  imported: number;

  scheduled: number;

  inbox: number;

  recurring: number;

  skipped: number;

  unsupportedRepeat: number;
}

export function ImportDialog() {
  const { importOpen, setImportOpen } = useUiStore();
  const client = useQueryClient();
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const res = await fetch('/api/import/ticktick', { method: 'POST', headers: { 'content-type': 'text/csv' }, body: await file.text() });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? '가져오지 못했어요.');
      return body as ImportSummary;
    },
    onSuccess: (result) => {
      setSummary(result);
      void client.invalidateQueries();
    },
  });

  const close = () => {
    setImportOpen(false);
    setSummary(null);
    upload.reset();
  };

  return (
    <Dialog open={importOpen} title="TickTick 가져오기" onClose={close}>
      <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-ink-muted">
        <li>TickTick 웹이나 데스크톱 앱에서 설정 &gt; 계정 &gt; 백업으로 들어갑니다.</li>
        <li>백업 파일(CSV)을 내려받습니다.</li>
        <li>아래에서 그 파일을 고릅니다. 완료하지 않은 할 일만 가져오고, 목록 구분은 AI가 다시 묶어요.</li>
      </ol>

      <label className="flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-line py-6 text-sm hover:bg-surface-muted">
        {upload.isPending ? '가져오는 중…' : 'CSV 파일 고르기'}
        <input
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload.mutate(file);
            e.target.value = '';
          }}
        />
      </label>

      {upload.error ? <p className="mt-3 text-sm text-accent">{upload.error.message}</p> : null}

      {summary ? (
        <div className="mt-4 rounded-lg bg-surface-muted p-3 text-sm leading-relaxed">
          <p className="font-medium">할 일 {summary.imported}개를 가져왔어요.</p>
          <p className="text-ink-muted">
            캘린더 {summary.scheduled}개(반복 {summary.recurring}개), 목록 {summary.inbox}개. 완료했거나 이미 가져온 {summary.skipped}개는 건너뛰었어요.
          </p>
          {summary.unsupportedRepeat > 0 ? (
            <p className="text-ink-muted">격주처럼 Plop이 아직 지원하지 않는 반복 {summary.unsupportedRepeat}개는 한 번짜리 일정으로 가져왔어요.</p>
          ) : null}
        </div>
      ) : null}
    </Dialog>
  );
}
