# OpenNMS Plugin for Grafana [![CircleCI](https://circleci.com/gh/OpenNMS/grafana-plugin.svg?style=svg)](https://circleci.com/gh/OpenNMS/grafana-plugin)

OpenNMS Plugin for Grafana (formerly known as Helm) is a Grafana application that allows users to create flexible monitoring dashboards using data from [OpenNMS® Horizon™](https://www.opennms.com/horizon/) and/or [OpenNMS® Meridian™](https://www.opennms.com/meridian/).

Supported data:
* Performance and response time (time series metrics)
* Fault (alarms and outages)
* Inventory (nodes, IP & SNMP interfaces, services)
* NetFlow (NetFlow v5 & v9, IPFIX, sFlow)

For help on installing, configuring, and using the application, read the [documentation](https://docs.opennms.com/grafana-plugin/latest/index.html).

## Features

### Flexible data filtering

Isolate the data you want to display using custom filters and conditions. The filter panel goes a step further—enabling global data filtering for your dashboard.

### Configurable displays

Present fields that are most relevant to you and your teams to improve tracking and triage.

### Alarm interactions

Acknowledge, escalate, create, and clear tickets for alarms directly from the dashboard.

### Storage engine agnostic

Retrieve time series metrics stored in persistence engines, including [OpenNMS Time Series DB](https://www.opennms.com/time-series-db/), [Newts](https://github.com/OpenNMS/newts), [Cortex](https://cortexmetrics.io/), [RRDtool](https://oss.oetiker.ch/rrdtool/), or [JRobin](https://github.com/OpenNMS/jrobin).

### Flows deep-dive dashboard

This custom dashboard, included in the app, provides a powerful, flexible interface for exploring NetFlow data alongside performance metrics.

### Template support

Populate template variables with query results from any of the included OpenNMS data source plugins.

### Trending and forecasting of time series data

Remove outliers and perform trending or forecasting using the built-in series filters or develop your own filters using Java or [R](https://www.r-project.org/). Derive new series using [JEXL](https://commons.apache.org/proper/commons-jexl/reference/syntax.html) expressions.

## Support Matrix

* Performance data source
  * OpenNMS Horizon 16 or greater
  * OpenNMS Meridian 2016 or greater
* Entities data source
  * Alarms
    * OpenNMS Horizon 20 or greater
    * OpenNMS Meridian 2018 or greater
  * IP and SNMP interfaces, outages, and services
    * OpenNMS Horizon 26 or greater
    * OpenNMS Meridian 2020 or greater
* Flows data source
  * OpenNMS Horizon 24 or greater
  * OpenNMS Meridian 2019 or greater

This plugin requires Grafana 9 or greater.

## Issue Tracking

We use the OpenNMS Plugin for Grafana project in our [JIRA](https://opennms.atlassian.net/projects/OPG) instance to track bugs and enhancements related this to project.

## Changelog

The changelog has moved to [CHANGELOG.md](https://github.com/OpenNMS/grafana-plugin/blob/main-9/CHANGELOG.md).
