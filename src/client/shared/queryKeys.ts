export const queryKeys = {
  calendar: ['calendar'] as const,
  calendarRange: (from: string, to: string) => ['calendar', from, to] as const,
  inbox: ['inbox'] as const,
  chat: ['chat'] as const,
  profile: ['profile'] as const,
};
