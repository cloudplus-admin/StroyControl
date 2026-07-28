/** Палитра, взятая из design/02-object-gantt.html и design/03-tasks-kanban.html как стилевой ориентир. */
export const colors = {
  background: '#fafbfc',
  surface: '#ffffff',
  border: '#e4e7ec',
  borderStrong: '#d0d5dd',
  textMuted: '#667085',
  textDefault: '#1d2939',
  primary: '#5b8def',
  success: '#17cf7d',
  warning: '#ffb347',
  danger: '#ff6b61',
};

export const riskColors: Record<'overdue' | 'risk' | 'on_track', string> = {
  overdue: colors.danger,
  risk: colors.warning,
  on_track: colors.success,
};
