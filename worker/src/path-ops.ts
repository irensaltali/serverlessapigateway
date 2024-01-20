function isPathParam(segment: string): boolean {
	return segment.startsWith('{') && segment.endsWith('}');
}

// Function to match the paths
function pathsMatch(apiPath: string, urlPath: string): boolean {
	const apiSegments = apiPath.split('/');
	const urlSegments = urlPath.split('/');

	// Ensure the paths have the same number of segments
	if (apiSegments.length !== urlSegments.length) {
		return false;
	}

	// Compare each segment
	for (let i = 0; i < apiSegments.length; i++) {
		if (!isPathParam(apiSegments[i]) && apiSegments[i] !== urlSegments[i]) {
			return false;
		}
	}

	return true;
}

export { pathsMatch };
