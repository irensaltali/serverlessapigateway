export const badRequestResponse = () =>
	new Response(JSON.stringify({ message: 'Bad request' }), { headers: { 'Content-Type': 'application/json' }, status: 400 });
export const noMatchResponse = () =>
	new Response(JSON.stringify({ message: 'No match found.' }), { headers: { 'Content-Type': 'application/json' }, status: 404 });
export const unauthorizedResponse = () =>
	new Response(JSON.stringify({ message: 'Unauthorized' }), { headers: { 'Content-Type': 'application/json' }, status: 401 });
export const forbiddenResponse = () =>
	new Response(JSON.stringify({ message: 'Forbidden' }), { headers: { 'Content-Type': 'application/json' }, status: 403 });
export const notFoundResponse = () =>
	new Response(JSON.stringify({ message: 'Not found' }), { headers: { 'Content-Type': 'application/json' }, status: 404 });
export const internalServerErrorResponse = () =>
	new Response(JSON.stringify({ message: 'Internal server error' }), { headers: { 'Content-Type': 'application/json' }, status: 500 });
export const configIsMissingResponse = () =>
	new Response(JSON.stringify({ message: 'API configuration is missing' }), { headers: { 'Content-Type': 'application/json' }, status: 501 });
