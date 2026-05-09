const LOCAL_SUFFIX = '.local';
const LOCALHOST_SUFFIX = '.localhost';

const stripHostDecorators = (value: string): string => {
  const withoutProtocol = value.replace(/^https?:\/\//i, '');
  const hostWithMaybePort = withoutProtocol.split(/[/?#]/)[0] ?? '';
  const withoutPort = hostWithMaybePort.replace(/:\d+$/, '');
  return withoutPort.trim().toLowerCase().replace(/\.$/, '');
};

const collapseDuplicateSuffixes = (value: string): string => {
  let host = value;

  while (host.endsWith(`${LOCAL_SUFFIX}${LOCAL_SUFFIX}`)) {
    host = host.slice(0, -LOCAL_SUFFIX.length);
  }

  while (host.endsWith(`${LOCALHOST_SUFFIX}${LOCALHOST_SUFFIX}`)) {
    host = host.slice(0, -LOCALHOST_SUFFIX.length);
  }

  if (host.endsWith(`${LOCALHOST_SUFFIX}${LOCAL_SUFFIX}`)) {
    host = host.slice(0, -LOCAL_SUFFIX.length);
  }

  return host;
};

export const normalizeSiteHostLoose = (value: string): string => {
  const stripped = stripHostDecorators(value);
  if (!stripped) {
    return '';
  }

  return collapseDuplicateSuffixes(stripped);
};

export const normalizeSiteHost = (value: string): string => {
  let host = normalizeSiteHostLoose(value);
  if (!host) {
    return '';
  }

  if (host.endsWith(LOCAL_SUFFIX)) {
    host = `${host.slice(0, -LOCAL_SUFFIX.length)}${LOCALHOST_SUFFIX}`;
  }

  if (!host.includes('.')) {
    host = `${host}${LOCALHOST_SUFFIX}`;
  }

  return host;
};

export const getSiteHostCandidates = (value: string): string[] => {
  const canonical = normalizeSiteHost(value);
  return canonical ? [canonical] : [];
};
