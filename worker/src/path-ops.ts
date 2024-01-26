// Function to check if a segment is a path parameter
function isPathParam(segment: string): boolean {
    return segment.startsWith('{') && segment.endsWith('}');
}

// Function to check if the segment is a wildcard
function isWildcard(segment: string): boolean {
    return segment === '{.+}';
}

// Function to match the paths and return the count of matched segments
function pathsMatch(apiPath: string, urlPath: string): number {
    const apiSegments = apiPath.split('/');
    const urlSegments = urlPath.split('/');
    let matchedSegments = 0;

    for (let i = 0; i < apiSegments.length; i++) {
        if (isWildcard(apiSegments[i])) {
            return apiSegments.length; // Wildcard matches all remaining segments
        }

        if (i >= urlSegments.length) {
            break; // No more URL segments to compare
        }

        if (!isPathParam(apiSegments[i]) && apiSegments[i] !== urlSegments[i]) {
            break; // Segment mismatch
        }

        matchedSegments++;
    }

    // Check if URL segments exactly match API path segments
    if (matchedSegments === apiSegments.length && matchedSegments === urlSegments.length) {
        return matchedSegments;
    }

    return 0; // Mismatch or partial match
}

export { pathsMatch };
