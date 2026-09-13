# Troubleshooting

## Start with task output and diagnostics

1. Open **Activity**, or select the affected bench/site and choose **Task Logs**.
2. Find the failed step and read its underlying command output.
3. Open **Diagnostics** and run the checks.
4. Use **Fix** for the relevant failing check when offered, then rerun the checks.
5. Retry the original action after the cause is resolved.

See [Activity and task logs](./activity) for filters, searching, copying output, and cancellation.

Tasks run through a queue. A queued operation may simply be waiting for another task. Cancellation is available only when the task exposes it; some operations delay cancellation while a critical step runs.

## First setup or bench creation fails

Check internet access to the machine-image registry, container registries, Git repositories, and package registries. A VPN, proxy, firewall, or antivirus tool may block a download. The logs should identify the failing host or command.

On macOS, verify hardware virtualization is available and review any blocked binary or permission prompt. On Windows, follow the in-app WSL2 and Virtual Machine Platform setup instructions, including a restart if requested. Rerun **Diagnostics** afterward.

A failed build may also indicate insufficient memory. See [system requirements](./installation#hardware) and [memory settings](./settings#advanced).

## Local HTTPS and browser access

Frappe Local uses Caddy for `.localhost` addresses. The operating system may ask to trust a local certificate authority. If trust fails, HTTPS currently stays enabled and the browser may show a certificate warning. Review diagnostics and repair local certificate trust; do not assume the warning means the bench itself failed.

Use the site's **Browser** action instead of a bookmarked URL so the current scheme and address are selected. Confirm that the parent bench is running and that creation or migration has finished. If the browser reports a gateway error, check the bench task logs and runtime diagnostics.

If the proxy cannot start, check the reported error and application output for port conflicts or certificate setup errors; Diagnostics does not test every proxy or certificate condition. Avoid changing generated proxy files as a repair; they are managed by the app.

## Apps fail to install or build

Confirm the bench is running, the selected app supports its Frappe version, and its repository is reachable. For private apps, check SSH access and sharing settings. For local apps, confirm the source folder still exists.

Read the first failing dependency, build, or migration step. **Build** rebuilds bench assets; **Migrate** applies changes to a site's database; **Clean Cache** clears cached state. Choose the action that addresses the failure rather than running all of them repeatedly.

## VS Code or terminal actions are unavailable

Install VS Code and its Dev Containers extension for container editing, then restart or refresh the app's environment detection. Start the bench before opening a container or terminal. Review the configured terminal in **Settings → Preferences** if launching it fails.

Windows bench source lives in a container volume, so use the container-based VS Code action rather than expecting the full workspace in the host folder.

## Reset is destructive

**Diagnostics → Reset Environment** and the developer reset script remove local environment state and resources. They are not ordinary cache-clearing actions. Preserve source changes and database backups before choosing reset. See [Runtime and data](../technical/runtime-and-data).

## Report a problem

Include the app version, OS and architecture, Frappe version, action performed, expected result, and failed task output. Include the diagnostics results and whether the issue occurs with a new bench. Remove passwords, private repository details, and other sensitive values from logs before sharing them in a [GitHub issue](https://github.com/lubusIN/frappe-local/issues).

## A button is disabled

Wait for queued/running work to finish and confirm the parent bench is running. Site creation requires an eligible bench; app management, builds, migrations, and terminals have additional readiness requirements. If the action is still unavailable, inspect the most recent failed task rather than using Reset Environment to unlock it.
