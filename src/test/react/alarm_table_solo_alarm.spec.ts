import { renderHook, act } from '@testing-library/react'
import { DataFrame } from '@grafana/data'
import { useAlarm } from '../../panels/alarm-table/hooks/useAlarm'
import { useAlarmTableSelection } from '../../panels/alarm-table/hooks/useAlarmTableSelection'
import { getAlarmIdFromRow, getAlarmIdsForRows } from '../../panels/alarm-table/AlarmTableHelper'

// Alarm IDs in OpenNMS always start at 1, so 0 is never a real alarm. -1 is the
// codebase's "nothing selected" sentinel.

const alarmFrame = (): DataFrame => ({ name: 'alarms', fields: [{ name: 'ID' } as any], length: 0 })

const rowWithIdText = (text: string | null) => {
  const row = document.createElement('div')
  row.setAttribute('role', 'row')
  const cell = document.createElement('div')

  if (text !== null) {
    cell.textContent = text
  }

  row.appendChild(cell)
  return row
}

describe('AlarmTableHelper :: getAlarmIdFromRow', () => {
  it('should read a real alarm id', () => {
    expect(getAlarmIdFromRow(rowWithIdText('9839'), alarmFrame())).toEqual(9839)
  })

  it('should return -1, never 0, for a blank or missing id cell', () => {
    // Number('') and Number(null) are both 0, and Number.isInteger(0) is true,
    // so an unguarded conversion yields a bogus alarm id of 0
    for (const text of ['', '   ', null]) {
      expect(getAlarmIdFromRow(rowWithIdText(text), alarmFrame())).toEqual(-1)
    }
  })

  it('should return -1 for non-numeric text', () => {
    expect(getAlarmIdFromRow(rowWithIdText('ID'), alarmFrame())).toEqual(-1)
  })

  it('should never put a 0 into the ids collected for a row range', () => {
    const rows = [rowWithIdText('9839'), rowWithIdText(''), rowWithIdText('9700')]

    expect(getAlarmIdsForRows(rows, alarmFrame())).not.toContain(0)
  })
})

describe('useAlarm', () => {
  const client = { getAlarm: jest.fn().mockResolvedValue({ id: 1 }) }
  const series = [{ name: 'alarms', fields: [], length: 0 }] as DataFrame[]

  beforeEach(() => client.getAlarm.mockClear())

  it('should fetch a real alarm', async () => {
    // awaited so the resolved setAlarm() settles inside act()
    await act(async () => { renderHook(() => useAlarm(series, 9839, client as any)) })

    expect(client.getAlarm).toHaveBeenCalledWith(9839)
  })

  it('should not request alarm 0', () => {
    renderHook(() => useAlarm(series, 0, client as any))
    expect(client.getAlarm).not.toHaveBeenCalled()
  })

  it('should not request an alarm when nothing is selected', () => {
    renderHook(() => useAlarm(series, -1, client as any))
    expect(client.getAlarm).not.toHaveBeenCalled()
  })
})

describe('useAlarmTableSelection :: multi-row selection', () => {
  const frame = alarmFrame()
  const rows = [rowWithIdText('101'), rowWithIdText('102'), rowWithIdText('103')]
  const click = (shiftKey = false) => ({ shiftKey, ctrlKey: false, detail: 1 }) as MouseEvent
  const table = document.createElement('div')

  it('should solo the clicked alarm on a plain click', () => {
    const { result } = renderHook(() => useAlarmTableSelection(jest.fn()))

    act(() => { result.current.rowClicked(table, 101, click(), rows, frame) })

    expect(result.current.soloAlarmId).toEqual(101)
  })

  it('should clear the solo alarm to -1 when a row range is selected', () => {
    const { result } = renderHook(() => useAlarmTableSelection(jest.fn()))

    act(() => { result.current.rowClicked(table, 101, click(), rows, frame) })
    act(() => { result.current.rowClicked(table, 103, click(true), rows, frame) })

    // multiple rows are selected, so no single alarm is soloed. Must be the -1
    // sentinel: 0 would be forwarded to useAlarm and fetched as api/v2/alarms/0
    expect(result.current.soloAlarmId).toEqual(-1)
    expect(result.current.soloAlarmId).not.toEqual(0)
    expect(result.current.alarmControlState.selectedAlarmIds.size).toBeGreaterThan(1)
  })
})
