# Managing apps

## Add an app to a bench

1. Start the target bench.
2. Select it in **Benches** and open **Apps**.
3. Browse or search the app catalog and review compatibility with the bench's Frappe version.
4. Choose **Get** for the app and follow its task output until the download and build complete.

![Bench Apps tab showing an example ERPNext catalog entry with the Get action.](/images/bench-apps.png)

*Example catalog entry on macOS. Get adds app source to this bench; catalog contents and compatibility vary.*

The catalog comes from Frappe Brewery. Compatibility information helps select an app, but installation still depends on its repository, branch, dependencies, and support for your Frappe version.

## Install an app on a site

1. Select the target in **Sites** and open **Apps**.
2. Choose **Install** for the desired app on that site.
3. Wait for the task to complete before opening or refreshing the site.

![Site Apps tab showing an example ERPNext entry with the Install action.](/images/site-apps.png)

*Example second stage: ERPNext source is already on the parent bench and is ready to install on this site.*

App source code and site installation are separate. An app added to a bench is not automatically enabled on every site in it. If installation fails, inspect the site task logs for the first dependency or migration error.

## Custom apps

Open **My Apps**. On the empty screen, choose **Add Custom App**; if apps are already listed, choose **Add**.

![Add Custom App dialog with GitHub and Local source options and SSH key sharing.](/images/custom-app.png)

*The GitHub source form. Choose Local to register an app folder instead.*

- **GitHub**: enter the repository URL. The app extracts metadata to create a reusable catalog entry.
- **Local**: select an existing Frappe app folder on your computer. This registers existing source code; it does not scaffold a new Frappe application.

![Add Custom App dialog with Local selected and an example folder path.](/images/local-app.png)

*The Local source form with an example path. Browse to your existing Frappe app folder.*

Choose **Add App** and wait for the entry to appear in **My Apps**. Then use the bench and site app workflows above. Local apps are mounted into the container, so changes to their source can affect the running environment. Keep the original folder available and save work in version control.

For private repositories, enable **Share SSH Keys with Benches** in **Settings → Advanced** and ensure your host SSH keys can access the repository. This mounts your local `~/.ssh` directory into benches read-only. Changing the setting may require restarting running benches; the UI asks for confirmation.

## Remove apps

Uninstall an app from each site that uses it before removing its code from the bench. The app checks usage and blocks bench removal while an app is still in use. Core Frappe cannot be removed through the normal app-removal flow.

Uninstalling a site app can remove its data. Preserve required data first and review the confirmation. Removing a **My Apps** entry manages its catalog registration; use the bench and site controls to manage installed copies.

## Catalog connection problems

Check **Settings → Advanced → App Registry URL**. You can restore the default with **Use Default**. If downloads or metadata checks fail, confirm the registry and Git repository are reachable and inspect **Task Logs**. See [Troubleshooting](./troubleshooting).

## Confirm the app is ready

Check both places: the bench's installed-app list confirms that its code is available, while the site's installed-app list confirms it is enabled for that site. Open the site in **Browser** after the site installation task succeeds. If it is missing from the site, adding it to the bench alone was not enough.
