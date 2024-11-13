export class PathOperator {
	// Function to check if a segment is a path parameter
	static isParam(segment) {
		return segment.startsWith('{') && segment.endsWith('}');
	}

	// Function to check if the segment is a wildcard
	static isWildcard(segment) {
		return segment === '{.+}';
	}

	// Function to match the paths and return the count of matched segments
	static match(configPath, requestPath, requestMethod, configMethod) {
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

		const params = {}; // Initialize an empty object to store parameters

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
				const paramName = configSegments[i].slice(1, -1); // Extract the parameter name without the first and last character
                params[paramName] = requestSegments[i]; // Store the parameter value
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
			params: params, // Include the parameters in the result
		};
	}
}
