import { PathConfig as Path, Server } from './configs/gateway-config';

// Function to create a new request based on the matched path and server
function createProxiedRequest(request: Request, server: Server, matchedPath: Path): Request {
	const requestUrl = new URL(request.url);
	let newPath = '';

	if (matchedPath.integration && matchedPath.integration.type === 'http_proxy') {
		// For 'http_proxy', use the original path without the matching part
		const matchedPathPart = matchedPath.path.replace('{.+}', '');
		newPath = requestUrl.pathname.replace(matchedPathPart, '/');
		console.log('New path:', newPath);
	}

	// Create the new request with the updated URL
	const newRequest = new Request(server.url + newPath + requestUrl.search, request);
	return newRequest;
}

export { createProxiedRequest };

export interface MatchedPath {
	matchedCount: number;
	isExact: boolean;
	isWildcard: boolean;
	methodMatches: boolean;
}

export class PathOperator {
	// Function to check if a segment is a path parameter
	private static isParam(segment: string): boolean {
		return segment.startsWith('{') && segment.endsWith('}');
	}

	// Function to check if the segment is a wildcard
	private static isWildcard(segment: string): boolean {
		return segment === '{.+}';
	}

	// Function to match the paths and return the count of matched segments
	static match(configPath: string, requestPath: string, requestMethod: string, configMethod: string): MatchedPath {
		const configSegments = configPath.split('/');
		const requestSegments = requestPath.split('/');
		let matchedSegments = 0;
		let isExact = true;
		let isWildcardUsed = false;
		// Method match check
		const methodMatches = requestMethod === configMethod || configMethod === 'ANY';

		if (!methodMatches) {
			return { matchedCount: 0, isExact: false, isWildcard: false, methodMatches: methodMatches };
		}

		if (!this.isWildcard(configSegments[configSegments.length - 1]) && requestSegments.length !== configSegments.length) {
			return { matchedCount: 0, isExact: false, isWildcard: false, methodMatches: methodMatches };
		}

		if (this.isWildcard(configSegments[configSegments.length - 1]) && requestSegments.length < configSegments.length - 1) {
			return { matchedCount: 0, isExact: false, isWildcard: false, methodMatches: methodMatches };
		}

		for (let i = 0; i < Math.max(configSegments.length, requestSegments.length); i++) {
			if (i < configSegments.length && this.isWildcard(configSegments[i])) {
				isWildcardUsed = true;
				matchedSegments = Math.min(configSegments.length, requestSegments.length); // Wildcard matches all corresponding segments
				break;
			}

			if (i >= configSegments.length || i >= requestSegments.length) {
				isExact = false;
				break; // Reached the end of one of the paths
			}

			if (this.isParam(configSegments[i])) {
				isExact = false; // Found a parameterized segment, so it's not an exact match
				matchedSegments++;
			} else if (configSegments[i] === requestSegments[i]) {
				matchedSegments++; // Exact match for this segment
			} else {
				return { matchedCount: 0, isExact: false, isWildcard: false, methodMatches: methodMatches }; // Mismatch found
			}
		}

		return {
			matchedCount: matchedSegments,
			isExact: isExact && matchedSegments === configSegments.length && matchedSegments === requestSegments.length,
			isWildcard: isWildcardUsed,
			methodMatches: methodMatches, // Include method match status
		};
	}
}
