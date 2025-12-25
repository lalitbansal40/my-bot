import { decryptRequest, DecryptRequestResult, encryptResponse, FlowEndpointException } from "../utils/encryption";
import { Request, Response } from "express";
import vendors from "../utils/vendors";
const PRIVATE_KEY = `-----BEGIN ENCRYPTED PRIVATE KEY-----
MIIFJDBWBgkqhkiG9w0BBQ0wSTAxBgkqhkiG9w0BBQwwJAQQ+qf6sAUFg/1rHU5b
20EJFQICCAAwDAYIKoZIhvcNAgkFADAUBggqhkiG9w0DBwQI+3uoPFHWXzYEggTI
xidLInOCrd37NTEyWEk0HI9IvZC3HRZ3JihvvksyQemxFw9ReTRdI79KIijMU5wF
Few2omkE+/OzpF+mfnLO13vt0guFIiTs1TAo1bIQnVn41x4BEVDeSmQ8tg9ASqfJ
YCr9/cj97dQwpGy201d+bIfGUxVOhLZU8npAJMeUfSEeX68/luizUNvhdm4LgFjd
hES34k9WPZLZNCZw51LOl+8J9PqweZMm+IETPgGF7usG6FGSmpE4IZQaNAYpAmoV
kJ+lPisUzwacxRSF6dKfoADpo5WKZ6wvdbbHRkMUky3TmzqIHraRVZOMEIhHC9K/
c0eVSeGUpJwxL9WsdUaDm7+89+6bdJWAXCBS++hi/G1O9BLMbHXSmZoEdvxXoFd1
fNFZa3vViUL18Wm234noRSg/hXMxRTvAE64ldRQ2vlcNYLpw2DCzsdHP8qMaufAH
TZBHBHdfF4UJEgHdKQqFnTPssrLeqBp+1OHZ7Bfx+Mjjhw2LzN9XK7opRpBnmTOp
KOFHTeKXo8Rww2Y8beFx/FJFfK68/nKUTlBqhngMwoG0fpf3ulUCKxlzAx3YfWpI
LPVc2yDr4n8WEChXNGHobmUci2ysNOjao4m2hUgXqnUYss7zXOFfhv58DoaxjMy0
S3qvL7UHGOf47BCXNiUMfyloEA4itOL5B9xFLXBdhlxZTLBcreeo0a/ptoOVzd3b
9AXA8QqlXBGGyIfspZ1n1W0ZV2BzaJHEiYCD605BbN62NJuPFqlixKelqBt82aT8
+cUdyf6w54Xb1loy8A3VW9r7ezYdlEPrhvP+xAON+4Lw7QOkSb+hxERJx1ZxNAfZ
TwsowzwRW+SshpbqjGl2tv3niyvk7406iwuh/8mCCsfhM6YRxDK/flk5iJYhYlID
/wi2KWZ9KyWbEJAbblP/cu3/svzGLMYfoN5HQiSpS2IwvS7VT/qPc95eGpU7BRvl
uP4Ej8Ew/5hGXXq7tL/rbnM38ksYf8ELUPDW9QXndZmMiPzeckOJrM3tOj+bv8wk
M6zaJK29tdoTD3Rdx+uf4orNWerrlz48AxKwQrf6iK2Un2XuL/+l9fLvBgEzpOrV
g03+n7F+5/CNHDWGeD5v+oZHwCBmv2YHrV/hc3MLv/LRgKWSwmU9KRPhvbJ6Bxg1
NBPCCsBxkY74ZdATDpcE6U47FqJpqG5VRFztUxEHtv5dQqAQe91Wxo13DWf4S06f
AmW3Zq7UB4M2Jqa63v56AMY0HdVH55odJMroTWkV02lf2tIARXwLzPLUtpf5kBHH
wI7BEAYHpytTaLlpoGIQkMJ2rsFRWshDdJ01SvU5E+T03Y8BdBABeeLdxpt7XVfm
1dLmqMUjTrN6tB3m6cbsZHFDZ3WSKoSVWYs7GWlaSEsKqn1VjpZkl6jTBez7JvFk
GbjzLhLipQfmT6exv7JzPdVNyK8X8qVB1fuOW2sx/7GBXFbF1RBFZMcICSNrJGlJ
pNMP7h7TbwcnChNhiRnuHaDOSZaVopzmtx9YeHN9dB0x/bYYO8HsIe7utN8txN6Y
Jqp9LDQLetlp2ZVgwxtZaN2IYsdJSmraRIWazb09pfhGB9yXte0fDvtTz2FRYhQI
Jjf6S9WfUN7SDVDuzEH1nHABHdlBa1AL
-----END ENCRYPTED PRIVATE KEY-----`;




export const whatsappFlowController = async (event: any) => {
  try {
    console.log("eventJson ::", JSON.stringify(event));

    /* ===============================
       1️⃣ Extract appName SAFELY
    =============================== */
    let appName: string | undefined;

    if (event.pathParameters?.appName) {
      // API Gateway style
      appName = event.pathParameters.appName;
    } else if (event.rawPath) {
      // Lambda Function URL style
      // /whatsappflow/cake-arena
      const parts = event.rawPath.split("/").filter(Boolean);
      appName = parts[1]; // index 0 = whatsappflow, 1 = appName
    }

    if (!appName) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "appName not found in path" }),
      };
    }

    /* ===============================
       2️⃣ Validate private key
    =============================== */
    if (!process.env.PRIVATE_KEY) {
      throw new Error(
        'Private key is empty. Please check env variable "PRIVATE_KEY".'
      );
    }

    const PRIVATE_KEY = process.env.PRIVATE_KEY.replace(/\\n/g, "\n");

    /* ===============================
       3️⃣ Parse body
    =============================== */
    const body =
      typeof event.body === "string"
        ? JSON.parse(event.body)
        : event.body;

    /* ===============================
       4️⃣ Decrypt request
    =============================== */
    let decryptedRequest;

    try {
      decryptedRequest = decryptRequest(
        body,
        PRIVATE_KEY,
        process.env.PASSPHRASE
      );
    } catch (err: any) {
      if (err instanceof FlowEndpointException) {
        return { statusCode: err.statusCode, body: "" };
      }
      return { statusCode: 500, body: "" };
    }

    const { aesKeyBuffer, initialVectorBuffer, decryptedBody } =
      decryptedRequest;

    console.log("💬 Decrypted Request:", decryptedBody);

    /* ===============================
       5️⃣ Resolve vendor
    =============================== */
    const VendorFlowClass = vendors[appName]?.flowAppClass;

    if (!VendorFlowClass) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          errors: {
            message: `Invalid appName "${appName}". No flow app registered.`,
          },
        }),
      };
    }

    const flowAppObj = new VendorFlowClass();

    const screenResponse = await flowAppObj.getNextScreen(
      decryptedBody,
      appName
    );

    /* ===============================
       6️⃣ Encrypt response
    =============================== */
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/octet-stream" },
      body: encryptResponse(
        screenResponse,
        aesKeyBuffer,
        initialVectorBuffer
      ),
    };
  } catch (error) {
    console.error("Flow controller error:", error);

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        errors: {
          message:
            "Unhandled endpoint request. Make sure you handle the request action & screen logged above.",
        },
      }),
    };
  }
};
