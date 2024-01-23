// Define types for clarity
type JWTHeader = {
    alg: string;
    typ: string;
    kid?: string;
};

type JWTPayload = {
    [key: string]: any;
};


async function jwtAuth(request: Request): Promise<boolean> {
    const jwt = getJWTFromRequest(request);
    if (!jwt) return false;

    const publicKey = await importPublicKey("YOUR_PUBLIC_KEY_HERE");
    return await verifyJWT(jwt, publicKey);
}

// Function to extract the JWT from the Authorization header
function getJWTFromRequest(request: Request): string | null {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return null;

    const match = authHeader.match(/^Bearer (.+)$/i);
    return match ? match[1] : null;
}

// Function to parse a JWT
function parseJWT(token: string): { header: JWTHeader; payload: JWTPayload; signature: Uint8Array } {
    const [headerB64, payloadB64, signatureHex] = token.split('.');

    const header = JSON.parse(atob(headerB64)) as JWTHeader;
    const payload = JSON.parse(atob(payloadB64)) as JWTPayload;
    const signature = Uint8Array.from(atob(signatureHex).split("").map(c => c.charCodeAt(0)));

    return { header, payload, signature };
}

// Function to verify the JWT
async function verifyJWT(token: string, publicKey: CryptoKey): Promise<boolean> {
    const { header, payload, signature } = parseJWT(token);

    // Construct the signed content
    const signedContent = new TextEncoder().encode([header, payload].join('.'));

    // Verify the signature
    return await crypto.subtle.verify(
        {
            name: "RSASSA-PKCS1-v1_5",
            hash: { name: "SHA-256" }, // Adjust depending on the algorithm
        },
        publicKey, // The public key
        signature, // The signature to verify
        signedContent // The data that was signed
    );
}

// Function to import a public key from a string
async function importPublicKey(pem: string): Promise<CryptoKey> {
    // Fetch your public key and convert it from PEM format to a format usable by Web Crypto
    // This example assumes RSASSA-PKCS1-v1_5 with SHA-256, adjust as needed
    const binaryDerString = atob(pem.replace(/-----[^\n]+-----|\n/g, ''));
    const binaryDer = str2ab(binaryDerString);

    return await crypto.subtle.importKey(
        "spki",
        binaryDer,
        {
            name: "RSASSA-PKCS1-v1_5",
            hash: "SHA-256",
        },
        true,
        ["verify"]
    );
}

// Utility function to convert a base64 string to ArrayBuffer
function str2ab(str: string): ArrayBuffer {
    const buf = new ArrayBuffer(str.length);
    const bufView = new Uint8Array(buf);
    for (let i = 0, strLen = str.length; i < strLen; i++) {
        bufView[i] = str.charCodeAt(i);
    }
    return buf;
}
