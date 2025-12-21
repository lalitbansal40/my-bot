import axios from "axios";
import dotenv from "dotenv";
dotenv.config();
/* =========================
   SESSION MANAGEMENT
========================= */

export interface UserSession {
  longitude: any;
  latitude: any;
  step:
  | "CHOOSE_LANGUAGE" // New step
  | "WAITING_FOR_LOCATION"
  | "CONFIRM_ADDRESS"
  | "CHOOSE_CAKE_TYPE"
  | "FLOW_COMPLETED"
  | "PAYMENT_LINK_SENT";
  language?: "ENGLISH" | "HINDI"; // Store preference
  location?: { latitude: number; longitude: number } | null;
  address?: string;
  structuredAddress?: any;
  bill: any
}

const sessions = new Map<string, UserSession>();


export const getSession = (user: string): UserSession | undefined =>
  sessions.get(user);

export const setSession = (user: string, data: UserSession) =>
  sessions.set(user, data);

export const clearSession = (user: string) =>
  sessions.delete(user);

/* =========================
   GEOCODING
========================= */

const GOOGLE_MAPS_KEY = process.env.GOOGLE_MAPS_KEY!;

export const reverseGeocode = async (
  latitude: number,
  longitude: number
): Promise<string> => {
  try {
    const res = await axios.get(
      "https://maps.googleapis.com/maps/api/geocode/json",
      {
        params: {
          latlng: `${latitude},${longitude}`,
          key: GOOGLE_MAPS_KEY
        },
      }
    );

    return (
      res.data?.results?.[0]?.formatted_address ||
      "Address not found"
    );
  } catch (error) {
    console.error("reverseGeocode error:", error);
    return "Address not found";
  }
};
