import React from 'react';
import { css } from '@emotion/css'
import { DataSourcePluginOptionsEditorProps, GrafanaTheme2 } from '@grafana/data';
import { DataSourceHttpSettings, useStyles2 } from '@grafana/ui';
import { InputValueOverrideConfig } from './InputValueOverrideConfig'
import { NodeAttributeLimitOverrideConfig } from './NodeAttributeLimitOverrideConfig'
import { PerformanceDataSourceOptions } from './types';

interface Props extends DataSourcePluginOptionsEditorProps<PerformanceDataSourceOptions> { }

const getStyles = (theme: GrafanaTheme2) => ({
    spacer: css`
        margin-top: ${theme.spacing(1.25)};
        margin-bottom: ${theme.spacing(1.25)};
    `,
})

export const PerformanceConfigEditor: React.FC<Props> = ({ onOptionsChange, options }) => {
    const s = useStyles2(getStyles)

    return (
        <>
         <DataSourceHttpSettings
              defaultUrl="https://api.example.com"
              dataSourceConfig={options}
              onChange={onOptionsChange}
          />

          <h3 className={s.spacer}>Additional Options</h3>

          <InputValueOverrideConfig
            onOptionsChange={onOptionsChange}
            options={options}
          />

          <div className={s.spacer} />

          <NodeAttributeLimitOverrideConfig
            onOptionsChange={onOptionsChange}
            options={options}
          />
        </>
    )
}
