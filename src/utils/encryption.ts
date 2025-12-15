import crypto from "crypto";

/**
 * WhatsApp Flow encrypted request body structure
 */
export interface EncryptedFlowRequestBody {
  encrypted_aes_key: string;
  encrypted_flow_data: string;
  initial_vector: string;
}

/**
 * Decrypted Flow Response
 */
export interface DecryptRequestResult<T = any> {
  decryptedBody: T;
  aesKeyBuffer: Buffer;
  initialVectorBuffer: Buffer;
}

/**
 * Custom exception for Flow endpoints
 */
export class FlowEndpointException extends Error {
  public statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "FlowEndpointException";
    this.statusCode = statusCode;
  }
}

/**
 * Decrypt incoming WhatsApp Flow request
 */
export const decryptRequest = <T = any>(
  body: EncryptedFlowRequestBody,
  privatePem: string | Buffer,
  passphrase?: string
): DecryptRequestResult<T> => {
  const { encrypted_aes_key, encrypted_flow_data, initial_vector } = body;

  const privateKey = crypto.createPrivateKey({
    key: privatePem,
    passphrase,
  });

  let decryptedAesKey: Buffer;

  try {
    decryptedAesKey = crypto.privateDecrypt(
      {
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      Buffer.from(encrypted_aes_key, "base64")
    );
  } catch (error) {
    console.error("Error during RSA decryption:", error);
    throw new FlowEndpointException(
      421,
      "Failed to decrypt the request. Please verify your private key."
    );
  }

  const flowDataBuffer = Buffer.from(encrypted_flow_data, "base64");
  const initialVectorBuffer = Buffer.from(initial_vector, "base64");

  const TAG_LENGTH = 16;
  const encryptedFlowDataBody = flowDataBuffer.subarray(0, -TAG_LENGTH);
  const encryptedFlowDataTag = flowDataBuffer.subarray(-TAG_LENGTH);

  const decipher = crypto.createDecipheriv(
    "aes-128-gcm",
    decryptedAesKey,
    initialVectorBuffer
  );

  decipher.setAuthTag(encryptedFlowDataTag);

  const decryptedJSONString = Buffer.concat([
    decipher.update(encryptedFlowDataBody),
    decipher.final(),
  ]).toString("utf-8");

  return {
    decryptedBody: JSON.parse(decryptedJSONString) as T,
    aesKeyBuffer: decryptedAesKey,
    initialVectorBuffer,
  };
};

/**
 * Encrypt response back to WhatsApp Flow
 */
export const encryptResponse = (
  response: unknown,
  aesKeyBuffer: Buffer,
  initialVectorBuffer: Buffer
): string => {
  if (!Buffer.isBuffer(aesKeyBuffer) || !Buffer.isBuffer(initialVectorBuffer)) {
    throw new Error("aesKeyBuffer and initialVectorBuffer must be Buffers");
  }

  // Flip IV bits (Meta WhatsApp Flow requirement)
  const flippedIV = Buffer.from(
    initialVectorBuffer.map((byte) => ~byte & 0xff)
  );

  const cipher = crypto.createCipheriv(
    "aes-128-gcm",
    aesKeyBuffer,
    flippedIV
  );

  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(response), "utf-8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return Buffer.concat([encrypted, authTag]).toString("base64");
};
