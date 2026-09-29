# First steps

Create your first bench and open a working site. If you have not installed Frappe Local, start with [Installation](./installation).

## Understand benches, sites, and apps

A **bench** is a Frappe environment with one Frappe version and a collection of app source code. A **site** belongs to a bench and has its own database and installed apps. Multiple sites can share a bench.

Adding an app to a bench makes its code available. Installing it on a site enables it for that site's database. See [Managing apps](./apps) for both steps.

## Find your way around

| Screen | Use it for |
| --- | --- |
| Sites | Open and maintain a site's database and installed apps |
| Benches | Start/stop environments and manage shared app source |
| My Apps | Register your own GitHub or local apps |
| Activity | Follow operations and open their logs |
| Diagnostics | Check setup and runtime health |

## Create your first bench

![New bench dialog with name, Frappe version, and storage path fields.](/images/new-bench.png)

*The Environment step with example values. Screenshots show the app’s macOS layout in light mode with example data; paths and platform-specific actions may differ on your computer.*

1. Open **Benches** and choose **Create**.
2. Enter a unique bench name, choose a Frappe version, and choose its storage path. Bench names use lowercase letters, numbers, dots, and hyphens, starting with a letter or number.
3. Enter an initial site name, such as `demo`. Use letters, numbers, and hyphens without a leading or trailing hyphen. Frappe Local adds `.localhost` automatically.
4. Review the settings and choose **Create bench**.
5. Follow progress in **Activity** or **Task Logs**. Wait for both the bench and initial site creation tasks to finish.

First use initializes the container environment and may download a Linux machine image and container images. This can take several minutes. On Windows, follow the setup prompts if WSL2 or Virtual Machine Platform needs enabling. Keep the app open during setup.

If creation fails, inspect the failed task and follow [Troubleshooting](./troubleshooting) before retrying.

## Open and sign in to your site

1. Confirm the parent bench is running in **Benches**.
2. Open **Sites** and select the site.
3. In **Overview**, choose **Browser**.
4. Sign in with username `Administrator` and the initial password `admin`.

These are the current local-development credentials. If you change the password inside Frappe, use your updated password on subsequent logins.

Use the app's **Browser** action to obtain the correct address. The app normally selects local HTTPS. If the browser shows a certificate warning, check [certificate trust](./troubleshooting#local-https-and-browser-access). When the proxy is unavailable, the app uses a direct HTTP address.

## Install another app

Open the bench's **Apps** tab and choose **Get** for a compatible app. Wait for completion, then open the site's **Apps** tab and choose **Install**. A bench must be running for app operations. See [Managing apps](./apps) for custom apps and removal.

## Finish a session

Use **Stop** on a bench to stop its services while retaining its files and database volumes. All sites in that bench become unavailable until you start it again. Stop is the normal way to pause an environment; **Delete** removes data.

Closing the window leaves the app in the tray. Quitting with a running environment offers **Stop Benches & Quit**, **Keep Running & Quit**, or **Cancel**.

Next, learn [bench and site management](./benches-and-sites), adjust [settings](./settings), or [open your workspace in VS Code](./daily-work#open-your-workspace-in-vs-code).
