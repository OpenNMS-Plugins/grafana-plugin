import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { DataSourceSettings } from '@grafana/data'
import { EntityDataSourceOptions } from '../../datasources/entity-ds/types'
import { OpenNMSBaseUrlConfig } from '../../datasources/entity-ds/OpenNMSBaseUrlConfig'

const settingsWith = (jsonData: object) =>
  ({ jsonData: { path: 'keep-me', ...jsonData } } as DataSourceSettings<EntityDataSourceOptions>)

describe('OpenNMSBaseUrlConfig', () => {
  it('should show the setting as off, with the url disabled, for a datasource that has never used it', () => {
    render(<OpenNMSBaseUrlConfig options={settingsWith({})} onOptionsChange={jest.fn()} />)

    expect(screen.getByRole('switch')).not.toBeChecked()
    expect(screen.getByRole('textbox')).toBeDisabled()
  })

  it('should enable the url input once the setting is switched on', () => {
    render(<OpenNMSBaseUrlConfig options={settingsWith({ useOpenNMSBaseUrl: true })} onOptionsChange={jest.fn()} />)

    expect(screen.getByRole('switch')).toBeChecked()
    expect(screen.getByRole('textbox')).toBeEnabled()
  })

  it('should turn the setting on without discarding other jsonData', () => {
    const onOptionsChange = jest.fn()
    render(<OpenNMSBaseUrlConfig options={settingsWith({})} onOptionsChange={onOptionsChange} />)

    fireEvent.click(screen.getByRole('switch'))

    expect(onOptionsChange).toHaveBeenCalledWith(
      expect.objectContaining({ jsonData: { path: 'keep-me', useOpenNMSBaseUrl: true } })
    )
  })

  it('should turn the setting back off, keeping the saved url', () => {
    const onOptionsChange = jest.fn()
    const options = settingsWith({ useOpenNMSBaseUrl: true, opennmsBaseUrl: 'http://localhost:8980/opennms' })
    render(<OpenNMSBaseUrlConfig options={options} onOptionsChange={onOptionsChange} />)

    fireEvent.click(screen.getByRole('switch'))

    expect(onOptionsChange).toHaveBeenCalledWith(
      expect.objectContaining({
        jsonData: {
          path: 'keep-me',
          useOpenNMSBaseUrl: false,
          opennmsBaseUrl: 'http://localhost:8980/opennms'
        }
      })
    )
  })

  it('should save the url as entered', () => {
    const onOptionsChange = jest.fn()
    render(
      <OpenNMSBaseUrlConfig options={settingsWith({ useOpenNMSBaseUrl: true })} onOptionsChange={onOptionsChange} />
    )

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'http://localhost:8980/opennms' } })

    expect(onOptionsChange).toHaveBeenCalledWith(
      expect.objectContaining({
        jsonData: {
          path: 'keep-me',
          useOpenNMSBaseUrl: true,
          opennmsBaseUrl: 'http://localhost:8980/opennms'
        }
      })
    )
  })
  it('should ask for a url when the setting is switched on but the url is blank', () => {
    render(<OpenNMSBaseUrlConfig options={settingsWith({ useOpenNMSBaseUrl: true })} onOptionsChange={jest.fn()} />)

    expect(screen.getByText(/Enter the base URL of your OpenNMS instance/)).toBeInTheDocument()
  })

  it('should stop asking for a url once one is entered', () => {
    const options = settingsWith({ useOpenNMSBaseUrl: true, opennmsBaseUrl: 'http://localhost:8980/opennms' })
    render(<OpenNMSBaseUrlConfig options={options} onOptionsChange={jest.fn()} />)

    expect(screen.queryByText(/Enter the base URL of your OpenNMS instance/)).not.toBeInTheDocument()
  })

  it('should treat a blank url as valid while the setting is switched off', () => {
    render(<OpenNMSBaseUrlConfig options={settingsWith({})} onOptionsChange={jest.fn()} />)

    expect(screen.queryByText(/Enter the base URL of your OpenNMS instance/)).not.toBeInTheDocument()
  })

  it('should ask for a url when the entered value is only whitespace', () => {
    render(
      <OpenNMSBaseUrlConfig
        options={settingsWith({ useOpenNMSBaseUrl: true, opennmsBaseUrl: '   ' })}
        onOptionsChange={jest.fn()}
      />
    )

    expect(screen.getByText(/Enter the base URL of your OpenNMS instance/)).toBeInTheDocument()
  })

  it('should reject a url with no scheme, which the browser cannot resolve to OpenNMS', () => {
    for (const opennmsBaseUrl of ['localhost:8980/opennms', 'onms.example.com/opennms', 'ftp://onms.example.com']) {
      const { unmount } = render(
        <OpenNMSBaseUrlConfig
          options={settingsWith({ useOpenNMSBaseUrl: true, opennmsBaseUrl })}
          onOptionsChange={jest.fn()}
        />
      )

      expect(screen.getByText(/must start with http:\/\/ or https:\/\//)).toBeInTheDocument()
      unmount()
    }
  })

  it('should accept a full http or https url without complaint', () => {
    for (const opennmsBaseUrl of ['http://localhost:8980/opennms', 'https://onms.example.com/opennms']) {
      const { unmount } = render(
        <OpenNMSBaseUrlConfig
          options={settingsWith({ useOpenNMSBaseUrl: true, opennmsBaseUrl })}
          onOptionsChange={jest.fn()}
        />
      )

      expect(screen.queryByText(/Enter the base URL of your OpenNMS instance/)).not.toBeInTheDocument()
      expect(screen.queryByText(/must start with http:\/\/ or https:\/\//)).not.toBeInTheDocument()
      unmount()
    }
  })

  it('should not complain about a saved url while the setting is switched off', () => {
    render(
      <OpenNMSBaseUrlConfig
        options={settingsWith({ opennmsBaseUrl: 'localhost:8980/opennms' })}
        onOptionsChange={jest.fn()}
      />
    )

    expect(screen.queryByText(/must start with http:\/\/ or https:\/\//)).not.toBeInTheDocument()
  })

  it('should mark the placeholder as an example so it is not mistaken for a saved value', () => {
    render(<OpenNMSBaseUrlConfig options={settingsWith({ useOpenNMSBaseUrl: true })} onOptionsChange={jest.fn()} />)

    expect(screen.getByPlaceholderText(/^e\.g\. /)).toBeInTheDocument()
  })
})
