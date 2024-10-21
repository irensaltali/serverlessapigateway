export const noMatchResponse = () =>
	new Response(JSON.stringify({ message: 'No match found.' }), { headers: { 'Content-Type': 'application/json' }, status: 404 });
export const unauthorizedResponse = () =>
	new Response(JSON.stringify({ message: 'Unauthorized' }), { headers: { 'Content-Type': 'application/json' }, status: 401 });
export const internalServerErrorResponse = () =>
	new Response(JSON.stringify({ message: 'Internal server error' }), { headers: { 'Content-Type': 'application/json' }, status: 500 });
