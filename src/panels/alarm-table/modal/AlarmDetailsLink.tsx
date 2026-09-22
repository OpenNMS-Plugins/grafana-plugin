import React from 'react'
import { css } from '@emotion/css'
import { GrafanaTheme2 } from '@grafana/data'
import { TextLink, useStyles2 } from '@grafana/ui'
import { ClientDelegate } from 'lib/client_delegate'
import { OnmsAlarm } from 'opennms/src/model'

interface AlarmDetailsLinkProps {
    alarm: OnmsAlarm | undefined;
    client: ClientDelegate | undefined;
}

const getStyles = (theme: GrafanaTheme2) => ({
    wrapper: css`
        margin-bottom: ${theme.spacing(1.5)};
    `,
    relativeUrl: css`
        color: ${theme.colors.text.secondary};
    `,
    note: css`
        color: ${theme.colors.text.secondary};
        font-size: ${theme.typography.bodySmall.fontSize};
    `
})

/**
 * Link from the alarm detail dialog to the alarm's page in OpenNMS.
 *
 * The link can only be completed when the user has configured an OpenNMS Base URL on the Entity
 * datasource; see ClientDelegate.getOpenNMSLink. Without it we show the OpenNMS-relative url as
 * plain text rather than as an anchor, because a relative href would resolve against Grafana's own
 * origin and lead nowhere.
 */
export const AlarmDetailsLink: React.FC<AlarmDetailsLinkProps> = ({ alarm, client }) => {
    const s = useStyles2(getStyles)
    const link = client?.getOpenNMSLink(alarm?.detailsPage)

    if (!link) {
        return null
    }

    if (link.isAbsolute) {
        return (
            <div className={s.wrapper}>
                <TextLink href={link.href} external={true}>Full Details</TextLink>
            </div>
        )
    }

    return (
        <div className={s.wrapper}>
            <div>Full Details: <span className={s.relativeUrl}>{link.href}</span></div>
            <div className={s.note}>
                Link is relative to an OpenNMS instance. To get a complete link, go to the Entity
                Datasource configuration, enable the OpenNMS Base URL setting and enter a URL.
            </div>
        </div>
    )
}
