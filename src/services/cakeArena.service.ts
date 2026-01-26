import cakeData from "../cakeData.json";
import { BorzoApiClient } from "./borzo.service";
import { GoogleSheetService } from "./googlesheet.service";

interface FlowDecryptedBody {
    screen?: string;
    data?: Record<string, any>;
    version?: string;
    action: "ping" | "INIT" | "data_exchange" | string;
    flow_token?: string;
}

class CakeArena {
    private googleSheet = new GoogleSheetService(
        "1xlAP136l66VtTjoMkdTEueo-FXKD7_L1RJUlaxefXzI"
    );


    /* =========================
       MAIN ENTRY POINT
    ========================= */

    public getNextScreen = async (
        decryptedBody: FlowDecryptedBody
    ): Promise<Record<string, any>> => {
        const { action, screen, data } = decryptedBody;

        if (action === "ping") return this.healthCheck();
        if (action === "INIT") return this.initFlow(data);
        if (data?.error) return this.acknowledgeClientError(data);

        if (action === "data_exchange") {
            return this.handleDataExchange(screen, data);
        }

        throw new Error("Unhandled flow request");
    };

    /* =========================
       FLOW HANDLERS
    ========================= */

    private async handleDataExchange(
        screen?: string,
        data?: Record<string, any>
    ) {
        switch (screen) {
            case "WELCOME_SCREEN":
                return this.handleWelcomeScreen(data);

            case "CAKE_SELECTION":
                return this.handleCakeSelection(data);

            default:
                throw new Error(`Unhandled screen: ${screen}`);
        }
    }

    /* =========================
       SCREEN HANDLERS
    ========================= */

    private async handleWelcomeScreen(data: any) {
        const cakes = await this.googleSheet.getAll("cake data");

        const availableCakes = cakes
            .filter(cake => cake.instock === "TRUE")
            .map(cake => {
                const image = cakeData.find(c => c.id === cake.id)?.image;
                return {
                    id: cake.id,
                    title: cake.title,
                    metadata: `₹${cake.metadata}`,
                    description: cake.description,
                    image,
                };
            });

        return {
            screen: "CAKE_SELECTION",
            data: {
                phone_number: data?.phone_number,
                cakeData: availableCakes,
            },
        };
    }

    private async handleCakeSelection(data: any) {
        try {
            const phone = data?.phone_number;
            const selectedCakeIds: string[] = data?.selected_cake || [];
            if (!phone || !selectedCakeIds.length) {
                throw new Error("Invalid input");
            }

            const cakes = await this.googleSheet.getAll("cake data");
            const selectedCakes = cakes.filter(c =>
                selectedCakeIds.includes(c.id)
            );

            if (!selectedCakes.length) {
                throw new Error("No cakes selected");
            }

            const items = selectedCakes.map(cake => ({
                name: cake.title,
                price: Number(cake.metadata),
            }));

            const itemsTotal = this.calculateTotal(items);


            const grandTotal = itemsTotal;

            return this.buildBillSummaryResponse({
                phone,
                items,
                itemsTotal,
                grandTotal,
                selectedCakeIds,
            });
        } catch (error: any) {
            return this.errorScreen(error.message);
        }
    }

    /* =========================
       BUSINESS LOGIC
    ========================= */

    private calculateTotal(items: { price: number }[]) {
        return items.reduce((sum, i) => sum + i.price, 0);
    }

    /* =========================
       RESPONSE BUILDERS
    ========================= */

    private buildBillSummaryResponse({
        phone,
        items,
        itemsTotal,
        grandTotal,
        selectedCakeIds,
    }: any) {
        const itemsText = items
            .map((i: any, idx: any) => `${idx + 1}. ${i.name} - ₹${i.price}`)
            .join("\n");

        return {
            screen: "BILL_SUMMARY",
            data: {
                phone_number: phone,
                cakeData: selectedCakeIds.join(", "),
                items_text: itemsText,
                items_total: itemsTotal,
                total_amount: grandTotal,
                message: `
🍰 YOUR ORDER

${itemsText}

━━━━━━━━━━━━━━━
🛍 ITEMS TOTAL
₹${itemsTotal}
`.trim()
            },
        };
    }

    private errorScreen(message: string) {
        return {
            screen: "ERROR",
            data: {
                message,
            },
        };
    }


    private healthCheck() {
        return { data: { status: "active" } };
    }

    private initFlow(data: any) {
        return {
            screen: "WELCOME_SCREEN",
            data: {
                phone_number: data.phone_number,
            },
        };
    }

    private acknowledgeClientError(data: any) {
        console.warn("Client error:", data);

        return {
            screen: "CAKE_SELECTION", // ✅ existing screen
            data: {
                error_message: data.error_message || "Something went wrong. Please try again.",
            },
        };
    }

}

export default CakeArena;
