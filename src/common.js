function safeStringify(obj) {
    return JSON.stringify(obj, (key, value) => {
        // Check if the value is a function, undefined, symbol, or a Promise
        if (typeof value === 'function' || 
            typeof value === 'undefined' || 
            typeof value === 'symbol' || 
            (typeof value === 'object' && value !== null && typeof value.then === 'function')) {
            return undefined; // Exclude these values
        }
        return value; // Include all other values
    });
}


export { safeStringify };
