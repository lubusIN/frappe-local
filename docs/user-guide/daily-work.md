# Everyday workflows

## Resume work

1. Open Frappe Local and let startup finish.
2. Open **Benches** and select the environment you need.
3. Choose **Start** if it is stopped and wait for the task to finish.
4. Open **Sites**, select your site, and choose **Overview → Browser**.

If a site does not open, check its parent bench and [task logs](./activity). A site's Ready state alone does not mean its bench is running.

## Choose the right maintenance action

| Situation | Action |
| --- | --- |
| Frontend assets need rebuilding after source changes | Bench **Build** |
| App code introduces database/schema changes | Site **Migrate**, after preserving important data |
| Cached configuration or content appears stale | Site **Clean Cache** |
| You need to restart the environment's processes | Bench **Restart** |
| You want to pause work and keep data | Bench **Stop** |

Build does not install an app on a site, Clean Cache does not run database migrations, and Reset Status does not repair a failed operation. Read the failed step before choosing a recovery action.

## Open your workspace in VS Code

Install VS Code and its **Dev Containers** extension first.

1. Start the bench.
2. Open the bench's **Overview** tab.
3. On macOS, choose **Dev Container** to use the managed toolchain. The separate **VS Code** action opens the host folder.
4. On Windows, choose **VS Code** to open the container workspace.
5. Wait for the editor to attach, then edit your app source.

Use **Terminal** in the bench Overview when you need a shell in the environment. Select your preferred terminal in **Settings → General** if needed.

Closing VS Code does not stop the bench. On Windows, the workspace is inside the managed environment, so the host bench folder is not a complete copy of the app's source and site data. For an existing local app, register its folder through [My Apps](./apps#custom-apps).

## Use multiple environments

Use another site in the same bench when you want a separate database with the same Frappe version and shared app code. Use another bench when you need a different Frappe version or separate app source environment.

Give every site a unique name across all benches. Multiple running benches share the available runtime memory, so stop environments you are not using if resources are tight.

## End the day

Use **Stop** on the benches you want to pause. Closing the main window leaves the app in the tray. When quitting with a running environment, choose **Stop Benches & Quit** to shut it down, **Keep Running & Quit** to leave it running, or **Cancel** to return.

Do not delete a site or bench just to stop it. Save source changes and preserve important site data before deletion, app uninstall, migration, or **Reset Environment**.

## Common questions

**Does changing the default Frappe version upgrade an existing bench?** No. It changes the default for new benches. Create a separate bench for another version; the app does not provide an automatic cross-version migration workflow.

**Does changing Storage Path move existing benches?** No. Existing resources keep their recorded paths. Do not move their folders manually and expect the app to discover the move.

**Can I back up a site by copying app settings?** No. A site needs its database and files as well as app source. The app does not currently offer a complete guided backup/restore workflow. If the data matters, arrange a Frappe backup before destructive changes.

**Can I work offline?** Existing environments may run with already-downloaded resources, but first setup, app installation, catalog refresh, and updates need network access. Individual apps may also depend on online services.
