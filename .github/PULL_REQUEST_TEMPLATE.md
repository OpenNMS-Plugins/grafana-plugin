# Pull Request Check Sheet

* [ ] Have you read and followed our [Contribution Guidelines](https://github.com/OpenNMS/opennms/blob/develop/CONTRIBUTING.md)?
* [ ] Have you [made an issue in the OpenNMS issue tracker](https://opennms.atlassian.net/projects/OPG)?<br>If so, you should:
  1. update the title of this PR to be of the format: `${JIRA-ISSUE-NUMBER}: subject of pull request`
  2. update the JIRA link at the bottom of this comment to refer to the real issue number
  3. prefix your commit messages with the issue number, if possible
* [ ] Have you made a comment in that issue which points back to this PR?
* [ ] Have you updated the JIRA link at the bottom of this comment to link to your issue?
* [ ] If this is a new feature, is there documentation?
* [ ] If this is a new feature or substantial change, are there tests that cover it?

# Pull Request Process

One or more reviewers should be assigned to each PR.

If you know that a particular person is subject matter expert in the area your PR affects, feel free to assign one or more reviewers when you create this PR, otherwise reviewers will be assigned for you.

Once the reviewer(s) accept the PR and the branch passes continuous integration in Bamboo, the PR is eligible for merge.

At that time, if you have commit access (are an OpenNMS Group employee or a member of the Order of the Green Polo) you are welcome to merge the PR.
Otherwise, a reviewer can merge it for you.

Thanks for taking time to contribute!

# External References

* Jira (Issue Tracker): https://opennms.atlassian.net/browse/${JIRA-ISSUE-NUMBER}
* Continuous Integration: [GitHub Actions](https://github.com/OpenNMS-Plugins/grafana-plugin/actions)
