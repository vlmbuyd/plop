# Plop

떠오른 할 일을 날짜 없이 적어 두면, AI가 내 습관을 보고 캘린더 빈 시간에 배치를 제안하는 플래너입니다.
기획은 [PLAN.md](./PLAN.md)에 있습니다.

## 실행

Node 22.12 이상과 pnpm이 필요합니다.

```bash
pnpm install
pnpm start   # 매일 쓰는 버전. http://127.0.0.1:4317
pnpm dev     # 개발용. http://localhost:5173 (데이터는 ./.data에 따로 저장)
```

## 데이터 위치

- `pnpm start`: `~/Library/Application Support/Plop/plop.db`
- `pnpm dev`: 저장소 안 `./.data/plop.db` (git에 올라가지 않음)

다른 위치를 쓰려면 `PLOP_DATA_DIR`을 지정합니다.
