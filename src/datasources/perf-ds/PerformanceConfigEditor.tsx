import React from 'react';
import { DataSourcePluginOptionsEditorProps } from '@grafana/data';
import { DataSourceHttpSettings } from '@grafana/ui';
import { InputValueOverrideConfig } from './InputValueOverrideConfig'
import { NodeAttributeLimitOverrideConfig } from './NodeAttributeLimitOverrideConfig'
import { PerformanceDataSourceOptions } from './types';

interface Props extends DataSourcePluginOptionsEditorProps<PerformanceDataSourceOptions> { }

export const PerformanceConfigEditor: React.FC<Props> = ({ onOptionsChange, options }) => {
    return (
        <>
          <style>
            {
              `
              .spacer {
                margin-top: 10px;
                margin-bottom: 10px;
              }
              `
          }
          </style>

         <DataSourceHttpSettings
              defaultUrl="https://api.example.com"
              dataSourceConfig={options}
              onChange={onOptionsChange}
          />

          <h3 className='spacer'>Additional Options</h3>

          <InputValueOverrideConfig
            onOptionsChange={onOptionsChange}
            options={options}
          />

          <div className='spacer' />

          <NodeAttributeLimitOverrideConfig
            onOptionsChange={onOptionsChange}
            options={options}
          />
        </>
    )
}
