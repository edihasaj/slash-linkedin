export const LINKEDIN_BASE = 'https://www.linkedin.com';
export const VOYAGER_BASE = 'https://www.linkedin.com/voyager/api';

export const DEFAULT_USER_AGENT =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// voyager-web client version sent in x-li-track. Bumped occasionally by LinkedIn;
// a slightly stale value is tolerated by the API.
export const VOYAGER_CLIENT_VERSION = '1.13.21';

export const NORMALIZED_ACCEPT = 'application/vnd.linkedin.normalized+json+2.1';

export const MAX_POST_CHARS = 3000;

// GraphQL query IDs for the reshare mutations, captured from voyager-web. LinkedIn
// rotates these alongside the client bundle; if a reshare starts returning 400/404,
// re-capture them from the network tab (action=execute&queryId=…) and bump here.
export const RESHARE_QUERY_ID = 'voyagerFeedDashReposts.a0663ae5c654123343da36617d2dbfde';
export const RESHARE_WITH_THOUGHTS_QUERY_ID = 'voyagerContentcreationDashShares.279996efa5064c01775d5aff003d9377';
