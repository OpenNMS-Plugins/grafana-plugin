import { getBackendSrv } from '@grafana/runtime';
import { useEffect, useState } from 'react';

export interface GrafanaDatasource {name: string, type: string, id: string}

export const useDatasources = () => {
    const [datasources, setDatasources] = useState<GrafanaDatasource[]>([]);

    const updateDatasources = async () => {
        const data = await getBackendSrv().get('/api/datasources');
        setDatasources(data);
    }

    useEffect(() => {
        updateDatasources();
    }, [])
    return { datasources }
}
