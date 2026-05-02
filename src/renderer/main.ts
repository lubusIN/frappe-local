import { createApp } from 'vue';
import 'frappe-ui/style.css';
import './styles.css';

const renderFatalScreen = (title: string, detail: unknown): void => {
	const target = document.getElementById('app');
	if (!target) {
		return;
	}

	const detailText = detail instanceof Error ? `${detail.message}\n\n${detail.stack ?? ''}` : String(detail);

	target.innerHTML = `
		<section style="max-width: 860px; margin: 40px auto; padding: 20px; border-radius: 10px; border: 1px solid #fecaca; background: #fef2f2; color: #7f1d1d; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif;">
			<h1 style="margin: 0 0 10px; font-size: 18px;">${title}</h1>
			<p style="margin: 0 0 14px; font-size: 13px; line-height: 1.5;">The renderer crashed before it could render the app shell.</p>
			<pre style="margin: 0; padding: 12px; border-radius: 8px; background: #fff; border: 1px solid #fecaca; white-space: pre-wrap; word-break: break-word; font-size: 12px; line-height: 1.4;">${detailText}</pre>
		</section>
	`;
};

const bootstrapRenderer = async (): Promise<void> => {
	try {
		const [{ default: App }, { default: router }] = await Promise.all([
			import('./App.vue'),
			import('./router'),
		]);

		const app = createApp(App);

		app.config.errorHandler = (error) => {
			console.error('[renderer] vue error', error);
			renderFatalScreen('Renderer Runtime Error', error);
		};

		window.addEventListener('error', (event) => {
			console.error('[renderer] window error', event.error ?? event.message);
			renderFatalScreen('Renderer Window Error', event.error ?? event.message);
		});

		window.addEventListener('unhandledrejection', (event) => {
			console.error('[renderer] unhandled rejection', event.reason);
			renderFatalScreen('Renderer Promise Rejection', event.reason);
		});

		app.use(router).mount('#app');
	} catch (error) {
		console.error('[renderer] bootstrap failed', error);
		renderFatalScreen('Renderer Startup Failure', error);
	}
};

void bootstrapRenderer();