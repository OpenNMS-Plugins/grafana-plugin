import React, { useState } from 'react'
import { PanelProps } from '@grafana/data'
import {
  Button,
  Combobox,
  ComboboxOption,
  Input,
  Stack,
  Switch,
  TextArea
} from '@grafana/ui'
import { FieldDisplay } from '../../components/FieldDisplay'
import { dashboardConvert, getDashboardTitle } from '../../lib/dashboard-convert'

interface DashboardConvertPanelProps {
}

const SourcePluginVersions = [
  { value: '8', label: 'Version 8' },
  { value: '9', label: 'Version 9' },
  { value: '10', label: 'Version 10' },
  { value: '11', label: 'Version 11' },
  { value: '12', label: 'Version 12' }
]

const TargetPluginVersions = [
  { value: '9', label: 'Version 9' },
  { value: '12', label: 'Version 12' }
]

export const DashboardConvertPanelControl: React.FC<PanelProps<DashboardConvertPanelProps>> = (props) => {
  const [sourcePluginVersion, setSourcePluginVersion] = useState<ComboboxOption<string>>(SourcePluginVersions[0])
  const [sourceDashboardJson, setSourceDashboardJson] = useState<string>()
  const [targetPluginVersion, setTargetPluginVersion] = useState<ComboboxOption<string>>(TargetPluginVersions[1])
  const [targetDashboardJson, setTargetDashboardJson] = useState<string>()
  const [dashboardTitle, setDashboardTitle] = useState<string>('')
  const [errorMessage, setErrorMessage] = useState<string>()
  const [unhideAllQueries, setUnhideAllQueries] = useState<boolean>(false)
  const [convertGraphToTimeSeries, setConvertGraphToTimeSeries] = useState<boolean>(false)

  const onSourceJsonUpdated = (text: string) => {
    if (!sourceDashboardJson) {
      // initial update, set the initial dashboard title
      const title = getDashboardTitle(text)

      if (title) {
        setDashboardTitle(title)
      }
    }

    setSourceDashboardJson(text)
  }

  const onTargetJsonUpdated = (text: string) => {
    setTargetDashboardJson(text)
  }

  const doConvert = () => {
    if (!sourcePluginVersion.value || !targetPluginVersion.value) {
      setErrorMessage('You must choose Plugin versions')
      return
    }

    if (!sourceDashboardJson) {
      setErrorMessage('You must enter source Dashboard json')
      return
    }

    const options = { unhideAllQueries, convertGraphToTimeSeries, incrementDashboardVersion: true }

    const sourcePluginVersionValue = Number(sourcePluginVersion.value ?? '0')
    const targetPluginVersionValue = Number(targetPluginVersion.value ?? '0')

    const target = dashboardConvert(sourceDashboardJson, sourcePluginVersionValue, targetPluginVersionValue,
      dashboardTitle, options)

    if (target.isError) {
      setErrorMessage(`Error converting: ${target.errorMessage || ''}`)
      setTargetDashboardJson('')
      return
    }

    setTargetDashboardJson(target.json)
    setErrorMessage('')
  }

  return (
    <>
      <style>
          {
              `
              .error {
                color: #f00;
                font-weight: bold;
              }
              .dashboard-title-input {
                min-width: 360px;
              }
              `
          }
      </style>
      <div>
        <Stack direction={'column'} rowGap={2}>
          <span>Convert Dashboard Json to use updated OpenNMS Plugin for Grafana datasources. We strongly suggest you use a Target Plugin Version of 12.</span>
          {
            errorMessage && (
              <div className={'error'}>
                { errorMessage }
              </div>
            )
          }
          <div>
            <span>Options</span>
            <Stack direction={'row'} columnGap={2}>
              <FieldDisplay>{'Unhide all queries:'}</FieldDisplay>
              <Switch
                  value={unhideAllQueries}
                  onChange={() => setUnhideAllQueries(!unhideAllQueries)}
              />
              <FieldDisplay>{'Convert Graph to Timeseries Panels:'}</FieldDisplay>
              <Switch
                  value={convertGraphToTimeSeries}
                  onChange={() => setConvertGraphToTimeSeries(!convertGraphToTimeSeries)}
              />
            </Stack>
          </div>

          <Stack direction={'row'} columnGap={2}>
            <FieldDisplay>{'Dashboard Title:'}</FieldDisplay>
            <Input
              className='dashboard-title-input'
              value={dashboardTitle}
              onChange={(el) => setDashboardTitle(el.currentTarget.value)}
            />
          </Stack>

          <Stack direction={'row'} columnGap={2}>
            <Stack direction={'column'} rowGap={2}>
              <Stack direction={'row'} columnGap={2}>
                <FieldDisplay>{'Source Plugin Version:'}</FieldDisplay>
                <Combobox
                    options={SourcePluginVersions}
                    value={sourcePluginVersion}
                    onChange={(value) => setSourcePluginVersion(value)} />
              </Stack>
              <TextArea
                placeholder='Enter Source Dashboard Json'
                rows={6}
                cols={40}
                value={sourceDashboardJson}
                onChange={(el) => onSourceJsonUpdated(el.currentTarget.value)}
              />
            </Stack>
            <Stack direction={'column'} rowGap={2}>
              <Stack direction={'row'} columnGap={2}>
                <FieldDisplay>{'Target Plugin Version:'}</FieldDisplay>
                <Combobox
                    options={TargetPluginVersions}
                    value={targetPluginVersion}
                    onChange={(value) => setTargetPluginVersion(value)} />
              </Stack>
              <TextArea
                placeholder='Target Dashboard Json can be copied from here after conversion'
                readOnly={true}
                rows={6}
                cols={40}
                value={targetDashboardJson}
                onChange={(el) => onTargetJsonUpdated(el.currentTarget.value)}
              />
            </Stack>
          </Stack>
          <Stack direction={'row'} columnGap={2}>
            <Button
              onClick={() => doConvert()}
            >
              Convert
            </Button>
          </Stack>
        </Stack>
      </div>
    </>
  )
}
