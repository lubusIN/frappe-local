# Benches and sites

## Manage a bench

Open **Benches**, select a bench, and use its **Overview** tab.

![Running development bench with Restart, Stop, Build, Task Logs, and workspace actions.](/images/bench-overview.png)

*Example running bench on macOS. Core Frappe is omitted from the Installed Apps count.*

| Action | Behavior |
| --- | --- |
| Start | Starts the bench environment so its sites can serve requests |
| Restart | Restarts the bench; its sites are temporarily unavailable |
| Stop | Stops services and retains the environment's data |
| Build | Rebuilds frontend assets in a running bench |
| Task Logs | Shows the progress and output of operations for this bench |
| Terminal | Opens a shell in the running environment |
| Folder | Opens the host bench directory; this bench action is hidden on Windows |
| VS Code / Dev Container | Opens source code or attaches to the running container, depending on platform |

Actions may be disabled while another operation is queued or running. Wait for **Activity** to show completion before retrying. Running a bench is required for builds and app management.

On Windows, **VS Code** uses the container workflow. On macOS, **VS Code** opens the host folder and **Dev Container** attaches to the container. Both container workflows require VS Code and its Dev Containers extension.

## Add a site

1. Open **Sites** and choose **Create**.
2. Select the parent bench.
3. Enter a unique site slug.
4. Review the settings and choose **Create site**.
5. Wait for creation to finish, then choose **Browser** in the site's **Overview** tab.

Site names must be unique across the app, including sites on other benches. The app turns `demo` into `demo.localhost`; enter the slug in the wizard, not the full URL.

![New site dialog with sandbox entered and the .localhost suffix supplied automatically.](/images/new-site.png)

*Example Site Name step after selecting a parent bench on macOS.*

## Maintain a site

Select the site and open **Overview**.

![Ready demo.localhost site with Clean Cache, Migrate, Task Logs, and Browser actions.](/images/site-overview.png)

*Example site on macOS, with its parent bench running.*

- **Clean Cache** clears the site's cache after configuration or application changes.
- **Migrate** runs the site's migrations after code or schema changes. It changes the database; preserve important data before running it.
- **Task Logs** shows operation output and failures.
- **Browser**, **Folder**, and **Terminal** open the relevant environment or location.
- **Reset Status** appears for a failed site. It clears the recorded failure state; it does not repair the underlying cause.

The parent bench must be running for cache, migration, and terminal operations. Use the **Apps** tab to manage applications installed on this site.

## Delete a site or bench

Use the resource's **Delete** action and read the confirmation before proceeding.

Deleting a site drops its database and removes its site directory. Deletion does not create a backup for you.

Deleting a bench removes its attached sites, containers, volumes, and bench directory. This includes database data. Save source changes and export any data you need before deletion. A copy of the desktop app's settings file is not a backup of the Frappe databases.

If deletion reports cleanup warnings, inspect the task logs: the entry can disappear even when some runtime resources or files remain.

For temporary shutdown, use **Stop**. See [Runtime and data](../technical/runtime-and-data) for the storage layout and platform differences.
