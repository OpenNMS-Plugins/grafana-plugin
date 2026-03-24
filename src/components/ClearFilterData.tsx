import React, { useState } from 'react'
import { css } from '@emotion/css'
import { GrafanaTheme2 } from '@grafana/data'
import { Button, useStyles2 } from '@grafana/ui'
import { clearFilterEditorData } from '../lib/localStorageService'

export const ClearFilterData: React.FC<{}> = () => {
  const [filterDataCleared, setFilterDataCleared] = useState<boolean>(false)

  const clearFilterData = () => {
    clearFilterEditorData()
    setFilterDataCleared(true)
  }

  const getStyles = (theme: GrafanaTheme2) => ({
    spacer: css`
      margin-top: ${theme.spacing(2)};
      margin-bottom: ${theme.spacing(2)};
    `,
  })

  const s = useStyles2(getStyles)

  return (
    <>
      <h3 className={s.spacer}>Filter Data</h3>
      <div className={s.spacer}>
        OpenNMS Filter Panel data is stored in browser local storage.
        Click here to remove any existing filter data.
      </div>
      <Button
        onClick={() => clearFilterData()}
      >
        Clear Filter Data
      </Button>
      {
        filterDataCleared &&
        <div className={s.spacer}>Filter data was cleared.</div>
      }
    </>
  )
}
