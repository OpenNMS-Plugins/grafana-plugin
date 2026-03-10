export const fontSizeOptions = [
    { label: '80%', value: 0 },
    { label: '90%', value: 1 },
    { label: '100%', value: 2 },
    { label: '110%', value: 3 },
    { label: '120%', value: 4 },
    { label: '130%', value: 5 },
    { label: '140%', value: 6 },
    { label: '150%', value: 7 },
    { label: '160%', value: 8 },
    { label: '180%', value: 9 },
    { label: '200%', value: 10 },
    { label: '220%', value: 11 },
    { label: '250%', value: 12 },
]

export const alarmSeverityThemeOptions = [
    { label: 'Default', value: 0 },
    { label: 'OpenNMS', value: 1 },
    { label: 'Oh My!', value: 2 },
    { label: 'No, Never Mind (i)', value: 3 },
    { label: 'That\'s Cool', value: 4 },
    { label: 'Custom', value: 5 }
]

// value matches index in entity-ds/queryAlarms columns
export const alarmTableDefaultColumns = [
  { label: 'Is Acknowledged', value: 20 },
  { label: 'Severity', value: 5 },
  { label: 'Count', value: 1 },
  { label: 'Last Event Time', value: 23 },
  { label: 'Location', value: 8 },
  { label: 'Node Label', value: 14 },
  { label: 'Log Message', value: 9 },
  { label: 'ID', value: 0 },
]
