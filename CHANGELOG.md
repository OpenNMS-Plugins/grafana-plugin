### v12.0.1

Grafana Plugin for OpenNMS version 12.0.1 release contains an enhancement.

* [OPG-518](https://opennms.atlassian.net/browse/OPG-518) Remove 'spacer' class, replace with Grafana theme

### v12.0.0

Grafana Plugin for OpenNMS version 12 provides compatibility with Grafana 12.

Highlights include:
* Grafana 12 compatibility
* Various bug fixes, including for the Alarm Table Panel
* Dashboard Converter has been updated to migrate dashboards from previous version to OPG 12.
* Dependency updates and security improvements

### v9.0.16

Grafana Plugin for OpenNMS version 9.0.16 release contains a number of bug fixes.

* [OPG-496](https://opennms.atlassian.net/browse/OPG-496) Variable interpolation regression
* [OPG-497](https://opennms.atlassian.net/browse/OPG-497) Attribute node search / auto-fill limited to 1000 results
* [OPG-503](https://opennms.atlassian.net/browse/OPG-503) Fix various issues due to TypeError issue in Json serialization
* [OPG-509](https://opennms.atlassian.net/browse/OPG-509) Update OPG v9 to use opennms-js v2.6.1

### v9.0.15

Grafana Plugin for OpenNMS version 9.0.15 release contains a number of bug fixes.

* [OPG-465](https://opennms.atlassian.net/browse/OPG-465) Entity Node query does not display Parent or OS fields
* [OPG-483](https://opennms.atlassian.net/browse/OPG-483) Values are not retained if using variables in dropdown in Performance queries
* [OPG-488](https://opennms.atlassian.net/browse/OPG-488) Incorrect variable interpolation for Performance queries when multiple variables have similar names
* [OPG-493](https://opennms.atlassian.net/browse/OPG-493) Fix Perf DS mapping of subAttribute/datasource

### v9.0.14

Grafana Plugin for OpenNMS version 9.0.14 release contains a number of bug fixes and enhancements.

* [OPG-384](https://opennms.atlassian.net/browse/OPG-384) Add variables to node/resource drop down
* [OPG-471](https://opennms.atlassian.net/browse/OPG-471) Ensure that template variables are allowed in query editor fields
* [OPG-475](https://opennms.atlassian.net/browse/OPG-475) nodeResources query not working properly
* [OPG-477](https://opennms.atlassian.net/browse/OPG-477) Allow manual override UI and Docs updates after Grafana review
* [OPG-478](https://opennms.atlassian.net/browse/OPG-478) Alarm Table Panel Pagination not working correctly

### v9.0.13

Grafana Plugin for OpenNMS version 9.0.13 release contains a bug fix.

* [OPG-475](https://opennms.atlassian.net/browse/OPG-475) nodeResources query not working properly

### v9.0.12

Grafana Plugin for OpenNMS version 9.0.12 release is a re-release of 9.0.11 with minor fixes.

* [OPG-466](https://opennms.atlassian.net/browse/OPG-466) Unable to filter Alarm query by a multi-value node variable
* [OPG-474](https://opennms.atlassian.net/browse/OPG-474) Display notice after Alarm Panel action instead of refreshing panel

### v9.0.11

Grafana Plugin for OpenNMS version 9.0.11 release contains a bug fix and enhancements.

* [OPG-468](https://opennms.atlassian.net/browse/OPG-468) Add \`nodeId\(\)\` query to datasources
* [OPG-469](https://opennms.atlassian.net/browse/OPG-469) Alarm Panel Columns Resizing
* [OPG-470](https://opennms.atlassian.net/browse/OPG-470) Alarm Panel User Feedback
* [OPG-472](https://opennms.atlassian.net/browse/OPG-472) Documentation for OPG nodeFilter labelFormat and valueFormat

### v9.0.10

Grafana Plugin for OpenNMS version 9.0.10 release contains a bug fix and an enhancement.

* [OPG-464](https://opennms.atlassian.net/browse/OPG-464) Node ID field missing from some Entity DS results
* [OPG-410](https://opennms.atlassian.net/browse/OPG-410) Add up/down status to Monitored Services entity

### v9.0.9

Grafana Plugin for OpenNMS version 9.0.9 release contains a number of bug fixes and enhancements.

* [OPG-448](https://opennms.atlassian.net/browse/OPG-448) Converter outputs extra characters in resource name
* [OPG-454](https://opennms.atlassian.net/browse/OPG-454) Flow query with multi-value withHost does not return data
* [OPG-460](https://opennms.atlassian.net/browse/OPG-460) Entities DS - Nodes Table - Category Values showing under Primary SNMP ifIndex
* [OPG-461](https://opennms.atlassian.net/browse/OPG-461) Entity datasource no longer includes node ID / node label in IP interface query results
* [OPG-463](https://opennms.atlassian.net/browse/OPG-463) Entitles DS Tables Limit does not allow a value of zero

### v9.0.8

Grafana Plugin for OpenNMS version 9.0.8 is a re-release of version 9.0.7 which contains a number of bug fixes and enhancements.

* [OPG-369](https://opennms.atlassian.net/browse/OPG-369) React Flow Panel and Datasource improvements
* [OPG-427](https://opennms.atlassian.net/browse/OPG-427) Node metadata not always returned
* [OPG-438](https://opennms.atlassian.net/browse/OPG-438) v9 Dashboard Converter tool is resetting query datasources to default names

### v9.0.7

Grafana Plugin for OpenNMS version 9.0.7 release contains a number of bug fixes and enhancements.

* [OPG-369](https://opennms.atlassian.net/browse/OPG-369) React Flow Panel and Datasource improvements
* [OPG-427](https://opennms.atlassian.net/browse/OPG-427) Node metadata not always returned
* [OPG-438](https://opennms.atlassian.net/browse/OPG-438) v9 Dashboard Converter tool is resetting query datasources to default names

### v9.0.6

Grafana Plugin for OpenNMS version 9.0.6 release contains a number of bug fixes and enhancements.

* [HELM-446](https://opennms.atlassian.net/browse/HELM-446) Stat Panel "Last \*" Calculation doesn't ignore NaN values
* [HELM-445](https://opennms.atlassian.net/browse/HELM-445) upgrade helm to latest grafana 9.x APIs
* [HELM-443](https://opennms.atlassian.net/browse/HELM-443) Site documentation not building
* [HELM-442](https://opennms.atlassian.net/browse/HELM-442) Regression: Unable to manually type in node value in Perf DS
* [HELM-440](https://opennms.atlassian.net/browse/HELM-440) Dashboard converter does not update Entity Alarm queries properly
* [HELM-439](https://opennms.atlassian.net/browse/HELM-439) Filter panel field order does not adapt to panel shape
* [HELM-435](https://opennms.atlassian.net/browse/HELM-435) Entity DS Alarm query doesn't handle multi value variables properly
* [HELM-430](https://opennms.atlassian.net/browse/HELM-430) Perf DS Query doesn't support $\{variable\} syntax
* [HELM-418](https://opennms.atlassian.net/browse/HELM-418) Document that variables must now be defined prior to use in expressions
* [HELM-416](https://opennms.atlassian.net/browse/HELM-416) Docs about Predefined Dashboards are misleading
* [HELM-415](https://opennms.atlassian.net/browse/HELM-415) Docs direct user to create a Custom Action when creating a Dashboard but this feature no longer exists in Grafana v9

### v9.0.5

Grafana Plugin for OpenNMS version 9.0.5 is a small release with a number of small fixes and enhancements.

* [HELM-432](https://opennms.atlassian.net/browse/HELM-432) Create a Converter Dashboard
* [HELM-425](https://opennms.atlassian.net/browse/HELM-425) Fix logic for transient flag
* [HELM-424](https://opennms.atlassian.net/browse/HELM-424) Unable to set node in Perf DS Query
* [HELM-422](https://opennms.atlassian.net/browse/HELM-422) Default flow dashboards need updating for v9 plugin
* [HELM-417](https://opennms.atlassian.net/browse/HELM-417) Resource field hard-coding node ID
* [HELM-414](https://opennms.atlassian.net/browse/HELM-414) Converted dashboards that use expressions fail because attribute labels are misplaced after conversion
* [HELM-400](https://opennms.atlassian.net/browse/HELM-400) Alarm Table details does not show Alarm ID
* [HELM-396](https://opennms.atlassian.net/browse/HELM-396) Alarm Table - allow right-click anywhere in panel
* [HELM-389](https://opennms.atlassian.net/browse/HELM-389) Filter Panel: Tie to Dashboard

### v9.0.4

Grafana Plugin for OpenNMS version 9.0.4 is a small release with one bugfix.

* [HELM-421](https://opennms.atlassian.net/browse/HELM-421): PerfDS: Explorer for string property gives error "N.replace is not a function"

### v9.0.3

Grafana Plugin for OpenNMS version 9.0.3 is a small release with one final breaking ID change based on Grafana's registry guidelines.

It contains a number of dependency security updates, as well as a few small bugfixes:

* [HELM-398](https://opennms.atlassian.net/browse/HELM-398): Alarm Table / Entity Datasource: Enable "Use Grafana User"
* [HELM-406](https://opennms.atlassian.net/browse/HELM-406): Adding a perf filter query to a dashboard elicits "TypeError: l is undefined"
* [HELM-411](https://opennms.atlassian.net/browse/HELM-411): Alarm datasource query not keeping proper equality

### v9.0.2

Grafana Plugin for OpenNMS version 9.0.2 is a bugfix release.

### v9.0.1

Grafana Plugin for OpenNMS version 9.0.1 is a re-release of 9.0.0, with a change to the plugin ID used for publication to Grafana's registry and updated logo.

### v9.0.0

Grafana Plugin for OpenNMS version 9 is a large refactor of the codebase from Helm 8.

Highlights include:
* rewrite all panels in React
* clean up a bunch of code under the covers to use newer Grafana datastructures
* lots of documentation updates and improvements
* and much, much more!

A **Dashboard Convert Panel** has been provided to migrate your dashboards from Helm 8.
Instructions on backing up your existing dashboards and upgrading can be found in [the Grafana plugin documentation](https://docs.opennms.com/grafana-plugin/latest/installation/upgrading.html).
