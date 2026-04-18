import cakeData from "../cakeData.json";
import { GoogleSheetService } from "../services/googlesheet.service";
import moment from "moment-timezone";
interface FlowDecryptedBody {
    screen?: string;
    data?: Record<string, any>;
    version?: string;
    action: "ping" | "INIT" | "data_exchange" | string;
    flow_token?: string;
}

class HelloMyCab {
    private googleSheet = new GoogleSheetService(
        "1B5ai5xsimqjpyw1k6oUxOSFDS4bbxqBlmthwr9zKB3A"
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

            case "DESTINATION_SELECT":
                return this.handleCarDestination(data);

            case "BOOKING_DETAILS":
                return this.handleBookingDetailsScreen(data)
            default:
                throw new Error(`Unhandled screen: ${screen}`);
        }
    }

    /* =========================
       SCREEN HANDLERS
    ========================= */

    private async handleWelcomeScreen(data: any) {
        const sheetData = await this.googleSheet.getAll("Card Price Table");

        // 🔹 Destination list
        const destinations = sheetData.map((item) => ({
            id: item.Destination,
            title: item.Destination.charAt(0) + item.Destination.slice(1).toLowerCase()
        }));

        // 🟡 DUMMY CARS
        const dummyCars = [
            { id: "DZIRE", title: "Dzire", metadata: "₹4000" },
            { id: "ERTIGA", title: "Ertiga", metadata: "₹4500" },
            { id: "CRYSTA", title: "Crysta", metadata: "₹5500" }
        ];

        // 🔥 GLOBAL FLAGS
        const cars_required = data?.destination as string;

        // 🟢 STEP 1: Destination not selected
        return {
            screen: "DESTINATION_SELECT",
            data: {
                phone_number: data?.phone_number,
                destinations: destinations,
                cars: dummyCars,
                cars_required: cars_required
            },
        };
    }

    private async handleCarDestination(data: any) {
        const sheetData = await this.googleSheet.getAll("Card Price Table");

        // 🔹 Destination list
        const destinations = sheetData.map((item) => ({
            id: item.Destination,
            title: item.Destination.charAt(0) + item.Destination.slice(1).toLowerCase()
        }));

        // 🟡 DUMMY CARS
        const dummyCars = [
            { id: "DZIRE", title: "Dzire", metadata: "₹4000" },
            { id: "ERTIGA", title: "Ertiga", metadata: "₹4500" },
            { id: "CRYSTA", title: "Crysta", metadata: "₹5500" }
        ];

        // 🔥 GLOBAL FLAGS
        const cars_required = data?.destination as string;

        // 🟢 STEP 1: Destination not selected
        if (!data?.destination) {
            return {
                screen: "DESTINATION_SELECT",
                data: {
                    phone_number: data?.phone_number,
                    destinations: destinations,
                    cars: dummyCars,
                    cars_required: cars_required
                },
            };
        }

        // 🔥 Find selected row
        const selected = sheetData.find(
            (item) => item.Destination === data.destination
        );

        if (!selected) {
            return {
                screen: "DESTINATION_SELECT",
                data: {
                    phone_number: data?.phone_number,
                    destinations: destinations,
                    cars: dummyCars,
                    cars_required: "false"
                },
            };
        }

        // 🚗 REAL CARS
        const cars = Object.keys(selected)
            .filter((key) => key !== "Destination")
            .map((key) => ({
                id: key.toUpperCase(),
                title: key,
                metadata: `₹${selected[key]}`
            }));

        // 🟣 STEP 2: Car select
        if (!data?.car_type || data.car_type === "") {
            return {
                screen: "DESTINATION_SELECT",
                data: {
                    phone_number: data?.phone_number,
                    destination: data.destination,
                    cars: cars,
                    cars_required: "true"
                },
            };
        }

        // 🔥 SAFE PRICE FETCH
        const selectedCarKey = Object.keys(selected).find(
            (key) => key.toUpperCase() === data.car_type
        );

        const price = selectedCarKey ? selected[selectedCarKey] : null;

        return {
            screen: "BOOKING_DETAILS",
            data: {
                phone_number: data?.phone_number,
                destination: data.destination,
                car_type: data.car_type,
                price: `₹${price}`,
                time_enabled: "false",
                times: [
                    {
                        "id": "13",
                        "title": "1 PM"
                    },
                    {
                        "id": "14",
                        "title": "2 PM"
                    },
                    {
                        "id": "15",
                        "title": "3 PM"
                    },
                    {
                        "id": "16",
                        "title": "4 PM"
                    }
                ]
            },
        };
    }

    private async handleBookingDetailsScreen(data: any) {
        const { date, hour } = data;

        const nowIST = moment().tz("Asia/Kolkata");

        const selectedDate = moment(date).tz("Asia/Kolkata").startOf("day");

        let startTime;
        let endTime;

        const isToday = selectedDate.isSame(nowIST, "day");

        if (isToday) {
            // ⏰ current + 2 hours
            const minTime = nowIST.clone().add(2, "hours");

            // ❌ अगर next day me chala gaya → no slots
            if (!minTime.isSame(nowIST, "day")) {
                return {
                    screen: "BOOKING_DETAILS",
                    data: {
                        time_enabled: "false",
                        error: "No slots available for today. Please select next date 🙏"
                    }
                };
            }

            startTime = minTime.clone().startOf("hour");
            endTime = nowIST.clone().hour(22).minute(0); // 10 PM
        } else {
            // 🟢 future date
            startTime = selectedDate.clone().hour(6).minute(0); // 6 AM
            endTime = selectedDate.clone().hour(22).minute(0); // 10 PM
        }

        const times: any[] = [];

        let current = startTime.clone();

        while (current.isSameOrBefore(endTime)) {
            times.push({
                id: current.format("HH:mm"),
                title: current.format("h A")
            });

            current.add(1, "hour");
        }

        // 🔥 अगर date + time dono aa gaya → summary
        if (date && hour) {

            const datetime = moment.tz(
                `${date} ${hour}:${data.minute || "00"}`,
                "YYYY-MM-DD HH:mm",
                "Asia/Kolkata"
            );

            return {
                screen: "SUMMARY",
                data: {
                    phone_number: data.phone_number,
                    destination: data.destination,
                    car_type: data.car_type,
                    alternate_phone: data.alternate_phone || "",
                    notes: data.notes || "",
                    date_time: datetime.format("DD MMM YYYY, h:mm A"),
                    price: data.price
                }
            };
        }

        return {
            screen: "BOOKING_DETAILS",
            data: {
                time_enabled: "true",
                times: times
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

export default HelloMyCab;
