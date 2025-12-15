import cakeData from "../../cakedata.json"
interface FlowDecryptedBody {
    screen?: string;
    data?: Record<string, any>;
    version?: string;
    action: "ping" | "INIT" | "data_exchange" | string;
    flow_token?: string;
}

/**
 * Livpure Lead Flow Class
 */
class CakeArena {
    public getNextScreen = async (
        decryptedBody: FlowDecryptedBody
    ): Promise<Record<string, any>> => {
        try {
            const { screen, data, action } = decryptedBody;

            // Health check
            if (action === "ping") {
                return {
                    data: {
                        status: "active",
                    },
                };
            }

            // Client-side error acknowledgement
            if (data?.error) {
                console.warn("Received client error:", data);
                return {
                    data: {
                        acknowledged: true,
                    },
                };
            }

            // Initial flow load
            if (action === "INIT") {
                return {
                    screen: "WELCOME_SCREEN",
                    data: {
                        cakeData,
                    },
                };
            }
            // Data exchange between screens
            if (action === "data_exchange") {
                switch (screen) {
                    case "WELCOME_SCREEN": {
                        return {
                            screen: "CAKE_SELECTION",
                            data: {
                                phone_number: data?.phone_number
                            },
                        };
                    }


                    default:
                        break;
                }
            }

            console.error("Unhandled request body:", decryptedBody);
            throw new Error(
                "Unhandled endpoint request. Make sure you handle the request action & screen logged above."
            );
        } catch (error) {
            console.error("error while handling flow trigger", error);
            throw error;
        }
    };
}

export default CakeArena;
