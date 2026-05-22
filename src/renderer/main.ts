import { createApp } from 'vue';
import 'frappe-ui/style.css';

const renderFatalScreen = (title: string, detail: unknown): void => {
	const target = document.getElementById('app');
	if (!target) {
		return;
	}

	const detailText = detail instanceof Error ? `${detail.message}\n\n${detail.stack ?? ''}` : String(detail);

	target.innerHTML = `
		<section class="max-w-[860px] mx-auto my-10 p-5 rounded-lg border border-outline-red-2 bg-surface-red-2 text-ink-red-4 font-sans">
			<h1 class="m-0 mb-2.5 text-lg font-semibold">${title}</h1>
			<p class="m-0 mb-3.5 text-[13px] leading-relaxed">The renderer crashed before it could render the app shell.</p>
			<pre class="select-text m-0 p-3 rounded-lg bg-surface-white border border-outline-red-2 whitespace-pre-wrap break-words text-xs leading-snug">${detailText}</pre>
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