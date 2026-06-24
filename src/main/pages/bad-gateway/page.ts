import template from '@frappe-local/main/pages/bad-gateway/index.html?raw';
import tailwindCss from '@frappe-local/main/pages/bad-gateway/styles.css?inline';

const STYLES_PLACEHOLDER = '/* FRAPPE_LOCAL_TAILWIND_CSS */';

export const BAD_GATEWAY_ERROR_PAGE = template.replace(STYLES_PLACEHOLDER, tailwindCss);
