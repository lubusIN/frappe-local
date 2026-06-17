import template from './index.html?raw';
import tailwindCss from './styles.css?inline';

const STYLES_PLACEHOLDER = '/* FRAPPE_LOCAL_TAILWIND_CSS */';

export const BAD_GATEWAY_ERROR_PAGE = template.replace(STYLES_PLACEHOLDER, tailwindCss);
