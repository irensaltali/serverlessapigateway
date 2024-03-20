function setPoweredByHeader(response: Response) {
	const headers = new Headers(response.headers);
	headers.set('X-Powered-By', 'github.com/irensaltali/serverlessapigateway');

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: headers,
	});
}

export { setPoweredByHeader };
