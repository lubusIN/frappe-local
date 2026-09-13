# Activity and task logs

Operations such as creating a bench, installing an app, or migrating a site can take several minutes. Use **Activity** to follow them without starting the same action again.

## Find a task

1. Open **Activity** from the navigation.
2. Use the status filter to narrow results, or select **All statuses**.
3. Use the resource filter to select Bench, Site, Runtime, or System work.
4. Select an activity row to open its task logs.

You can also select a bench or site and choose **Overview → Task Logs**. If Activity appears empty, clear both filters before assuming no work has run.

## Understand progress

| State | What to do |
| --- | --- |
| Queued / In Progress | Wait for earlier work to finish |
| Running | Follow the current step; downloads and builds can take time |
| Cancelling | Wait for cancellation to finish |
| Success | Return to the resource and confirm the expected result |
| Failure | Read the failed step before retrying |
| Cancelled | Check the resource's state before starting again |

A ready site still needs its parent bench running before it can serve requests. Task success and browser availability answer different questions.

## Read and copy logs

Use **Search logs…** to find an error, repository name, or step message. **Expand all** and **Collapse all** control the step groups. Start with the first failed step rather than only the last line.

Choose **Copy** to put the task log on your clipboard. Search narrows what is displayed, but Copy can include the full task log; review the copied text before sharing it. Remove credentials, private repository details, and sensitive paths.

## Cancel an operation

When **Cancel Task** is available, select it and confirm. Some operations delay cancellation or do not offer it immediately. Cancellation may leave partially completed work; it is not an undo action. Check logs and the bench/site state before retrying.

Avoid quitting or resetting the environment as a way to cancel one task.

## Clear history

**Activity → Clear** asks to clear all activity history, including items outside the current filters. It does not delete benches/sites or stop running tasks. Keep any logs needed for a problem report before clearing history, preferably after pending operations finish.

After a restart or reload, old unfinished activities may be marked interrupted. Check the resource and Diagnostics before assuming that the underlying services have stopped. See [Troubleshooting](./troubleshooting) if the next action is unclear.
