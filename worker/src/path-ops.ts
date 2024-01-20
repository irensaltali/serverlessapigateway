// Function to check if a segment is a path parameter
function isPathParam(segment: string): boolean {
    return segment.startsWith('{') && segment.endsWith('}');
}

// Function to check if the segment is a wildcard
function isWildcard(segment: string): boolean {
    return segment === '{.+}';
}

// Function to match the paths
function pathsMatch(apiPath: string, urlPath: string): boolean {
    const apiSegments = apiPath.split('/');
    const urlSegments = urlPath.split('/');

    for (let i = 0; i < apiSegments.length; i++) {
        // If the API segment is a wildcard, the rest of the URL path is automatically accepted
        if (isWildcard(apiSegments[i])) {
            return true;
        }

        // If the number of URL segments is less than API path segments and it's not a wildcard, it's a mismatch
        if (i >= urlSegments.length) {
            return false;
        }

        // Compare non-parameter segments
        if (!isPathParam(apiSegments[i]) && apiSegments[i] !== urlSegments[i]) {
            return false;
        }
    }

    // If URL has more segments than the API path (without wildcard), it's a mismatch
    return urlSegments.length === apiSegments.length;
}

export { pathsMatch };
